// -----------------------------------------------------------------------------
// The scene events, end to end: an inverter lost by day (not at night), the
// AhoyDTU lost by day, the first production of the day.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { dusk, morning, night } from './helpers/scenarios.js';
import { UNREACHABLE_EVENT_GAP_MS } from '../src/triggers.js';

const HM800 = 'inverter:116180212345';

test('an inverter lost by day: one event, with the name and the cause; at most one per 10 minutes', async () => {
  const world = await createWorld();
  const device = world.device(HM800);
  world.ahoy.state.inverters[0].available = false;
  world.clock.advance(15000);
  await world.app.cycle();
  assert.deepEqual(world.gladys.fake.sceneEvents, [
    {
      key: 'inverter_unreachable',
      data: { device: device.external_id, inverter: 'Garage', cause: 'inverter' },
    },
  ]);
  assert.equal(world.state(HM800, 'state'), 'Ne répond pas');
  // Back, then lost again two minutes later: no second event.
  world.ahoy.state.inverters[0].available = true;
  world.clock.advance(60000);
  await world.app.cycle();
  world.ahoy.state.inverters[0].available = false;
  world.clock.advance(60000);
  await world.app.cycle();
  assert.equal(world.gladys.fake.sceneEvents.length, 1);
  // Later, a new loss is a new event.
  world.ahoy.state.inverters[0].available = true;
  world.clock.advance(UNREACHABLE_EVENT_GAP_MS);
  await world.app.cycle();
  world.ahoy.state.inverters[0].available = false;
  world.clock.advance(15000);
  await world.app.cycle();
  assert.equal(world.gladys.fake.sceneEvents.length, 2);
  await world.app.stop();
});

test('the AhoyDTU lost by day: one event per inverter, cause "dtu"', async () => {
  const world = await createWorld();
  world.ahoy.goDown();
  world.clock.advance(15000);
  await world.app.cycle();
  const events = world.gladys.fake.sceneEvents;
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.data.cause === 'dtu'));
  await world.app.stop();
});

test('nightfall fires nothing; the morning start fires once', async () => {
  const world = await createWorld();
  dusk(world.ahoy.state);
  world.clock.advance(60000);
  await world.app.cycle();
  night(world.ahoy.state);
  world.clock.time = Date.parse('2026-06-21T22:30:00Z');
  await world.app.cycle();
  assert.deepEqual(world.gladys.fake.sceneEvents, []);

  morning(world.ahoy.state);
  world.clock.time = Date.parse('2026-06-22T05:30:00Z');
  await world.app.cycle();
  const started = world.gladys.fake.sceneEvents.filter((e) => e.key === 'production_started');
  assert.equal(started.length, 2);
  assert.deepEqual(started[0].data, {
    device: world.device(HM800).external_id,
    inverter: 'Garage',
    power: 45.2,
  });
  world.clock.advance(15000);
  await world.app.cycle();
  assert.equal(world.gladys.fake.sceneEvents.length, 2);
  await world.app.stop();
});

test('the events carry the name given in Gladys', async () => {
  const world = await createWorld();
  const device = world.device(HM800);
  await world.gladys.fake.deviceUpdated({ ...device, name: 'Toit sud' });
  world.ahoy.state.inverters[0].available = false;
  world.clock.advance(15000);
  await world.app.cycle();
  assert.equal(world.gladys.fake.sceneEvents[0].data.inverter, 'Toit sud');
  await world.app.stop();
});

test('no event for an inverter not added to Gladys', async () => {
  const world = await createWorld({ create: false });
  await world.gladys.fake.deviceCreated(world.device('inverter:114181234567'));
  world.ahoy.state.inverters[0].available = false;
  world.ahoy.state.inverters[1].available = false;
  world.clock.advance(15000);
  await world.app.cycle();
  world.clock.advance(15000);
  await world.app.cycle();
  const fired = world.gladys.fake.sceneEvents.map((event) => event.data.device);
  assert.equal(fired.length, 1, 'the added inverter only');
  assert.ok(fired.every((id) => id.endsWith('114181234567')));
  await world.app.stop();
});
