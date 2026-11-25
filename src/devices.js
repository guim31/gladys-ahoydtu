// -----------------------------------------------------------------------------
// One Gladys device per inverter configured in AhoyDTU, and its states.
//
// External id (forever): the inverter serial, as Ahoy writes it (hex, lower
// case). Feature keys (forever): FEATURES below; the panel features are
// numbered in the order of the inverter's DC inputs (dc_power_1...).
//
// Every feature is a read-only measurement. The power limit is an action
// (manifest `actions` and `scene_actions`), off by default: a scene or a
// voice assistant must not be able to throttle the production by mistake.
//
// No frequency, current or efficiency feature: Gladys has no unit for hertz,
// and the others say little on a dashboard.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { DEVICE_NAMES, FEATURE_NAMES, INVERTER_STATES, pick } from './i18n.js';

export const INVERTER_TYPE = 'inverter';

// The container refreshes the devices itself (src/app.js). The devices still
// ask the core to poll them once a minute: onPoll is the fallback if the
// container's timer ever stalls (GladysAssistant/Gladys#3198).
export const CORE_POLL_FREQUENCY = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES;

export const FEATURES = {
  acPower: 'ac_power',
  productionToday: 'production_today',
  productionTotal: 'production_total',
  acVoltage: 'ac_voltage',
  temperature: 'temperature',
  reachable: 'reachable',
  state: 'state',
  dcPower: (input) => `dc_power_${input}`,
  dcToday: (input) => `dc_today_${input}`,
};

export const inverterIds = (gladys, inverter) => gladys.externalIds(INVERTER_TYPE, inverter.serial);

// Display bounds (the core never applies them to the values).
const KIND = {
  power: { unit: U.WATT, min: 0, max: 5000 },
  dayEnergy: { unit: U.KILOWATT_HOUR, min: 0, max: 100 },
  index: { unit: U.KILOWATT_HOUR, min: 0, max: 1000000000 },
  voltage: { unit: U.VOLT, min: 0, max: 300 },
  temperature: { unit: U.CELSIUS, min: -40, max: 100 },
  binary: { min: 0, max: 1 },
  text: { min: 0, max: 0 },
};

const COUPLES = {
  power: [C.ENERGY_PRODUCTION_SENSOR, T.ENERGY_PRODUCTION_SENSOR.POWER],
  today: [C.ENERGY_PRODUCTION_SENSOR, T.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION],
  index: [C.ENERGY_PRODUCTION_SENSOR, T.ENERGY_PRODUCTION_SENSOR.INDEX],
  voltage: [C.ENERGY_SENSOR, T.ENERGY_SENSOR.VOLTAGE],
  temperature: [C.DEVICE_TEMPERATURE_SENSOR, T.SENSOR.DECIMAL],
  // A generic binary: Gladys has no "online" couple for a sensor.
  reachable: [C.UNKNOWN, T.SENSOR.BINARY],
  text: [C.TEXT, T.TEXT.TEXT],
};

function feature(ids, key, name, language, [category, type], kind) {
  return {
    name: pick(name, language),
    external_id: ids.feature(key),
    category,
    type,
    ...(kind.unit ? { unit: kind.unit } : {}),
    min: kind.min,
    max: kind.max,
    read_only: true,
    has_feedback: false,
    keep_history: kind !== KIND.text,
  };
}

