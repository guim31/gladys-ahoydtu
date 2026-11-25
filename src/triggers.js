// -----------------------------------------------------------------------------
// Scene triggers: things that HAPPEN, worth more than a condition on a state.
//
// - `inverter_unreachable`: an inverter stops answering when it should be
//   producing (by day, or while it was producing). The night is not a fault
//   and fires nothing (src/presence.js). `cause` says whether the inverter
//   is silent ("inverter") or the AhoyDTU itself ("dtu"). At most one event
//   every 10 minutes per inverter, so a flapping radio link does not flood
//   the scenes.
// - `production_started`: the first production of the day (the morning
//   wake-up, not every cloud): "the panels produce, start the dishwasher".
//
// "Power above X W" is not a trigger: the core's device-state trigger on the
// power feature already has the threshold and the duration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { inverterIds } from './devices.js';

export const SCENE_TRIGGERS = {
  inverterUnreachable: 'inverter_unreachable',
  productionStarted: 'production_started',
};
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

export const UNREACHABLE_EVENT_GAP_MS = 10 * 60 * 1000;

/** The name the user gave the device in Gladys, Ahoy's otherwise. */
export function displayName(gladys, inverter) {
  const id = inverterIds(gladys, inverter).device;
  const created = (gladys.devices ?? []).find((device) => device.external_id === id);
  return created?.name || inverter.name || inverter.serial;
}

/**
 * @param {object} options
 * @param {object} options.gladys
 * @param {object} [options.logger]
 * @param {() => number} [options.now]
 */
export function createTriggerWatcher({
  gladys,
  logger = createLogger({ name: 'triggers' }),
  now = () => Date.now(),
}) {
  const lastUnreachableAt = new Map();

  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused by Gladys (${err.message})`);
    }
  }

  return {
    /**
     * @param {{ inverters: object[] }} inventory
     * @param {object[]} events from presence.update()
     */
    async fire(inventory, events) {
      for (const event of events) {
        const inverter = inventory.inverters.find((entry) => entry.serial === event.serial);
        if (!inverter) continue;
        const name = displayName(gladys, inverter);
        const device = inverterIds(gladys, inverter).device;
        if (event.kind === 'unreachable') {
          logger.warn(
            event.cause === 'dtu'
              ? `Inverter ${name}: AhoyDTU lost by day`
              : `Inverter ${name} stopped answering by day`,
          );
          if (
            now() - (lastUnreachableAt.get(inverter.serial) ?? -Infinity) <
            UNREACHABLE_EVENT_GAP_MS
          ) {
            logger.debug(`Inverter ${name} lost again: event skipped (too soon)`);
            continue;
          }
          lastUnreachableAt.set(inverter.serial, now());
          await fire(SCENE_TRIGGERS.inverterUnreachable, {
            device,
            inverter: name,
            cause: event.cause,
          });
        } else if (event.kind === 'started') {
          logger.debug(`Inverter ${name} started producing`);
          await fire(SCENE_TRIGGERS.productionStarted, {
            device,
            inverter: name,
            power: event.power ?? 0,
          });
        }
      }
    },
    reset() {
      lastUnreachableAt.clear();
    },
  };
}
