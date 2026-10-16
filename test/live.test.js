// -----------------------------------------------------------------------------
// End to end, on the SDK's fake Gladys and the fake Tempest cloud: discovery,
// states, live feed, scene events, REST fallback, connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, GARDEN, TOKEN } from './helpers/fakeTempest.js';
import { addStation, createWorld, featureId, flush } from './helpers/world.js';

const MINUTE = 60 * 1000;

async function worldWithStation(options) {
  const world = await createWorld(options);
  await addStation(world);
  world.cloud.socket.accept();
  return world;
}

test('without a token, nothing is asked and the status says what to do', async () => {
  const { gladys, cloud, app } = await createWorld({ config: {} });
  assert.equal(cloud.requests.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /jeton/);
  app.stop();
});

test('a refused token is reported, and not asked again every minute', async () => {
  const { gladys, cloud, hub, app, now } = await createWorld({ config: { token: 'wrong' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused/);
  assert.equal(hub.status, 'unauthorized');
  assert.equal(cloud.sockets.length, 0);
  now.advance(MINUTE);
  await hub.cycle();
  assert.equal(cloud.requests.length, 1);
  now.advance(30 * MINUTE);
  await hub.cycle();
  assert.equal(cloud.requests.length, 2);
  // A new token starts over.
  await gladys.fake.configUpdated({ token: TOKEN });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  app.stop();
});

test('discovery offers the Tempest station, a new device gets every state at once', async () => {
  const world = await createWorld();
  const { gladys, cloud } = world;
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Garden'],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  // Nothing is followed before the user adds the station.
  assert.equal(cloud.sockets.length, 0);
  assert.deepEqual(
    cloud.requests.map((r) => r.path),
    ['stations'],
  );

  await addStation(world);
  const state = (key) => gladys.fake.lastState(featureId(gladys, key));
  assert.equal(state('temperature'), 10.5);
  assert.equal(state('pressure_sea_level'), 1006.2);
  assert.equal(state('wind_speed'), 5);
  assert.equal(state('wind_direction'), 203);
  assert.equal(state('precipitation_type'), 'Aucune précipitation');
  assert.equal(state('raining'), 0);
  assert.equal(state('forecast_today_condition'), 'Dégagé');
  assert.equal(state('forecast_today_max'), 5);
  assert.equal(state('forecast_tomorrow_min'), -1);
  assert.equal(state('forecast_today_precipitation'), 0);
  // The battery is not in the REST observation: not published yet.
  assert.equal(state('battery_voltage'), undefined);
  // The widget of open dashboards is nudged.
  assert.ok(gladys.fake.widgetRefreshes.length > 0);
  // The live feed listens to that station's Tempest.
  assert.equal(cloud.sockets.length, 1);
  world.app.stop();
});

test('the live feed: observations, 3-second wind, rain and lightning events', async () => {
  const world = await worldWithStation();
  const { gladys, cloud } = world;
  const state = (key) => gladys.fake.lastState(featureId(gladys, key));
  assert.deepEqual(cloud.socket.listens, ['listen_start:100001', 'listen_rapid_start:100001']);

  cloud.socket.push(FIXTURES.websocket.obs_st);
  await flush();
  assert.equal(state('temperature'), -9.4);
  assert.equal(state('battery_voltage'), 2.62);
  assert.equal(state('pressure_sea_level'), 1019.1);
  assert.equal(world.hub.isLive(GARDEN.stationId), true);

  cloud.socket.push(FIXTURES.websocket.rapid_wind);
  await flush();
  assert.equal(state('wind_rapid'), 3.9); // 1.07 m/s

  const before = gladys.fake.sceneEvents.length;
  cloud.socket.push(FIXTURES.websocket.evt_strike);
  await flush();
  assert.equal(state('lightning_distance'), 13);
  const strikes = gladys.fake.sceneEvents.slice(before);
  assert.deepEqual(
    strikes.map((e) => e.data.within_km),
    ['15', '20', '30', '40'],
  );
  assert.deepEqual(strikes[0], {
    key: 'lightning_nearby',
    data: {
      device: gladys.externalIds('station', '20001').device,
      station: 'Garden',
      within_km: '15',
      distance_km: 13,
    },
  });

  cloud.socket.push(FIXTURES.websocket.evt_precip);
  await flush();
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: 'rain_started',
    data: { device: gladys.externalIds('station', '20001').device, station: 'Garden' },
  });
  // The rain observation that follows is the same episode.
  const count = gladys.fake.sceneEvents.length;
  cloud.socket.push(FIXTURES.websocket.obs_st_rain);
  await flush();
  assert.equal(state('raining'), 1);
  assert.equal(state('rain_rate'), 3);
  assert.equal(gladys.fake.sceneEvents.length, count);
  world.app.stop();
});

test('messages of a station not added, or of another device, are ignored', async () => {
  const world = await worldWithStation();
  const before = world.gladys.fake.states.length;
  world.cloud.socket.push({ ...FIXTURES.websocket.obs_st, device_id: 999 });
  world.cloud.socket.push({ type: 'evt_precip', device_id: 999 });
  await flush();
  assert.equal(world.gladys.fake.states.length, before);
  assert.equal(world.gladys.fake.sceneEvents.length, 0);
  world.app.stop();
});

