// -----------------------------------------------------------------------------
// A whole integration under test: the app wired to the SDK's fake Gladys and
// to a fake AhoyDTU, a clock the test moves, an in-memory /data and a
// logger that records every line.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { createMemoryStore } from '../../src/store.js';
import { createFakeAhoy, scenario } from './fakeAhoy.js';

export const TEST_HOST = '192.0.2.20';
// A summer morning in Paris, panels producing (the time of day.json).
export const MORNING = Date.parse('2026-06-21T10:00:00Z');

/** A logger recording its lines: `{ level, text }`. */
export function createRecordingLogger() {
  const lines = [];
  const write =
    (level) =>
    (...args) =>
      lines.push({
        level,
        text: args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '),
      });
  const logger = {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: () => logger,
  };
  return { logger, lines, at: (level) => lines.filter((line) => line.level === level) };
}

export function createClock(start = MORNING) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] config values (host defaults to TEST_HOST)
 * @param {boolean} [options.create] the user adds every discovered device
 * @param {boolean} [options.timers] run the app's refresh timer
 * @param {object} [options.store]
 * @param {object} [options.clock]
 * @param {Function} [options.before] (ahoy) => void, before the connection
 */
export async function createWorld({
  config = {},
  create = true,
  timers = false,
  store = createMemoryStore(),
  clock = createClock(),
  before,
} = {}) {
  const ahoy = createFakeAhoy(scenario('day'));
  before?.(ahoy);
  const logs = createRecordingLogger();
  const gladys = createFakeGladys({ config: { host: TEST_HOST, ...config } });
  const app = createApp({
    gladys,
    store,
    transport: ahoy.request,
    logger: logs.logger,
    now: clock.now,
    timers,
    timeZone: 'Europe/Paris',
  });
  app.register();
  await gladys.connect();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
  }
  return {
    gladys,
    app,
    ahoy,
    logs,
    clock,
    store,
    /** The published device whose external id contains `fragment`. */
    device(fragment) {
      return gladys.fake.discoveredDevices.find((device) => device.external_id.includes(fragment));
    },
    /** The last state of `<device fragment>` + `:<feature key>`. */
    state(deviceFragment, key) {
      const device = this.device(deviceFragment);
      return gladys.fake.lastState(`${device.external_id}:${key}`);
    },
  };
}
