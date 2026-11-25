// -----------------------------------------------------------------------------
// The life of the integration: its own refresh timer (no onPoll needed), the
// onPoll fallback, night and day, reachability (status, badges, one log line
// per change), quiet logs, the inventory kept in /data, the configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { createMemoryStore } from '../src/store.js';
import { dusk, night } from './helpers/scenarios.js';

const HM800 = 'inverter:116180212345';
const HM1500 = 'inverter:114181234567';

const settle = async () => {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('the states refresh on the container timer, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true, config: { poll_interval: '10' } });
  assert.equal(world.state(HM800, 'ac_power'), 368);
  for (const [power, expected] of [
    [400, 400],
    [512.6, 513],
  ]) {
    world.ahoy.state.inverters[0].ac[2] = power;
    world.clock.advance(10000);
    t.mock.timers.tick(10000);
    await settle();
    assert.equal(world.state(HM800, 'ac_power'), expected);
  }
  assert.ok(
    world.gladys.fake.requests.every((request) => request.path !== '/poll'),
    'no poll involved',
  );
  await world.app.stop();
});

test('onPoll is a fallback: skipped while the timer is on time, a refresh when it is late', async () => {
  const world = await createWorld();
  const device = world.device(HM800);
  const before = world.ahoy.count('/api/index');
  world.clock.advance(5000);
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  assert.equal(world.ahoy.count('/api/index'), before, 'read 5 s ago: skipped');
  world.clock.advance(20000);
  await world.gladys.fake.poll(device);
  assert.equal(world.ahoy.count('/api/index'), before + 1);
  await world.app.stop();
});

test('without any inverter added, AhoyDTU is not read after the discovery', async () => {
  const world = await createWorld({ create: false });
  const before = world.ahoy.requests.length;
  world.clock.advance(60000);
  await world.app.cycle();
  assert.equal(world.ahoy.requests.length, before);
  assert.equal(world.gladys.fake.states.length, 0);
  await world.app.stop();
});

test('an inverter just added receives all its states at once', async () => {
  const world = await createWorld();
  const garage = world.device(HM800);
  assert.equal(garage.name, 'Garage');
  assert.equal(world.device(HM1500).name, 'Onduleur 114181234567');
  assert.equal(world.state(HM800, 'reachable'), 1);
  assert.equal(world.state(HM800, 'state'), 'En production');
  assert.equal(world.state(HM800, 'production_today'), 1.82);
  assert.equal(world.state(HM800, 'production_total'), 1523.456);
  assert.equal(world.state(HM800, 'ac_voltage'), 231.2);
  assert.equal(world.state(HM800, 'temperature'), 31.4);
  assert.equal(world.state(HM800, 'dc_power_2'), 195.2);
  assert.equal(world.state(HM800, 'dc_today_1'), 0.96);
  assert.equal(world.state(HM1500, 'dc_power_4'), 175.8);
  assert.ok(world.gladys.fake.widgetRefreshes.includes('production'));
  // Every feature of the device received a state.
  for (const feature of garage.features) {
    assert.notEqual(world.gladys.fake.lastState(feature.external_id), undefined, feature.name);
  }
  await world.app.stop();
});

test('dusk then night: 0 W, asleep, not reachable, no alarm; the day counters at 0 after midnight', async () => {
  const world = await createWorld();
  dusk(world.ahoy.state);
  world.clock.advance(60000);
  await world.app.cycle();
  assert.equal(world.state(HM800, 'ac_power'), 0);
  assert.equal(world.state(HM800, 'state'), 'Éveillé, sans production');

  night(world.ahoy.state, Date.parse('2026-06-21T20:30:00Z'));
  world.clock.time = Date.parse('2026-06-21T20:30:00Z');
  await world.app.cycle();
  assert.equal(world.state(HM800, 'reachable'), 0);
  assert.equal(world.state(HM800, 'state'), 'En veille (nuit)');
  assert.equal(world.state(HM800, 'dc_power_1'), 0);
  assert.equal(world.state(HM800, 'production_today'), 1.82, 'kept until midnight');
  assert.equal(world.state(HM800, 'production_total'), 1523.456, 'the index is never reset');
  assert.deepEqual(world.gladys.fake.sceneEvents, []);
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });

  world.clock.time = Date.parse('2026-06-21T22:30:00Z');
  await world.app.cycle();
  assert.equal(world.state(HM800, 'production_today'), 0);
  assert.equal(world.state(HM800, 'dc_today_2'), 0);
  // At night, one request per cycle: the index only.
  const before = world.ahoy.requests.length;
  world.clock.advance(15000);
  await world.app.cycle();
  assert.deepEqual(
    world.ahoy.requests.slice(before).map((r) => r.path),
    ['/api/index'],
  );
  await world.app.stop();
});

