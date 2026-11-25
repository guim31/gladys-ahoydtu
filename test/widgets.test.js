// -----------------------------------------------------------------------------
// The "AhoyDTU" widget: valid for the core, bound to the features Gladys has,
// sums for several inverters, blocks that can be hidden, four languages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createWorld } from './helpers/world.js';
import { night } from './helpers/scenarios.js';

const HM800 = 'inverter:116180212345';

async function content(world, options) {
  const ack = await world.gladys.fake.widgetGet('production', options);
  assert.equal(ack.success, true, ack.error);
  const { content: result } = ack.data;
  assert.deepEqual(validateWidgetContent(result), []);
  assert.ok(result.components.length <= 8);
  assert.ok(result.components.filter((c) => c.type === 'text').length <= 2);
  return result;
}

/** Every bound external id exists on a published device. */
function assertBound(world, result) {
  const ids = new Set(
    world.gladys.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
  );
  for (const component of result.components) {
    for (const id of [component.device_feature, ...(component.device_features ?? [])]) {
      if (id) assert.ok(ids.has(id), `${id} is a published feature`);
    }
  }
}

test('two inverters: sums, chart of both, one line each', async () => {
  const world = await createWorld();
  const result = await content(world, { language: 'fr' });
  const [production, today, chart, status] = result.components;
  assert.deepEqual(production, {
    type: 'value',
    label: 'Production',
    icon: 'sun',
    value: 1041,
    unit: 'W',
  });
  assert.equal(today.value, '5,23');
  assert.equal(chart.device_features.length, 2);
  assert.equal(status.items[0].label, 'Garage');
  assert.equal(status.items[0].value, '368 W');
  assert.equal(status.items.at(-1).label, 'Mis à jour');
  assertBound(world, result);
  await world.app.stop();
});

test('one inverter in Gladys: tiles bound to its features (live in the dashboard)', async () => {
  const world = await createWorld({ create: false });
  await world.gladys.fake.deviceCreated(world.device(HM800));
  const result = await content(world, { language: 'en' });
  assert.match(result.components[0].device_feature, /:ac_power$/);
  assert.match(result.components[1].device_feature, /:production_today$/);
  assertBound(world, result);
  await world.app.stop();
});

test('the chart and the inverter lines can be hidden', async () => {
  const world = await createWorld();
  const result = await content(world, {
    language: 'de',
    settings: { show_chart: false, show_inverters: false },
  });
  assert.ok(!result.components.some((c) => c.type === 'chart'));
  const status = result.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.label),
    ['Aktualisiert'],
  );
  await world.app.stop();
});

test('at night, with a limit set: the state and the limit in the line', async () => {
  const world = await createWorld({ config: { allow_power_limit: true } });
  await world.gladys.fake.action('set_power_limit', {
    device: world.device(HM800).external_id,
    limit: 50,
  });
  world.clock.advance(15000);
  await world.app.cycle();
  let status = (await content(world, { language: 'es' })).components.at(-1);
  assert.equal(status.items[0].value, '368 W · Límite de potencia 50 %');
  night(world.ahoy.state);
  world.clock.time = Date.parse('2026-06-21T22:30:00Z');
  await world.app.cycle();
  status = (await content(world, { language: 'es' })).components.at(-1);
  assert.equal(status.items[0].value, 'En reposo (noche)');
  assert.equal(status.items[0].color, 'neutral');
  await world.app.stop();
});

test('not configured, and no reading yet: a sentence', async () => {
  const world = await createWorld({ config: { host: '' }, create: false });
  let result = await content(world, { language: 'fr' });
  assert.match(result.components[0].text, /Saisissez l'adresse/);
  await world.gladys.fake.configUpdated({ host: '192.0.2.20' });
  world.ahoy.goDown();
  result = await content(world, { language: 'en' });
  assert.match(result.components[0].text, /No reading/);
  await world.app.stop();
});
