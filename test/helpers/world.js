// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the fake Tempest cloud, and
// the integration wired on top through registerHandlers — the same wiring as
// index.js.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FIXTURE_NOW_MS, GARDEN, TOKEN, createFakeTempest } from './fakeTempest.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

/** A clock the tests move by hand. */
export function createClock(start = FIXTURE_NOW_MS) {
  let current = start;
  const now = () => current;
  now.advance = (ms) => {
    current += ms;
  };
  now.set = (ms) => {
    current = ms;
  };
  return now;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] run the container's refresh timer
 * @param {() => number} [options.now]
 */
export async function createWorld({
  config = { token: TOKEN },
  devices = [],
  connect = true,
  timers = false,
  now = createClock(),
} = {}) {
  const cloud = createFakeTempest();
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: cloud.fetch,
    createWebSocket: cloud.createWebSocket,
    now,
    timers,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, cloud, app, hub: app.hub, now };
}

/** Create the device of a discovered station in Gladys, as the user would. */
export async function addStation(world, stationId = GARDEN.stationId) {
  const externalId = world.gladys.externalIds('station', String(stationId)).device;
  const device = world.gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  if (!device) {
    throw new Error(`station ${stationId} was not discovered`);
  }
  await world.gladys.fake.deviceCreated(device);
  return device;
}

/** A feature external id of a station. */
export const featureId = (gladys, key, stationId = GARDEN.stationId) =>
  gladys.externalIds('station', String(stationId)).feature(key);

/** Let the pending promise callbacks run. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
