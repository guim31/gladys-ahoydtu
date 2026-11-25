// -----------------------------------------------------------------------------
// The actions: success in green (returned), every failure in red (thrown,
// with the four-language message), for the button and the scene action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { night } from './helpers/scenarios.js';

const HM800 = 'inverter:116180212345';
const ALLOWED = { allow_power_limit: true };

function assertFailure(ack, pattern) {
  assert.equal(ack.success, false);
  assert.deepEqual(Object.keys(ack.error).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(ack.error.fr, pattern);
}

test('test the connection: the firmware and the count of inverters; failures in red', async () => {
  const world = await createWorld();
  let ack = await world.gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /0\.8\.155 répond : 2 onduleur/);

  world.ahoy.goDown('ECONNREFUSED');
  ack = await world.gladys.fake.action('test_connection');
  assertFailure(ack, /ne répond pas \(ECONNREFUSED\)/);

  world.ahoy.comeBack();
  world.ahoy.state.inverters = [];
  ack = await world.gladys.fake.action('test_connection');
  assertFailure(ack, /aucun onduleur/);

  await world.gladys.fake.configUpdated({ host: '' });
  ack = await world.gladys.fake.action('test_connection');
  assertFailure(ack, /Saisissez l'adresse/);
  await world.app.stop();
});

test('the power limit is off by default: nothing is sent', async () => {
  const world = await createWorld();
  const device = world.device(HM800).external_id;
  const ack = await world.gladys.fake.action('set_power_limit', { device, limit: 50 });
  assertFailure(ack, /désactivée/);
  assert.equal(world.ahoy.commands.length, 0);
  const scene = await world.gladys.fake.sceneAction('set_power_limit', { device, limit: 50 });
  assert.equal(scene.success, false);
  assert.equal(world.ahoy.commands.length, 0);
  await world.app.stop();
});

test('the power limit: sent non-persistent, one info line, a green message', async () => {
  const world = await createWorld({ config: ALLOWED });
  const device = world.device(HM800).external_id;
  const ack = await world.gladys.fake.action('set_power_limit', { device, limit: '60' });
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /Limite de 60 % envoyée à Garage/);
  assert.deepEqual(world.ahoy.commands, [{ id: 0, cmd: 'limit_nonpersistent_relative', val: 60 }]);
  assert.equal(world.logs.at('info').filter((l) => /power limit of 60 %/.test(l.text)).length, 1);

  const scene = await world.gladys.fake.sceneAction('set_power_limit', { device, limit: 100 });
  assert.equal(scene.success, true);
  assert.equal(world.ahoy.inverter(0).powerLimit, 100);
  await world.app.stop();
});

test('the power limit: wrong values and unknown devices refused before any request', async () => {
  const world = await createWorld({ config: ALLOWED });
  const device = world.device(HM800).external_id;
  for (const limit of [1, 101, 50.5, 'abc', undefined]) {
    assertFailure(await world.gladys.fake.action('set_power_limit', { device, limit }), /2 à 100/);
  }
  assertFailure(
    await world.gladys.fake.action('set_power_limit', { device: 'ext:other:1', limit: 50 }),
    /Choisissez un onduleur/,
  );
  assert.equal(world.ahoy.commands.length, 0);
  await world.app.stop();
});

test('the power limit with a password: missing, wrong, right', async () => {
  const world = await createWorld({
    config: ALLOWED,
    before: (ahoy) => {
      ahoy.state.password = 'admin-pass';
    },
  });
  const device = world.device(HM800).external_id;
  const send = () => world.gladys.fake.action('set_power_limit', { device, limit: 50 });
  assertFailure(await send(), /protégée par un mot de passe/);
  await world.gladys.fake.configUpdated({ host: '192.0.2.20', ...ALLOWED, password: 'nope' });
  assertFailure(await send(), /refusé le mot de passe/);
  await world.gladys.fake.configUpdated({ host: '192.0.2.20', ...ALLOWED, password: 'admin-pass' });
  assert.equal((await send()).success, true);
  await world.app.stop();
});

test('the power limit at night or with the DTU down: red, with the reason', async () => {
  const world = await createWorld({ config: ALLOWED });
  const device = world.device(HM800).external_id;
  night(world.ahoy.state);
  assertFailure(
    await world.gladys.fake.action('set_power_limit', { device, limit: 50 }),
    /pas joignable par radio/,
  );
  world.ahoy.goDown('ETIMEDOUT');
  assertFailure(
    await world.gladys.fake.action('set_power_limit', { device, limit: 50 }),
    /n'a pas été envoyée \(ETIMEDOUT\)/,
  );
  await world.app.stop();
});

test('the power limit to an inverter just gone silent: refused here, never queued in Ahoy', async () => {
  const world = await createWorld({ config: ALLOWED });
  const device = world.device(HM800).external_id;
  // Not available for Ahoy, but not OFF yet: Ahoy itself would accept and queue it.
  world.ahoy.state.inverters[0].available = false;
  world.ahoy.state.inverters[0].off = false;
  assertFailure(
    await world.gladys.fake.action('set_power_limit', { device, limit: 50 }),
    /pas joignable par radio/,
  );
  assert.equal(world.ahoy.count('/api/ctrl'), 0);
  await world.app.stop();
});
