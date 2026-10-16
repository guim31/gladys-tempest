// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle, one line when a
// failure starts and one when it ends, never the token.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, TOKEN } from './helpers/fakeTempest.js';
import { addStation, createWorld, flush } from './helpers/world.js';

const MINUTE = 60 * 1000;

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

const atLevel = (lines, level) => lines.filter((line) => line.includes(`[${level}]`));

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await createWorld();
  await addStation(world);
  world.cloud.socket.accept();
  await flush();
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 5; i += 1) {
    const message = structuredClone(FIXTURES.websocket.obs_st);
    message.obs[0][0] += 60 * (i + 1);
    message.obs[0][7] += i / 10;
    world.cloud.socket.push(message);
    world.cloud.socket.push(FIXTURES.websocket.rapid_wind);
    await flush();
    world.now.advance(MINUTE);
    await world.hub.cycle();
  }
  // The forecast refresh, too.
  world.now.advance(30 * MINUTE);
  await world.hub.cycle();
  assert.deepEqual(lines, []);
  world.app.stop();
});

test('a failure is told once, its end once, the rest goes to debug', async (t) => {
  const world = await createWorld();
  await addStation(world);
  const lines = captureLogs(t, 'info');
  world.cloud.failures['observations'] = 'down';
  for (let i = 0; i < 4; i += 1) {
    world.now.advance(MINUTE);
    await world.hub.cycle();
  }
  assert.equal(atLevel(lines, 'WARN').length, 1);
  delete world.cloud.failures['observations'];
  world.now.advance(MINUTE);
  await world.hub.cycle();
  assert.equal(atLevel(lines, 'INFO').length, 1);
  assert.match(atLevel(lines, 'INFO')[0], /observations are back/);
  world.app.stop();
});

test('the token never appears in the logs, at any level', async (t) => {
  const lines = captureLogs(t, 'debug');
  // Startup, refused token, then accepted, live feed, outages, actions.
  const world = await createWorld({ config: { token: TOKEN } });
  await addStation(world);
  world.cloud.socket.accept();
  world.cloud.socket.push(FIXTURES.websocket.obs_st);
  world.cloud.socket.serverClose(1006);
  world.cloud.failures['better_forecast'] = 500;
  world.cloud.failures['observations'] = 'down';
  world.now.advance(31 * MINUTE);
  await world.hub.cycle();
  world.cloud.token = 'revoked';
  await world.gladys.fake.action('list_stations', {});
  await world.gladys.fake.configUpdated({ token: TOKEN });
  await flush();
  assert.ok(lines.length > 5, 'the scenario logs something');
  for (const line of lines) {
    assert.ok(!line.includes(TOKEN), `token in: ${line}`);
    assert.ok(!line.includes('token='), `URL in: ${line}`);
  }
  world.app.stop();
});
