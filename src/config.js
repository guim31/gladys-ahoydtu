// -----------------------------------------------------------------------------
// Configuration of the integration, as filled in by the user from the
// manifest `config_schema`. DEFAULT_CONFIG mirrors the manifest defaults
// (test/manifest.test.js keeps them equal); normalizeConfig() turns whatever
// the form sends into checked values, so the rest of the code never deals
// with an empty or malformed field.
// -----------------------------------------------------------------------------

export const LANGUAGE_OPTIONS = ['fr', 'en', 'de', 'es'];
// Refresh intervals offered in the form, in seconds. AhoyDTU itself asks the
// inverters every 15 s by default ("Interval" of its settings): reading it
// faster only reads the same values again.
export const POLL_INTERVALS_S = [10, 15, 30, 60];

export const DEFAULT_CONFIG = {
  host: '',
  password: '',
  poll_interval: '15',
  allow_power_limit: false,
  language: 'fr',
};

/**
 * Turn what the user typed into the base URL of AhoyDTU.
 * "192.0.2.10", "192.0.2.10:8080", "http://ahoy-dtu.local/" are accepted; a
 * path is dropped, and so are credentials (they must not end up in a log
 * line: the password has its own field).
 * @returns {{ baseUrl: string, valid: boolean }} baseUrl '' when empty or invalid
 */
export function parseHost(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') {
    return { baseUrl: '', valid: true };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { baseUrl: '', valid: false };
  }
  // AhoyDTU serves plain HTTP only (no TLS on the ESP).
  if (url.protocol !== 'http:' || url.hostname === '') {
    return { baseUrl: '', valid: false };
  }
  return { baseUrl: `${url.protocol}//${url.host}`, valid: true };
}

/** A boolean from the form (true, "true", 1, "1"); anything else is false. */
function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * @param {Record<string, unknown>} [raw] the config from the SDK
 */
export function normalizeConfig(raw = {}) {
  const { baseUrl, valid } = parseHost(raw.host ?? DEFAULT_CONFIG.host);
  const interval = Number(raw.poll_interval ?? DEFAULT_CONFIG.poll_interval);
  return {
    baseUrl,
    hostValid: valid,
    password: typeof raw.password === 'string' ? raw.password : '',
    pollIntervalMs:
      (POLL_INTERVALS_S.includes(interval) ? interval : Number(DEFAULT_CONFIG.poll_interval)) *
      1000,
    allowPowerLimit: bool(raw.allow_power_limit),
    language: LANGUAGE_OPTIONS.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
  };
}

/** AhoyDTU can be reached once an address is set. */
export function isConfigured(config) {
  return config.baseUrl !== '';
}
