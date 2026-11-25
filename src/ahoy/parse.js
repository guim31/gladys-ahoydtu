// -----------------------------------------------------------------------------
// AhoyDTU JSON → plain objects. Pure.
//
// Shapes, from src/web/RestApi.h of lumapu/ahoy 0.8.x:
// - /api/inverter/list: `inverter[]` { id, enabled, name, serial (hex),
//   channels, ch_name[] } — the configuration;
// - /api/index: `ts_now`, `ts_sunrise`, `ts_sunset` (0 without coordinates),
//   `inverter[]` { id, is_avail, is_producing, cur_pwr, ts_last_success };
// - /api/live: `ch0_fld_names[]` and `fld_names[]`, the order of the values of
//   `ch[0]` (AC) and `ch[1..]` (DC inputs) in /api/inverter/id/<id>;
// - /api/inverter/id/<id>: `ch[][]`, `power_limit_read` (%), `status`.
//
// Values come as numbers, already scaled: YieldDay in Wh, YieldTotal in kWh.
// -----------------------------------------------------------------------------

import { AhoyError } from './client.js';

// The field order of Ahoy 0.8.x (acList / dcList of RestApi.h), used when
// /api/live does not give it.
export const DEFAULT_AC_FIELDS = [
  'U_AC',
  'I_AC',
  'P_AC',
  'F_AC',
  'PF_AC',
  'Temp',
  'YieldTotal',
  'YieldDay',
  'P_DC',
  'Efficiency',
  'Q_AC',
  'MaxPower',
  'MaxTemp',
];
export const DEFAULT_DC_FIELDS = [
  'U_DC',
  'I_DC',
  'P_DC',
  'YieldDay',
  'YieldTotal',
  'Irradiation',
  'MaxPower',
];

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

function formatError(what) {
  return new AhoyError(`unexpected ${what}: is this an AhoyDTU 0.8?`, { kind: 'format' });
}

/**
 * @returns {{ id: number, serial: string, name: string, enabled: boolean, channels: number, channelNames: string[] }[]}
 */
export function parseInverterList(json) {
  if (!Array.isArray(json?.inverter)) {
    throw formatError('inverter list');
  }
  const inverters = [];
  for (const entry of json.inverter) {
    const serial = text(entry?.serial).toLowerCase();
    const id = number(entry?.id);
    // An empty slot has serial 0: nothing configured there.
    if (id === null || !/^[0-9a-f]{6,16}$/.test(serial) || /^0+$/.test(serial)) {
      continue;
    }
    const channels = Math.max(0, Math.min(6, Math.trunc(number(entry.channels) ?? 0)));
    const names = Array.isArray(entry.ch_name) ? entry.ch_name : [];
    inverters.push({
      id,
      serial,
      name: text(entry.name),
      enabled: entry.enabled !== false,
      channels,
      channelNames: Array.from({ length: channels }, (_, i) => text(names[i])),
    });
  }
  return inverters;
}

/**
 * @returns {{ version: string, now: number|null, sunrise: number|null, sunset: number|null, inverters: Map<number, { available: boolean, producing: boolean, power: number|null }> }}
 *   times in ms (null: unknown)
 */
export function parseIndex(json) {
  if (!Array.isArray(json?.inverter)) {
    throw formatError('index');
  }
  const seconds = (value) => {
    const n = number(value);
    return n && n > 0 ? n * 1000 : null;
  };
  const inverters = new Map();
  for (const entry of json.inverter) {
    const id = number(entry?.id);
    if (id === null) continue;
    inverters.set(id, {
      available: entry.is_avail === true,
      producing: entry.is_producing === true,
      power: number(entry.cur_pwr),
    });
  }
  return {
    version: text(json.generic?.version),
    now: seconds(json.ts_now),
    sunrise: seconds(json.ts_sunrise),
    sunset: seconds(json.ts_sunset),
    inverters,
  };
}

/** The field names of /api/live, or the 0.8 defaults. */
export function parseFieldNames(json) {
  const list = (value, fallback) =>
    Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')
      ? value
      : fallback;
  return {
    ac: list(json?.ch0_fld_names, DEFAULT_AC_FIELDS),
    dc: list(json?.fld_names, DEFAULT_DC_FIELDS),
  };
}

/**
 * The values of one inverter.
 * @param {object} json /api/inverter/id/<id>
 * @param {{ ac: string[], dc: string[] }} fields
 * @returns {{ acPower, acVoltage, temperature, today, total, powerLimit, dc: { power, today }[] }}
 *   W, V, °C, Wh, kWh, %; null when absent
 */
export function parseInverter(json, fields) {
  if (!Array.isArray(json?.ch) || !Array.isArray(json.ch[0])) {
    if (typeof json?.error === 'string') {
      throw new AhoyError(`inverter not found (${json.error})`, { kind: 'format' });
    }
    throw formatError('inverter values');
  }
  const value = (row, names, name) => {
    const index = names.indexOf(name);
    return index < 0 ? null : number(row?.[index]);
  };
  const ac = json.ch[0];
  return {
    acPower: value(ac, fields.ac, 'P_AC'),
    acVoltage: value(ac, fields.ac, 'U_AC') ?? value(ac, fields.ac, 'U_AC_1N'),
    temperature: value(ac, fields.ac, 'Temp'),
    today: value(ac, fields.ac, 'YieldDay'),
    total: value(ac, fields.ac, 'YieldTotal'),
    powerLimit: number(json.power_limit_read),
    dc: json.ch.slice(1).map((row) => ({
      power: value(row, fields.dc, 'P_DC'),
      today: value(row, fields.dc, 'YieldDay'),
    })),
  };
}
