// -----------------------------------------------------------------------------
// The "AhoyDTU" dashboard widget: the production now and today, a 24-hour
// chart, and one status line per inverter.
//
// A widget never costs a request to the DTU: the content is built from the
// last cycle. With a single inverter added to Gladys, the tiles are bound to
// its features (the core animates them live); with several, they carry the
// sums. The chart needs the history Gladys keeps: created features only.
//
// Budget of the core: 8 components. This content uses at most 2 tiles,
// 1 chart and 1 status list. The chart and the inverter lines can be hidden
// (widget settings).
// -----------------------------------------------------------------------------

import {
  WIDGET_CHART_INTERVALS,
  WIDGET_CHART_TYPES,
  WIDGET_COLORS,
} from '@gladysassistant/integration-sdk';
import { FEATURES, inverterIds } from './devices.js';
import { INVERTER_STATES, WIDGET_MESSAGES, WIDGET_TEXT, formatNumber, pick } from './i18n.js';
import { displayName } from './triggers.js';

export const WIDGET_KEY = 'production';
export const WIDGET_TTL_SECONDS = 60;
export const WIDGET_SETTINGS_DEFAULTS = { show_chart: true, show_inverters: true };

const STATUS_COLORS = {
  producing: WIDGET_COLORS.SUCCESS,
  standby: WIDGET_COLORS.NEUTRAL,
  sleeping: WIDGET_COLORS.NEUTRAL,
  disabled: WIDGET_COLORS.NEUTRAL,
  unreachable: WIDGET_COLORS.DANGER,
  dtuUnreachable: WIDGET_COLORS.DANGER,
};

export function messageContent(text, language) {
  return {
    ttl_seconds: WIDGET_TTL_SECONDS,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

function clockText(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

const setting = (settings, key) =>
  typeof settings?.[key] === 'boolean' ? settings[key] : WIDGET_SETTINGS_DEFAULTS[key];

/**
 * @param {object} input
 * @param {object} input.gladys
 * @param {{ inverters: object[] }} input.inventory
 * @param {Map<string, object>} input.entries presence entries, by serial
 * @param {number} input.updatedAt
 * @param {Set<string>} input.created feature external ids Gladys has
 * @param {object} [input.settings]
 * @param {string} input.language
 * @param {string} [input.timeZone]
 */
export function buildProductionContent({
  gladys,
  inventory,
  entries,
  updatedAt,
  created,
  settings,
  language,
  timeZone,
}) {
  const inverters = inventory.inverters.filter((inverter) => inverter.enabled);
  const createdInverters = inverters.filter((inverter) =>
    created.has(inverterIds(gladys, inverter).feature(FEATURES.acPower)),
  );
  const shown = createdInverters.length > 0 ? createdInverters : inverters;

  let power = 0;
  let today = 0;
  let todayKnown = false;
  for (const inverter of shown) {
    const reading = entries.get(inverter.serial)?.reading;
    power += Math.max(reading?.acPower ?? 0, 0);
    if (typeof reading?.today === 'number') {
      today += reading.today;
      todayKnown = true;
    }
  }

  const components = [];
  const single = createdInverters.length === 1 ? inverterIds(gladys, createdInverters[0]) : null;
  components.push(
    single
      ? {
          type: 'value',
          label: pick(WIDGET_TEXT.production, language),
          icon: 'sun',
          device_feature: single.feature(FEATURES.acPower),
        }
      : {
          type: 'value',
          label: pick(WIDGET_TEXT.production, language),
          icon: 'sun',
          value: Math.round(power),
          unit: 'W',
        },
  );
  if (single) {
    components.push({
      type: 'value',
      label: pick(WIDGET_TEXT.today, language),
      icon: 'sunrise',
      device_feature: single.feature(FEATURES.productionToday),
    });
  } else if (todayKnown) {
    components.push({
      type: 'value',
      label: pick(WIDGET_TEXT.today, language),
      icon: 'sunrise',
      value: formatNumber(today / 1000, 2, language),
      unit: 'kWh',
    });
  }

  if (setting(settings, 'show_chart') && createdInverters.length > 0) {
    components.push({
      type: 'chart',
      title: pick(WIDGET_TEXT.chartTitle, language),
      device_features: createdInverters
        .slice(0, 5)
        .map((inverter) => inverterIds(gladys, inverter).feature(FEATURES.acPower)),
      interval: WIDGET_CHART_INTERVALS.LAST_DAY,
      chart_type: WIDGET_CHART_TYPES.LINE,
    });
  }

  const items = [];
  if (setting(settings, 'show_inverters')) {
    for (const inverter of shown.slice(0, 8)) {
      const entry = entries.get(inverter.serial);
      if (!entry) continue;
      let value = pick(INVERTER_STATES[entry.status], language);
      if (entry.reading && entry.status === 'producing') {
        value = `${Math.round(entry.reading.acPower ?? 0)} W`;
      }
      const limit = entry.reading?.powerLimit;
      if (typeof limit === 'number' && limit > 0 && limit < 100) {
        value = `${value} · ${pick(WIDGET_TEXT.limit, language)} ${Math.round(limit)} %`;
      }
      items.push({
        label: displayName(gladys, inverter).slice(0, 40),
        value: value.slice(0, 40),
        icon: 'cpu',
        color: STATUS_COLORS[entry.status],
      });
    }
  }
  items.push({
    label: pick(WIDGET_TEXT.updated, language),
    value: clockText(updatedAt, timeZone),
    icon: 'clock',
  });
  components.push({ type: 'status', items });
  return { ttl_seconds: WIDGET_TTL_SECONDS, components };
}

export const notConfiguredContent = (language) =>
  messageContent(WIDGET_MESSAGES.notConfigured, language);
export const noDataContent = (language) => messageContent(WIDGET_MESSAGES.noData, language);
