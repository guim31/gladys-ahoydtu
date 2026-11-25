// -----------------------------------------------------------------------------
// Night or fault: the state of each inverter and the events, pure.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, dayKey, isDaylight } from '../src/presence.js';

const H = 60 * 60 * 1000;
const SUNRISE = Date.parse('2026-06-21T03:47:00Z');
const SUNSET = Date.parse('2026-06-21T19:57:00Z');
const NOON = Date.parse('2026-06-21T12:00:00Z');
const inventory = { inverters: [{ serial: 'aa1111', enabled: true }] };

function snap({ available = true, power = 300, sun = true } = {}) {
  return {
    sunrise: sun ? SUNRISE : null,
    sunset: sun ? SUNSET : null,
    inverters: {
      aa1111: {
        available,
        producing: power > 0,
        reading: available ? { acPower: power, today: 1000, dc: [] } : null,
      },
    },
  };
}

test('daylight from the time of day of Ahoy sun times, also the next days', () => {
  assert.equal(isDaylight(NOON, SUNRISE, SUNSET), true);
  assert.equal(isDaylight(NOON + 11 * H, SUNRISE, SUNSET), false);
  assert.equal(
    isDaylight(NOON + 48 * H, SUNRISE, SUNSET),
    true,
    "yesterday's sun times still answer",
  );
  assert.equal(isDaylight(NOON, null, SUNSET), null);
  // Sun times straddling midnight UTC (New Zealand): day at 23:00 UTC.
  const rise = Date.parse('2026-12-21T16:50:00Z');
  const set = Date.parse('2026-12-22T08:00:00Z');
  assert.equal(isDaylight(Date.parse('2026-12-21T23:00:00Z'), rise, set), true);
  assert.equal(isDaylight(Date.parse('2026-12-21T12:00:00Z'), rise, set), false);
  assert.equal(dayKey(Date.parse('2026-06-21T22:30:00Z'), 'Europe/Paris'), '2026-06-22');
});

test('lost after sunset: asleep, no event; lost by day: not answering, one event', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  presence.update(inventory, snap({ power: 0 }), SUNSET - H);
  let result = presence.update(inventory, snap({ available: false }), SUNSET + H);
  assert.equal(result.entries.get('aa1111').status, 'sleeping');
  assert.deepEqual(result.events, []);

  const day = createPresence({ timeZone: 'Europe/Paris' });
  day.update(inventory, snap(), NOON);
  result = day.update(inventory, snap({ available: false }), NOON + 60000);
  assert.equal(result.entries.get('aa1111').status, 'unreachable');
  assert.equal(result.entries.get('aa1111').reachable, false);
  assert.deepEqual(result.events, [{ kind: 'unreachable', serial: 'aa1111', cause: 'inverter' }]);
  result = day.update(inventory, snap({ available: false }), NOON + 120000);
  assert.deepEqual(result.events, [], 'one event per loss');
});

test('without sun times: a graceful dusk (0 W first) is sleep, a cut while producing is a fault', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  presence.update(inventory, snap({ power: 0, sun: false }), NOON);
  let result = presence.update(inventory, snap({ available: false, sun: false }), NOON + 60000);
  assert.equal(result.entries.get('aa1111').status, 'sleeping');
  assert.deepEqual(result.events, []);

  const cut = createPresence({ timeZone: 'Europe/Paris' });
  cut.update(inventory, snap({ power: 250, sun: false }), NOON);
  result = cut.update(inventory, snap({ available: false, sun: false }), NOON + 60000);
  assert.equal(result.entries.get('aa1111').status, 'unreachable');
  assert.equal(result.events.length, 1);
});

