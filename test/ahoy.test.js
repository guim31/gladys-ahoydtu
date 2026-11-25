// -----------------------------------------------------------------------------
// The AhoyDTU client and parsers, against the fake AhoyDTU (no socket): the
// answers of RestApi.h, the field order of /api/live, the password logic of
// POST /api/ctrl, and the errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AhoyError, createClient } from '../src/ahoy/client.js';
import {
  DEFAULT_AC_FIELDS,
  DEFAULT_DC_FIELDS,
  parseFieldNames,
  parseIndex,
  parseInverter,
  parseInverterList,
} from '../src/ahoy/parse.js';
import { createAhoyService } from '../src/ahoy/service.js';
import { createMemoryStore } from '../src/store.js';
import { createFakeAhoy, scenario } from './helpers/fakeAhoy.js';
import { night } from './helpers/scenarios.js';

const BASE = 'http://192.0.2.20';

function setup(mutate) {
  const state = scenario('day');
  mutate?.(state);
  const ahoy = createFakeAhoy(state);
  const client = createClient({ baseUrl: BASE, request: ahoy.request });
  return { ahoy, client };
}

test('the inverter list: serials, names, inputs; empty slots dropped', async () => {
  const { client } = setup((state) => {
    state.inverters.push({ ...structuredClone(state.inverters[0]), id: 2, serial: '0' });
  });
  const list = parseInverterList(await client.get('inverter/list'));
  assert.deepEqual(
    list.map(({ id, serial, name, channels, channelNames }) => ({
      id,
      serial,
      name,
      channels,
      channelNames,
    })),
    [
      {
        id: 0,
        serial: '116180212345',
        name: 'Garage',
        channels: 2,
        channelNames: ['Sud', 'Ouest'],
      },
      { id: 1, serial: '114181234567', name: '', channels: 4, channelNames: ['', '', '', ''] },
    ],
  );
});

test('the index: availability, sun times in ms, firmware version', async () => {
  const { client } = setup();
  const index = parseIndex(await client.get('index'));
  assert.equal(index.version, '0.8.155');
  assert.equal(index.sunrise, Date.parse('2026-06-21T03:47:00Z'));
  assert.equal(index.inverters.get(0).available, true);
  assert.equal(index.inverters.get(1).producing, true);
});

test('the values of an inverter, in the order /api/live gives', async () => {
  const { client } = setup();
  const fields = parseFieldNames(await client.get('live'));
  assert.deepEqual(fields, { ac: DEFAULT_AC_FIELDS, dc: DEFAULT_DC_FIELDS });
  const reading = parseInverter(await client.get('inverter/id/0'), fields);
  assert.deepEqual(reading, {
    acPower: 368.4,
    acVoltage: 231.2,
    temperature: 31.4,
    today: 1820,
    total: 1523.456,
    powerLimit: 100,
    dc: [
      { power: 194.1, today: 960 },
      { power: 195.2, today: 935 },
    ],
  });
});

test('a firmware with another field order is read by name', () => {
  const fields = { ac: ['P_AC', 'U_AC', 'YieldDay'], dc: ['P_DC', 'YieldDay'] };
  const reading = parseInverter(
    {
      ch: [
        [100, 230, 500],
        [50, 250],
      ],
    },
    fields,
  );
  assert.equal(reading.acPower, 100);
  assert.equal(reading.acVoltage, 230);
  assert.equal(reading.today, 500);
  assert.equal(reading.temperature, null);
  assert.deepEqual(reading.dc, [{ power: 50, today: 250 }]);
  // Without /api/live: the 0.8 order.
  assert.deepEqual(parseFieldNames(null).ac, DEFAULT_AC_FIELDS);
});

test('an answer that is not AhoyDTU is a format error', async () => {
  const client = createClient({
    baseUrl: BASE,
    request: async () => ({ status: 200, body: '<html>router</html>' }),
  });
  await assert.rejects(
    client.get('index'),
    (err) => err instanceof AhoyError && err.kind === 'format',
  );
  assert.throws(() => parseIndex({ hello: 1 }), /AhoyDTU/);
  assert.throws(() => parseInverter({ error: 'inverter not found!' }, parseFieldNames(null)));
  const http404 = createClient({ baseUrl: BASE, request: async () => ({ status: 404, body: '' }) });
  await assert.rejects(http404.get('index'), (err) => err.kind === 'http' && err.status === 404);
});

