import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('defaults: no token, French, instant wind on', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  assert.equal(isConfigured(normalizeConfig()), false);
});

test('the token is trimmed, unknown values fall back to the defaults', () => {
  const config = normalizeConfig({ token: '  "abc-123"\n', language: 'it', rapid_wind: 'false' });
  assert.equal(config.token, 'abc-123');
  assert.equal(config.language, 'fr');
  assert.equal(config.rapid_wind, false);
  assert.equal(isConfigured(config), true);
  assert.equal(normalizeConfig({ rapid_wind: 'true' }).rapid_wind, true);
  assert.equal(normalizeConfig({ rapid_wind: false }).rapid_wind, false);
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ token: 42 }).token, '');
});