test('the DTU lost by day: an event with the cause "dtu"; by night: nothing', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  presence.update(inventory, snap(), NOON);
  let result = presence.update(inventory, null, NOON + 60000);
  assert.equal(result.entries.get('aa1111').status, 'dtuUnreachable');
  assert.deepEqual(result.events, [{ kind: 'unreachable', serial: 'aa1111', cause: 'dtu' }]);

  const atNight = createPresence({ timeZone: 'Europe/Paris' });
  atNight.update(inventory, snap({ power: 0 }), SUNSET + 10 * 60000);
  result = atNight.update(inventory, null, SUNSET + 20 * 60000);
  assert.deepEqual(result.events, []);
});

test('production started: the morning wake-up, once a day, never on the first reading', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  assert.deepEqual(presence.update(inventory, snap(), NOON).events, [], 'first reading');
  presence.update(inventory, snap({ available: false }), SUNSET + H);
  const morning = SUNRISE + 24 * H + H;
  presence.update(inventory, snap({ power: 0 }), morning);
  let result = presence.update(inventory, snap({ power: 40 }), morning + 60000);
  assert.deepEqual(result.events, [{ kind: 'started', serial: 'aa1111', power: 40 }]);
  // A cloud at 0 W, then the sun again: not a new start.
  presence.update(inventory, snap({ power: 0 }), morning + 2 * H);
  result = presence.update(inventory, snap({ power: 80 }), morning + 3 * H);
  assert.deepEqual(result.events, []);
});

test('asleep since before midnight: the day counters go back to 0', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  presence.update(inventory, snap({ power: 0 }), SUNSET);
  let result = presence.update(inventory, snap({ available: false }), SUNSET + H);
  assert.equal(result.entries.get('aa1111').resetToday, false, 'same day');
  result = presence.update(
    inventory,
    snap({ available: false }),
    Date.parse('2026-06-21T22:30:00Z'),
  );
  assert.equal(result.entries.get('aa1111').resetToday, true, 'after midnight in Paris');
});

test('an inverter disabled in Ahoy: never reachable, no event', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  const disabled = { inverters: [{ serial: 'aa1111', enabled: false }] };
  presence.update(disabled, snap(), NOON);
  const result = presence.update(disabled, snap(), NOON + 60000);
  assert.equal(result.entries.get('aa1111').status, 'disabled');
  assert.deepEqual(result.events, []);
});

test('a fade before the astronomical sunset (winter, shade, Ahoy offset): asleep, no event', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  presence.update(inventory, snap({ power: 3 }), SUNSET - H);
  let result = presence.update(inventory, snap({ available: false }), SUNSET - H + 60000);
  assert.equal(result.entries.get('aa1111').status, 'sleeping');
  assert.deepEqual(result.events, []);
  // Next morning, after sunrise, before the inverter wakes: still asleep.
  result = presence.update(inventory, snap({ available: false }), SUNRISE + 24 * H + 30 * 60000);
  assert.equal(result.entries.get('aa1111').status, 'sleeping');
  // Cut while producing within the twilight margin: asleep too (Ahoy may stop polling).
  const late = createPresence({ timeZone: 'Europe/Paris' });
  late.update(inventory, snap({ power: 40 }), SUNSET - 30 * 60000);
  result = late.update(inventory, snap({ available: false }), SUNSET - 29 * 60000);
  assert.equal(result.entries.get('aa1111').status, 'sleeping');
  assert.deepEqual(result.events, []);
});

test('a container started in the night: the day counter of yesterday goes back to 0', () => {
  const presence = createPresence({ timeZone: 'Europe/Paris' });
  let result = presence.update(
    inventory,
    snap({ available: false }),
    Date.parse('2026-06-22T00:30:00Z'),
  );
  assert.equal(result.entries.get('aa1111').resetToday, true, '02:30 in Paris');
  const evening = createPresence({ timeZone: 'Europe/Paris' });
  result = evening.update(
    inventory,
    snap({ available: false }),
    Date.parse('2026-06-21T20:30:00Z'),
  );
  assert.equal(result.entries.get('aa1111').resetToday, false, '22:30 in Paris: still today');
});
