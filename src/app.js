// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client (the SDK's GladysIntegration, or
// its fake Gladys in the tests).
//
// Life of the integration:
// 1. On connection and on every configuration change: the inverters kept in
//    /data are published at once, then AhoyDTU is read (discovery) and its
//    inverters published again.
// 2. Every refresh interval (10 to 60 s), the container's own timer runs a
//    cycle: /api/index, then the values of each reachable inverter, then the
//    states that changed, the scene events, the widget nudge. Gladys's onPoll
//    is only a fallback, skipped when the timer just ran
//    (GladysAssistant/Gladys#3198: a device created without should_poll is
//    never polled by Gladys 5.2).
// 3. Only the inverters the user added are refreshed: without any, nothing is
//    read after the discovery (except for the widget).
//
// Logs: info for the life cycle only (start, DTU found, lost and back, one
// line per user action); a normal cycle writes debug lines only.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from './config.js';
import { createClient, httpRequest } from './ahoy/client.js';
import { createAhoyService } from './ahoy/service.js';
import { buildDevices, buildStates, inverterIds } from './devices.js';
import { createPresence } from './presence.js';
import { createTriggerWatcher, displayName } from './triggers.js';
import { createIssueLog } from './issues.js';
import { MESSAGES } from './i18n.js';
import {
  WIDGET_KEY,
  buildProductionContent,
  noDataContent,
  notConfiguredContent,
} from './widgets.js';

export const ACTIONS = { testConnection: 'test_connection', setPowerLimit: 'set_power_limit' };
export const SCENE_ACTIONS = { setPowerLimit: 'set_power_limit' };
export const WIDGETS = [WIDGET_KEY];

// A value that does not change is published again after this delay, so
// Gladys never shows "no recent value" (it does past 48 hours).
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// The configuration of the DTU is read again this often (an inverter added
// in Ahoy): cheap, and it never removes a device.
export const REDISCOVERY_MS = 30 * 60 * 1000;
const WIDGET_NUDGE_MS = 60 * 1000;

export const POWER_LIMIT_MIN = 2;
export const POWER_LIMIT_MAX = 100;

/**
 * A failed action: Gladys shows the thrown message in red, the returned one
 * in green. The message is the multi-language object.
 */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration or the SDK's fake Gladys
 * @param {{ read: Function, write: Function }} options.store /data
 * @param {Function} [options.transport] HTTP request (node:http by default)
 * @param {object} [options.logger]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the refresh timer (tests may drive cycles by hand)
 * @param {string} [options.timeZone] defaults to TZ
 */