test('only what changed is published', async () => {
  const world = await worldWithStation();
  const { gladys, cloud } = world;
  cloud.socket.push(FIXTURES.websocket.obs_st);
  await flush();
  const before = gladys.fake.states.length;
  const next = structuredClone(FIXTURES.websocket.obs_st);
  next.obs[0][0] += 60;
  next.obs[0][7] = -9.1; // temperature only
  cloud.socket.push(next);
  await flush();
  const sent = gladys.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.deepEqual(sent, [featureId(gladys, 'temperature')]);
  world.app.stop();
});

test('the live feed down: the REST observation takes over, the feed comes back', async () => {
  const world = await worldWithStation();
  const { gladys, cloud, hub, now } = world;
  cloud.socket.push(FIXTURES.websocket.obs_st);
  await flush();
  // While live, a cycle reads no observation over REST.
  const restReads = () => cloud.requests.filter((r) => r.path.startsWith('observations')).length;
  const reads = restReads();
  now.advance(MINUTE);
  await hub.cycle();
  assert.equal(restReads(), reads);

  cloud.socketDown = true;
  cloud.socket.serverClose(1006);
  cloud.observations[GARDEN.stationId].obs[0].timestamp = FIXTURES.websocket.obs_st.obs[0][0] + 120;
  cloud.observations[GARDEN.stationId].obs[0].air_temperature = 11.2;
  now.advance(MINUTE);
  await hub.cycle();
  assert.equal(restReads(), reads + 1);
  assert.equal(gladys.fake.lastState(featureId(gladys, 'temperature')), 11.2);
  // The battery known from the feed is kept.
  assert.equal(hub.dataOf(GARDEN.stationId).reading.battery, 2.62);
  world.app.stop();
});

test('the forecast is read every 30 minutes, the stations list only when needed', async () => {
  const world = await worldWithStation();
  const { cloud, hub, now } = world;
  const count = (path) => cloud.requests.filter((r) => r.path === path).length;
  const forecasts = count('better_forecast');
  for (let i = 0; i < 29; i += 1) {
    now.advance(MINUTE);
    await hub.cycle();
  }
  assert.equal(count('better_forecast'), forecasts);
  now.advance(MINUTE);
  await hub.cycle();
  assert.equal(count('better_forecast'), forecasts + 1);
  assert.equal(count('stations'), 1);
  world.app.stop();
});

test('an API outage is reported once in the status, then cleared', async () => {
  const world = await createWorld();
  const { gladys, cloud, hub, now } = world;
  cloud.failures.stations = 'down';
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable/);
  delete cloud.failures.stations;
  now.advance(MINUTE);
  await hub.cycle();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  world.app.stop();
});

test('a token revoked while running stops the feed and says so', async () => {
  const world = await worldWithStation();
  const { gladys, cloud, hub, now } = world;
  cloud.token = 'revoked';
  now.advance(31 * MINUTE);
  await hub.cycle({ force: true });
  assert.equal(hub.status, 'unauthorized');
  assert.equal(hub.socket, null);
  assert.match(gladys.fake.connectionStatus.message.en, /refused/);
  world.app.stop();
});

test('the instant wind off: no rapid subscription, the feature follows the average', async () => {
  const world = await worldWithStation({ config: { token: TOKEN, rapid_wind: false } });
  assert.deepEqual(world.cloud.socket.listens, ['listen_start:100001']);
  assert.equal(world.gladys.fake.lastState(featureId(world.gladys, 'wind_rapid')), 5);
  // Turned on from the configuration: subscribed without reconnecting.
  await world.gladys.fake.configUpdated({ token: TOKEN, rapid_wind: true });
  assert.equal(world.cloud.sockets.length, 1);
  assert.deepEqual(world.cloud.socket.listens, [
    'listen_start:100001',
    'listen_rapid_start:100001',
  ]);
  world.app.stop();
});

test('removing the station from Gladys stops listening to it', async () => {
  const world = await worldWithStation();
  const device = world.gladys.fake.devices[0];
  await world.gladys.fake.deviceDeleted(device);
  assert.equal(world.hub.socket, null);
  assert.equal(world.cloud.socket.closed, true);
  world.app.stop();
});

test('the devices are read-only, and the action lists the stations', async () => {
  const world = await worldWithStation();
  const device = world.gladys.fake.devices[0];
  const ack = await world.gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, false);
  const result = await world.gladys.fake.action('list_stations', {});
  assert.equal(result.success, true);
  assert.match(result.data.message.en, /2 station\(s\).*Garden \(#20001, Tempest ST-00000123\)/);
  assert.match(result.data.message.fr, /Chalet \(#20002, pas de capteur Tempest/);

  world.cloud.token = 'revoked';
  const refused = await world.gladys.fake.action('list_stations', {});
  assert.equal(refused.success, false);
  assert.match(refused.error, /refused/);
  world.app.stop();
});