/** The device of an inverter, ready for publishDiscoveredDevices. */
export function buildInverter(gladys, inverter, config) {
  const ids = inverterIds(gladys, inverter);
  const { language } = config;
  const F = FEATURES;
  const N = FEATURE_NAMES;
  const features = [
    feature(ids, F.acPower, N.acPower, language, COUPLES.power, KIND.power),
    feature(ids, F.productionToday, N.productionToday, language, COUPLES.today, KIND.dayEnergy),
    feature(ids, F.productionTotal, N.productionTotal, language, COUPLES.index, KIND.index),
    feature(ids, F.acVoltage, N.acVoltage, language, COUPLES.voltage, KIND.voltage),
    feature(ids, F.temperature, N.temperature, language, COUPLES.temperature, KIND.temperature),
    feature(ids, F.reachable, N.reachable, language, COUPLES.reachable, KIND.binary),
    feature(ids, F.state, N.state, language, COUPLES.text, KIND.text),
  ];
  for (let input = 1; input <= inverter.channels; input += 1) {
    const label = inverter.channelNames[input - 1] ?? '';
    features.push(
      feature(ids, F.dcPower(input), N.dcPower(input, label), language, COUPLES.power, KIND.power),
      feature(
        ids,
        F.dcToday(input),
        N.dcToday(input, label),
        language,
        COUPLES.today,
        KIND.dayEnergy,
      ),
    );
  }
  return {
    name: inverter.name || pick(DEVICE_NAMES.inverter(inverter.serial), language),
    external_id: ids.device,
    should_poll: true,
    poll_frequency: CORE_POLL_FREQUENCY,
    features,
  };
}

export function buildDevices(gladys, inventory, config) {
  return inventory
    ? inventory.inverters.map((inverter) => buildInverter(gladys, inverter, config))
    : [];
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

function numeric(list, externalId, value, digits) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    list.push({ device_feature_external_id: externalId, state: round(value, digits) });
  }
}

const kwh = (wh) => (typeof wh === 'number' ? wh / 1000 : null);

/**
 * The states of an inverter, from its presence entry (src/presence.js).
 * @param {object|undefined} entry { status, reachable, reading, resetToday }
 */
export function inverterStates(gladys, inverter, entry, config) {
  if (!entry) {
    return [];
  }
  const ids = inverterIds(gladys, inverter);
  const F = FEATURES;
  const states = [
    { device_feature_external_id: ids.feature(F.reachable), state: entry.reachable ? 1 : 0 },
    {
      device_feature_external_id: ids.feature(F.state),
      text: pick(INVERTER_STATES[entry.status], config.language),
    },
  ];
  const reading = entry.reading;
  if (reading) {
    numeric(states, ids.feature(F.acPower), Math.max(reading.acPower ?? 0, 0), 0);
    numeric(states, ids.feature(F.productionToday), kwh(reading.today), 3);
    // A total of 0 is a counter not read yet (Ahoy resets its values when
    // configured to): never a real lifetime production, and it would break
    // the history of the index.
    if (reading.total > 0) {
      numeric(states, ids.feature(F.productionTotal), reading.total, 3);
    }
    // 0 V is the value of a phase Ahoy has not read yet.
    if (reading.acVoltage > 0) {
      numeric(states, ids.feature(F.acVoltage), reading.acVoltage, 1);
    }
    numeric(states, ids.feature(F.temperature), reading.temperature, 1);
    for (let input = 1; input <= inverter.channels; input += 1) {
      const dc = reading.dc[input - 1];
      numeric(states, ids.feature(F.dcPower(input)), Math.max(dc?.power ?? 0, 0), 1);
      numeric(states, ids.feature(F.dcToday(input)), kwh(dc?.today ?? null), 3);
    }
  } else if (entry.status === 'sleeping' || entry.status === 'disabled') {
    // Asleep: it produces nothing. Not said of an inverter that does not
    // answer by day, nor while the DTU is down: its power is unknown.
    numeric(states, ids.feature(F.acPower), 0, 0);
    for (let input = 1; input <= inverter.channels; input += 1) {
      numeric(states, ids.feature(F.dcPower(input)), 0, 1);
    }
  }
  if (!reading && entry.resetToday) {
    numeric(states, ids.feature(F.productionToday), 0, 3);
    for (let input = 1; input <= inverter.channels; input += 1) {
      numeric(states, ids.feature(F.dcToday(input)), 0, 3);
    }
  }
  return states;
}

export function buildStates(gladys, inventory, entries, config) {
  return inventory.inverters.flatMap((inverter) =>
    inverterStates(gladys, inverter, entries.get(inverter.serial), config),
  );
}