export function createApp({
  gladys,
  store,
  transport = httpRequest,
  logger = createLogger({ name: 'ahoydtu' }),
  now = () => Date.now(),
  timers = true,
  timeZone = process.env.TZ || undefined,
}) {
  const issues = createIssueLog(logger);
  const presence = createPresence({ timeZone });
  const triggers = createTriggerWatcher({ gladys, logger, now });

  let config = normalizeConfig(DEFAULT_CONFIG);
  let service = null;
  let timer = null;
  let stopped = false;
  let running = null;
  let lastCycleAt = -Infinity;
  let discoveredAt = -Infinity;
  let lastNudgeAt = -Infinity;
  let lastEntries = null; // presence entries of the last cycle
  let lastUpdateAt = null;
  let reachable = null; // null: not known yet

  // --- Helpers -----------------------------------------------------------------

  /** Our inverters that the user added to Gladys, and their feature ids. */
  function createdOnGladys() {
    const features = new Set();
    const devices = new Set();
    const inventory = service?.inventory;
    if (!inventory) {
      return { devices, features };
    }
    const ours = new Set(inventory.inverters.map((inv) => inverterIds(gladys, inv).device));
    for (const device of gladys.devices ?? []) {
      if (ours.has(device.external_id)) {
        devices.add(device.external_id);
        for (const feature of device.features ?? []) {
          features.add(feature.external_id);
        }
      }
    }
    return { devices, features };
  }

  async function setStatus(connected, message) {
    await gladys.setConnectionStatus(connected, message).catch((err) => {
      logger.debug(`Connection status not sent (${err.message})`);
    });
  }

  async function publishTransports(transport) {
    const { devices } = createdOnGladys();
    if (devices.size === 0) {
      return;
    }
    await gladys
      .publishTransports([...devices].map((external_id) => ({ external_id, transport })))
      .catch((err) => logger.debug(`Transport badges not sent (${err.message})`));
  }

  async function markReachable() {
    if (reachable === true) {
      return;
    }
    reachable = true;
    issues.ok('dtu', 'AhoyDTU answers again');
    await setStatus(true);
    await publishTransports('local');
  }

  async function markUnreachable(err) {
    issues.fail('dtu', `AhoyDTU unreachable at ${config.baseUrl} (${err.message})`);
    if (reachable === false) {
      return;
    }
    reachable = false;
    await setStatus(false, MESSAGES.unreachable(err.message));
    await publishTransports('unreachable');
  }

  async function publishDevices() {
    const devices = buildDevices(gladys, service?.inventory, config);
    if (devices.length === 0) {
      return;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      if (issues.isFailing('publish')) {
        issues.ok('publish', 'Inverters accepted by Gladys again');
        // The status said "refused": say it is fine again.
        if (reachable === true) await setStatus(true);
      }
    } catch (err) {
      issues.fail('publish', `Gladys refused the inverters (${err.message})`);
      await setStatus(false, MESSAGES.publishFailed(err.message));
    }
  }

  /** Read the configuration of the DTU, publish its inverters. @throws the reading error */
  async function discoverAndPublish() {
    let result;
    try {
      result = await service.discover();
    } catch (err) {
      await markUnreachable(err);
      throw err;
    }
    discoveredAt = now();
    if (result.changed || reachable === null) {
      logger.info(
        `AhoyDTU ${result.version || '?'} at ${config.baseUrl}: ${result.inventory.inverters.length} inverter(s)`,
      );
    }
    await markReachable();
    await publishDevices();
    return result;
  }

  function nudgeWidget(force = false) {
    if (!force && now() - lastNudgeAt < WIDGET_NUDGE_MS) {
      return;
    }
    lastNudgeAt = now();
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget nudge not sent (${err.message})`);
    }
  }

  /** Publish the states of the last cycle (no request to the DTU). */
  async function publishEntries() {
    if (!lastEntries || !service?.inventory) {
      return;
    }
    const { features } = createdOnGladys();
    const states = buildStates(gladys, service.inventory, lastEntries, config).filter((state) =>
      features.has(state.device_feature_external_id),
    );
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      issues.ok('states', 'States accepted by Gladys again');
      logger.debug(`${count} state(s) published out of ${states.length}`);
    } catch (err) {
      issues.fail('states', `States not published (${err.message})`);
    }
  }

  /** Read the values; null when the DTU does not answer. */
  async function readSnapshot() {
    try {
      const snapshot = await service.refresh();
      await markReachable();
      for (const { serial, err } of snapshot.errors) {
        issues.fail(`inverter ${serial}`, `Inverter ${serial} not read (${err.message})`);
      }
      for (const [serial, entry] of Object.entries(snapshot.inverters)) {
        if (entry.reading) issues.ok(`inverter ${serial}`, `Inverter ${serial} read again`);
      }
      return snapshot;
    } catch (err) {
      await markUnreachable(err);
      return null;
    }
  }

  // --- The cycle -------------------------------------------------------------------

  async function runCycle() {
    if (!isConfigured(config) || !service || gladys.connected === false) {
      logger.debug('Cycle skipped (not configured or Gladys unreachable)');
      return;
    }
    if (!service.inventory || now() - discoveredAt >= REDISCOVERY_MS) {
      try {
        await discoverAndPublish();
      } catch {
        if (!service.inventory) {
          return;
        }
      }
    }
    if (createdOnGladys().devices.size === 0) {
      logger.debug('No inverter added to Gladys yet: nothing to refresh');
      return;
    }
    const snapshot = await readSnapshot();
    lastCycleAt = now();
    if (snapshot?.unknownHardware) {
      logger.debug('New inverter in the readings: discovery');
      await discoverAndPublish().catch(() => {});
    }
    const { entries, events } = presence.update(service.inventory, snapshot, now());
    lastEntries = entries;
    lastUpdateAt = snapshot ? snapshot.fetchedAt : lastUpdateAt;
    await publishEntries();
    // Events only for the inverters added to Gladys: the device they name
    // must exist there.
    const { devices } = createdOnGladys();
    await triggers.fire(
      service.inventory,
      events.filter((event) => {
        const inverter = service.inventory.inverters.find((inv) => inv.serial === event.serial);
        return inverter && devices.has(inverterIds(gladys, inverter).device);
      }),
    );
    nudgeWidget();
  }

  function cycle() {
    if (!running) {
      running = runCycle()
        .catch((err) => logger.error(`Refresh cycle failed (${err.message})`))
        .finally(() => {
          running = null;
        });
    }
    return running;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped || !isConfigured(config)) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      await cycle();
      schedule();
    }, config.pollIntervalMs);
  }

  // --- Configuration -------------------------------------------------------------

  async function applyConfig(raw) {
    const next = normalizeConfig(raw ?? {});
    const hostChanged = next.baseUrl !== config.baseUrl || !service;
    config = next;
    if (!isConfigured(config)) {
      clearTimeout(timer);
      service = null;
      logger.info(
        config.hostValid ? 'Waiting for the address of AhoyDTU' : 'Invalid AhoyDTU address',
      );
      await setStatus(false, config.hostValid ? MESSAGES.notConfigured : MESSAGES.invalidHost);
      return;
    }
    if (hostChanged) {
      service = createAhoyService({
        client: createClient({ baseUrl: config.baseUrl, request: transport }),
        store,
        now,
      });
      presence.reset();
      triggers.reset();
      lastEntries = null;
      reachable = null;
      discoveredAt = -Infinity;
      if (await service.load()) {
        await publishDevices();
      }
    }
    await discoverAndPublish().catch(() => {});
    // Language or names changed, or first start: the states, at once.
    await cycle();
    schedule();
  }

  // --- Actions ---------------------------------------------------------------------

  /** The inverter of a device external id, from the inventory. */
  function inverterOf(deviceExternalId) {
    return service?.inventory?.inverters.find(
      (inverter) => inverterIds(gladys, inverter).device === deviceExternalId,
    );
  }

  /** @returns {Promise<{ en, fr, de, es }>} the success message; throws ActionFailure */
  async function setPowerLimit(fields, origin) {
    if (!config.allowPowerLimit) {
      throw new ActionFailure(MESSAGES.limitDisabled);
    }
    if (!isConfigured(config) || !service) {
      throw new ActionFailure(config.hostValid ? MESSAGES.notConfigured : MESSAGES.invalidHost);
    }
    const percent = Number(String(fields?.limit ?? '').replace(',', '.'));
    if (!Number.isInteger(percent) || percent < POWER_LIMIT_MIN || percent > POWER_LIMIT_MAX) {
      throw new ActionFailure(MESSAGES.limitInvalid);
    }
    const inverter = inverterOf(fields?.device);
    if (!inverter) {
      throw new ActionFailure(MESSAGES.limitUnknownDevice);
    }
    const name = displayName(gladys, inverter);
    logger.info(`${origin}: power limit of ${percent} % for ${name}`);
    try {
      await service.setPowerLimit(inverter.serial, percent, config.password);
    } catch (err) {
      logger.warn(`Power limit for ${name} not applied (${err.message})`);
      const known = {
        ERR_AUTH: MESSAGES.limitAuth,
        ERR_PROTECTED: MESSAGES.limitProtected,
        ERR_LIMIT_NOT_ACCEPT: MESSAGES.limitNotAccepted,
        ERR_INDEX: MESSAGES.limitUnknownDevice,
      }[err.code];
      throw new ActionFailure(known ?? MESSAGES.limitFailed(err.message));
    }
    return MESSAGES.limitSent(name, percent);
  }

  // --- Handlers --------------------------------------------------------------------

  const handlers = {
    async scanRequest() {
      logger.info('Discovery requested from Gladys');
      if (!service) {
        return;
      }
      await discoverAndPublish().catch(() => publishDevices());
    },

    /** The core's onPoll: a fallback, skipped while the timer is on time. */
    async poll(device) {
      const { devices } = createdOnGladys();
      if (!devices.has(device.external_id)) {
        return;
      }
      const age = now() - lastCycleAt;
      if (age < config.pollIntervalMs * 0.9) {
        logger.debug(`onPoll ${device.external_id}: read ${age} ms ago, skipped`);
        return;
      }
      await cycle();
    },

    /** A device was just added (or updated): Gladys needs all its states now. */
    async deviceChanged(device) {
      const { devices } = createdOnGladys();
      if (!service || !devices.has(device.external_id)) {
        return;
      }
      if (lastEntries) {
        await publishEntries();
      } else {
        await cycle();
      }
      nudgeWidget(true);
    },

    async testConnection() {
      logger.info('Action: test the connection');
      if (!isConfigured(config)) {
        throw new ActionFailure(config.hostValid ? MESSAGES.notConfigured : MESSAGES.invalidHost);
      }
      let result;
      try {
        result = await discoverAndPublish();
      } catch (err) {
        throw new ActionFailure(MESSAGES.unreachable(err.message));
      }
      const count = result.inventory.inverters.length;
      if (count === 0) {
        throw new ActionFailure(MESSAGES.noInverter);
      }
      return MESSAGES.found({ version: result.version || '?', count });
    },

    setPowerLimitAction: (fields) => setPowerLimit(fields, 'Action'),

    async setPowerLimitScene(fields) {
      await setPowerLimit(fields, 'Scene');
    },

    async widgetGet({ settings, language } = {}) {
      const lang = ['en', 'fr', 'de', 'es'].includes(language) ? language : config.language;
      if (!isConfigured(config) || !service) {
        return notConfiguredContent(lang);
      }
      // Without any inverter added, no cycle runs: read for the widget, at
      // the configured pace at most.
      if (service.inventory && createdOnGladys().devices.size === 0) {
        if (now() - (lastUpdateAt ?? -Infinity) >= config.pollIntervalMs) {
          const snapshot = await service.refresh().catch(() => null);
          if (snapshot) {
            lastEntries = presence.update(service.inventory, snapshot, now()).entries;
            lastUpdateAt = snapshot.fetchedAt;
          }
        }
      }
      if (!service.inventory || !lastEntries || lastUpdateAt === null) {
        return noDataContent(lang);
      }
      return buildProductionContent({
        gladys,
        inventory: service.inventory,
        entries: lastEntries,
        updatedAt: lastUpdateAt,
        created: createdOnGladys().features,
        settings,
        language: lang,
        timeZone,
      });
    },
  };

  return {
    handlers,
    get config() {
      return config;
    },
    get service() {
      return service;
    },
    cycle,

    /** Register every handler on the Gladys client (before connect()). */
    register() {
      gladys.onScanRequest(() => handlers.scanRequest());
      gladys.onPoll((device) => handlers.poll(device));
      gladys.onDeviceCreated((device) => handlers.deviceChanged(device));
      gladys.onDeviceUpdated((device) => {
        nudgeWidget(true);
        return handlers.deviceChanged(device);
      });
      gladys.onDeviceDeleted?.(() => nudgeWidget(true));
      gladys.onAction(ACTIONS.testConnection, () => handlers.testConnection());
      gladys.onAction(ACTIONS.setPowerLimit, (fields) => handlers.setPowerLimitAction(fields));
      gladys.onSceneAction(SCENE_ACTIONS.setPowerLimit, (fields) =>
        handlers.setPowerLimitScene(fields),
      );
      gladys.onWidgetGet(WIDGET_KEY, (context) => handlers.widgetGet(context));
      gladys.onConfigUpdated(async (raw) => {
        logger.info('Configuration updated');
        await applyConfig(raw);
      });
      gladys.on('connected', async () => {
        try {
          await applyConfig(await gladys.getConfig());
        } catch (err) {
          logger.error(`Initialization failed (${err.message})`);
        }
      });
    },

    async stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      await running;
    },
  };
}
