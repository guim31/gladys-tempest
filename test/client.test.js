// -----------------------------------------------------------------------------
// The REST client: what it asks, and how it reports a refusal or an outage
// without ever repeating the token.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TempestApiError, createTempestClient } from '../src/tempest/client.js';
import { TOKEN, createFakeTempest } from './helpers/fakeTempest.js';

test('the token travels in the query string, the forecast is asked in metric units', async () => {
  const cloud = createFakeTempest();
  const seen = [];
  const client = createTempestClient({
    token: TOKEN,
    fetch: (url, init) => {
      seen.push(url);
      assert.equal(init.headers.Accept, 'application/json');
      return cloud.fetch(url);
    },
  });
  await client.getStations();
  await client.getStationObservation(20001);
  await client.getForecast(20001);
  assert.equal(seen[0].searchParams.get('token'), TOKEN);
  assert.deepEqual(
    cloud.requests.map((r) => r.path),
    ['stations', 'observations/station/20001', 'better_forecast'],
  );
  assert.deepEqual(cloud.requests[2].query, {
    station_id: '20001',
    units_temp: 'c',
    units_wind: 'mps',
    units_pressure: 'mb',
    units_precip: 'mm',
    units_distance: 'km',
  });
});

test('a refused token is an auth error, whose message never holds the token', async () => {
  const cloud = createFakeTempest({ token: 'another-token' });
  const client = createTempestClient({ token: TOKEN, fetch: cloud.fetch });
  await assert.rejects(client.getStations(), (err) => {
    assert.ok(err instanceof TempestApiError);
    assert.equal(err.isAuthError, true);
    assert.equal(err.status, 401);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
});

test('an error status inside a 200 body is an error too', async () => {
  const client = createTempestClient({
    token: TOKEN,
    fetch: async () =>
      new Response(
        JSON.stringify({ status: { status_code: 1, status_message: 'INTERNAL_ERROR' } }),
      ),
  });
  await assert.rejects(client.getStations(), /reported an error \(1 INTERNAL_ERROR\)/);
  const unauthorized = createTempestClient({
    token: TOKEN,
    fetch: async () => new Response(JSON.stringify({ status: { status_code: 401 } })),
  });
  await assert.rejects(unauthorized.getStations(), (err) => err.isAuthError);
});

test('network failures, timeouts, rate limits and unreadable answers', async () => {
  const cloud = createFakeTempest();
  cloud.failures.stations = 'down';
  const client = createTempestClient({ token: TOKEN, fetch: cloud.fetch });
  await assert.rejects(client.getStations(), (err) => {
    assert.equal(err.code, 'network');
    assert.match(err.message, /unreachable \(ECONNREFUSED\)/);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });

  cloud.failures.stations = 429;
  await assert.rejects(client.getStations(), (err) => err.code === 'rate_limited');
  cloud.failures.stations = 500;
  await assert.rejects(client.getStations(), /HTTP 500/);

  const timeout = createTempestClient({
    token: TOKEN,
    fetch: async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    },
  });
  await assert.rejects(timeout.getStations(), (err) => err.code === 'timeout');

  const garbage = createTempestClient({ token: TOKEN, fetch: async () => new Response('<html>') });
  await assert.rejects(garbage.getStations(), (err) => err.code === 'invalid');

  const missing = createTempestClient({ token: TOKEN, fetch: cloud.fetch });
  await assert.rejects(missing.getStationObservation(99), (err) => err.code === 'not_found');
});