test('a DTU that does not answer is a network error, with its code only', async () => {
  const { ahoy, client } = setup();
  ahoy.goDown('ECONNREFUSED');
  await assert.rejects(
    client.get('index'),
    (err) => err.kind === 'network' && err.message === 'ECONNREFUSED',
  );
});

test('the limit without password: one POST, non-persistent, relative', async () => {
  const { ahoy, client } = setup();
  await client.control({ id: 0, cmd: 'limit_nonpersistent_relative', val: 50 });
  assert.deepEqual(ahoy.commands, [{ id: 0, cmd: 'limit_nonpersistent_relative', val: 50 }]);
  assert.equal(ahoy.inverter(0).powerLimit, 50);
  assert.equal(JSON.parse(ahoy.requests.at(-1).body).auth, undefined);
});

test('the limit with a password: auth in the same request; wrong or missing password refused', async () => {
  const { ahoy, client } = setup((state) => {
    state.password = 'secret-pass';
  });
  const command = { id: 1, cmd: 'limit_nonpersistent_relative', val: 30 };
  await assert.rejects(client.control(command), (err) => err.code === 'ERR_PROTECTED');
  await assert.rejects(client.control(command, 'wrong'), (err) => err.code === 'ERR_AUTH');
  await client.control(command, 'secret-pass');
  assert.equal(ahoy.inverter(1).powerLimit, 30);
  // The password never shows in an error message.
  const err = await client.control(command, 'wrong').catch((e) => e);
  assert.doesNotMatch(err.message, /wrong/);
});

test('the limit at night: Ahoy refuses a command to an inverter that is off', async () => {
  const { ahoy, client } = setup((state) => night(state));
  await assert.rejects(
    client.control({ id: 0, cmd: 'limit_nonpersistent_relative', val: 50 }),
    (err) => err.code === 'ERR_LIMIT_NOT_ACCEPT',
  );
  assert.equal(ahoy.commands.length, 0);
});

test('the service: inventory kept in /data, values of reachable inverters only', async () => {
  const { ahoy, client } = setup();
  const store = createMemoryStore();
  const service = createAhoyService({ client, store, now: () => 1 });
  const { changed, version } = await service.discover();
  assert.equal(changed, true);
  assert.equal(version, '0.8.155');
  assert.ok(store.files.has('inventory'));
  assert.doesNotMatch(store.files.get('inventory'), /password/);

  ahoy.state.inverters[1].available = false;
  const snapshot = await service.refresh();
  assert.equal(snapshot.inverters['116180212345'].reading.acPower, 368.4);
  assert.equal(snapshot.inverters['114181234567'].available, false);
  assert.equal(snapshot.inverters['114181234567'].reading, null);
  assert.equal(ahoy.count('/api/inverter/id/1'), 0, 'an unavailable inverter is not read');

  // A new run reads the inventory back, for the same DTU only.
  const again = createAhoyService({ client, store, now: () => 1 });
  assert.equal(await again.load(), true);
  assert.equal(again.inventory.inverters.length, 2);
  const other = createAhoyService({
    client: createClient({ baseUrl: 'http://192.0.2.99', request: ahoy.request }),
    store,
    now: () => 1,
  });
  assert.equal(await other.load(), false);
});

test('the service: a command finds the current id of a serial (Ahoy numbers by position)', async () => {
  const { ahoy, client } = setup();
  const service = createAhoyService({ client, store: createMemoryStore(), now: () => 1 });
  await service.discover();
  // The first inverter was deleted in Ahoy: the second moved to slot 0.
  ahoy.state.inverters = [{ ...ahoy.state.inverters[1], id: 0 }];
  await service.setPowerLimit('114181234567', 40, '');
  assert.deepEqual(ahoy.commands, [{ id: 0, cmd: 'limit_nonpersistent_relative', val: 40 }]);
  await assert.rejects(
    service.setPowerLimit('116180212345', 40, ''),
    (err) => err.code === 'ERR_INDEX',
  );
});
