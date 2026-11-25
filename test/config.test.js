// -----------------------------------------------------------------------------
// The configuration form, normalized.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseHost } from '../src/config.js';

test('the address: IP, port, host name; scheme, path and credentials dropped', () => {
  assert.deepEqual(parseHost('192.0.2.20'), { baseUrl: 'http://192.0.2.20', valid: true });
  assert.equal(parseHost(' 192.0.2.20:8080/index ').baseUrl, 'http://192.0.2.20:8080');
  assert.equal(parseHost('http://user:pw@ahoy-dtu.local/').baseUrl, 'http://ahoy-dtu.local');
  assert.deepEqual(parseHost(''), { baseUrl: '', valid: true });
  // AhoyDTU serves no HTTPS.
  assert.equal(parseHost('https://192.0.2.20').valid, false);
  assert.equal(parseHost('ftp://192.0.2.20').valid, false);
});

test('defaults and checked values', () => {
  const config = normalizeConfig({});
  assert.equal(config.pollIntervalMs, 15000);
  assert.equal(config.allowPowerLimit, false);
  assert.equal(config.language, 'fr');
  assert.equal(config.password, '');
  const custom = normalizeConfig({
    poll_interval: '60',
    allow_power_limit: 'true',
    language: 'es',
    password: 'p',
  });
  assert.equal(custom.pollIntervalMs, 60000);
  assert.equal(custom.allowPowerLimit, true);
  assert.equal(custom.language, 'es');
  assert.equal(normalizeConfig({ poll_interval: '5', language: 'it' }).pollIntervalMs, 15000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
