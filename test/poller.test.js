// -----------------------------------------------------------------------------
// The container refreshes itself: the core's onPoll is not needed
// (GladysAssistant/Gladys#3198), and while the timer runs it costs nothing.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUB_TIMINGS } from '../src/hub.js';
import { POLL_PERIOD_MS } from '../src/poller.js';
import { GARDEN } from './helpers/fakeTempest.js';
import { addStation, createWorld, featureId, flush } from './helpers/world.js';

async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await flush();
  }
}

test('the states refresh on the container timer, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  const { gladys, cloud, now } = world;
  await addStation(world);
  // The live feed never opens: the REST fallback carries the observations.
  const temperature = () => gladys.fake.lastState(featureId(gladys, 'temperature'));
  assert.equal(temperature(), 10.5);

  const observation = cloud.observations[GARDEN.stationId].obs[0];
  for (const value of [11.3, 12.1]) {
    observation.timestamp += 60;
    observation.air_temperature = value;
    now.advance(POLL_PERIOD_MS);
    t.mock.timers.tick(POLL_PERIOD_MS);
    await settle();
    assert.equal(temperature(), value);
  }
  // gladys.fake.poll() was never called: the timer alone refreshed the states.
  world.app.stop();
});

test("the core's onPoll is a fallback: skipped right after a timer cycle", async () => {
  const world = await createWorld();
  const { gladys, cloud, now } = world;
  const device = await addStation(world);
  const reads = () => cloud.requests.filter((r) => r.path.startsWith('observations')).length;
  const before = reads();
  now.advance(10 * 1000);
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.equal(reads(), before);
  // The timer stalled: the core's poll does the work.
  now.advance(POLL_PERIOD_MS);
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.equal(reads(), before + 1);
  world.app.stop();
});

test('every refresh sends a heartbeat well under 12 hours', async (t) => {
  assert.ok(HUB_TIMINGS.heartbeatMs <= 12 * 60 * 60 * 1000);
  const world = await createWorld();
  const calls = [];
  const original = world.gladys.publishChangedStates.bind(world.gladys);
  t.mock.method(world.gladys, 'publishChangedStates', (states, options) => {
    calls.push(options);
    return original(states, options);
  });
  await addStation(world);
  assert.ok(calls.length > 0);
  for (const options of calls) {
    assert.equal(options.heartbeat, HUB_TIMINGS.heartbeatMs);
  }
  world.app.stop();
});