test('AhoyDTU down: status with a four-language message, badges, one warning; then back', async () => {
  const world = await createWorld();
  world.ahoy.goDown('EHOSTUNREACH');
  for (let i = 0; i < 3; i += 1) {
    world.clock.advance(15000);
    await world.app.cycle();
  }
  const status = world.gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(status.message.fr, /EHOSTUNREACH/);
  assert.equal(world.state(HM800, 'state'), 'AhoyDTU ne répond pas');
  assert.equal(world.state(HM800, 'reachable'), 0);
  assert.ok(world.gladys.fake.transports.some((entry) => entry.transport === 'unreachable'));
  assert.equal(world.logs.at('warn').filter((l) => /unreachable at/.test(l.text)).length, 1);

  world.ahoy.comeBack();
  world.clock.advance(15000);
  await world.app.cycle();
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
  assert.equal(world.state(HM800, 'reachable'), 1);
  assert.equal(world.logs.at('info').filter((l) => /answers again/.test(l.text)).length, 1);
  assert.equal(world.gladys.fake.transports.at(-1).transport, 'local');
  await world.app.stop();
});

test('quiet logs: a normal cycle writes nothing at info level', async () => {
  const world = await createWorld();
  const before = world.logs.at('info').length;
  for (let i = 0; i < 5; i += 1) {
    world.ahoy.state.inverters[0].ac[2] += 10;
    world.clock.advance(15000);
    await world.app.cycle();
  }
  assert.equal(world.logs.at('info').length, before);
  assert.equal(world.logs.at('warn').length, 0);
  await world.app.stop();
});

test('no password in any log line or in /data', async () => {
  const store = createMemoryStore();
  const world = await createWorld({
    store,
    config: { password: 'hunter2-secret', allow_power_limit: true },
    before: (ahoy) => {
      ahoy.state.password = 'hunter2-secret';
    },
  });
  await world.gladys.fake.action('set_power_limit', {
    device: world.device(HM800).external_id,
    limit: 50,
  });
  world.ahoy.goDown();
  world.clock.advance(15000);
  await world.app.cycle();
  assert.ok(world.logs.lines.every((line) => !line.text.includes('hunter2')));
  assert.ok([...store.files.values()].every((value) => !value.includes('hunter2')));
  await world.app.stop();
});

test('a restart while AhoyDTU is down publishes the inverters kept in /data', async () => {
  const store = createMemoryStore();
  const first = await createWorld({ store });
  await first.app.stop();
  const second = await createWorld({ store, create: false, before: (ahoy) => ahoy.goDown() });
  assert.equal(second.gladys.fake.discoveredDevices.length, 2);
  assert.equal(second.gladys.fake.connectionStatus.connected, false);
  await second.app.stop();
});

test('an inverter added in AhoyDTU appears at the next reading', async () => {
  const world = await createWorld();
  world.ahoy.state.inverters.push({
    ...structuredClone(world.ahoy.state.inverters[0]),
    id: 2,
    serial: '138212345678',
    name: 'Abri',
  });
  world.clock.advance(15000);
  await world.app.cycle();
  assert.equal(world.gladys.fake.discoveredDevices.length, 3);
  await world.app.stop();
});

test('configuration: not configured, invalid address, names in another language', async () => {
  const world = await createWorld({ config: { host: '' }, create: false });
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.en, /Enter the address/);
  await world.gladys.fake.configUpdated({ host: 'ftp://nope' });
  assert.match(world.gladys.fake.connectionStatus.message.en, /not valid/);
  await world.gladys.fake.configUpdated({ host: '192.0.2.20', language: 'de' });
  assert.equal(world.gladys.fake.discoveredDevices[1].name, 'Wechselrichter 114181234567');
  assert.equal(world.gladys.fake.discoveredDevices[0].features[0].name, 'Leistung');
  await world.app.stop();
});

test('Gladys refuses the inverters once: the status comes back when it accepts them again', async () => {
  const world = await createWorld();
  const original = world.gladys.publishDiscoveredDevices.bind(world.gladys);
  world.gladys.publishDiscoveredDevices = async () => {
    throw new Error('Request failed with status code 422');
  };
  await world.gladys.fake.scanRequest();
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  world.gladys.publishDiscoveredDevices = original;
  await world.gladys.fake.scanRequest();
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
  await world.app.stop();
});
