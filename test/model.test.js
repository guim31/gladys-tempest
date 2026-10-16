// -----------------------------------------------------------------------------
// The Tempest payloads (fixtures of weatherflow4py and Home Assistant,
// anonymized) turned into readings and forecasts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dewPoint,
  forecastDays,
  mergeReading,
  parseForecast,
  parseStations,
  readingFromObsSt,
  readingFromStationObservation,
  seaLevelPressure,
} from '../src/tempest/model.js';
import { FIXTURES, FIXTURE_NOW_MS } from './helpers/fakeTempest.js';

const close = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('the stations of the account: only the Tempest ones are usable', () => {
  const [garden, chalet] = parseStations(FIXTURES.stations);
  assert.equal(garden.id, 20001);
  assert.equal(garden.name, 'Garden');
  assert.equal(garden.deviceId, 100001);
  assert.equal(garden.serial, 'ST-00000123');
  assert.equal(garden.timezone, 'America/Denver');
  close(garden.elevation, 2063.15, 0.01, 'elevation');
  close(garden.heightAboveGround, 1.8288, 0.0001, 'agl');
  // AIR + SKY only: listed, without a Tempest device.
  assert.equal(chalet.deviceId, null);
  assert.deepEqual(chalet.otherDevices, ['AR', 'SK']);
  assert.deepEqual(parseStations({}), []);
  assert.deepEqual(parseStations({ stations: [{ name: 'no id' }] }), []);
});

test('the sea-level pressure and the dew point match what the Tempest API computes', () => {
  // The REST observation of the fixture: 782.8 mb at 2063 m (+1.83 m) gives
  // 1006.2 mb at sea level, 10.5 °C and 22 % give a -10.4 °C dew point.
  close(seaLevelPressure(782.8, 2063.15 + 1.8288), 1006.2, 0.05, 'sea level');
  close(dewPoint(10.5, 22), -10.4, 0.1, 'dew point');
  assert.equal(dewPoint(10, 0), null);
});

test('a WebSocket obs_st message becomes a reading', () => {
  const station = parseStations(FIXTURES.stations)[0];
  const reading = readingFromObsSt(FIXTURES.websocket.obs_st, station);
  assert.equal(reading.time, FIXTURE_NOW_MS / 1000);
  assert.equal(reading.temperature, -9.4);
  assert.equal(reading.humidity, 92);
  assert.equal(reading.stationPressure, 793.3);
  close(reading.seaLevelPressure, 1019.1, 0.1, 'sea level');
  assert.equal(reading.dewPoint, -10.5); // from the summary
  assert.equal(reading.feelsLike, -9.4);
  assert.equal(reading.pressureTrend, 'rising');
  assert.equal(reading.battery, 2.62);
  assert.equal(reading.illuminance, 7875);
  assert.equal(reading.uv, 0.28);
  assert.equal(reading.solarRadiation, 66);
  assert.equal(reading.precipitationType, 0);
  assert.equal(reading.rainRate, 0);
  assert.equal(reading.strikeCount1h, 0);
  assert.equal(reading.strikeLastDistance, 26);
});

test('the official example of the WebSocket reference: rain, null rain-check values', () => {
  const reading = readingFromObsSt(FIXTURES.websocket.obs_st_rain, { elevation: null });
  // 0.05 mm in a one-minute interval is 3 mm/h.
  close(reading.rainRate, 3, 1e-9, 'rain rate');
  assert.equal(reading.precipitationType, 1);
  assert.equal(reading.rainToday, 0.07615);
  // No elevation known: no sea-level pressure rather than a wrong one.
  assert.equal(reading.seaLevelPressure, null);
  // No summary: the dew point is computed.
  close(reading.dewPoint, 22.9, 0.2, 'dew point');
  assert.equal(readingFromObsSt({ type: 'obs_st' }), null);
  assert.equal(readingFromObsSt({ obs: [[null]] }), null);
});

test('a REST station observation becomes a reading', () => {
  const reading = readingFromStationObservation(FIXTURES.observation);
  assert.equal(reading.temperature, 10.5);
  assert.equal(reading.seaLevelPressure, 1006.2);
  assert.equal(reading.illuminance, 757);
  assert.equal(reading.windAvg, 1.4);
  assert.equal(reading.windDirection, 203);
  assert.equal(reading.battery, null);
  assert.equal(reading.precipitationType, 0);
  assert.equal(readingFromStationObservation({ obs: [] }), null);
});

test('a newer reading keeps what the new source does not carry', () => {
  const live = readingFromObsSt(FIXTURES.websocket.obs_st, parseStations(FIXTURES.stations)[0]);
  const rest = { ...readingFromStationObservation(FIXTURES.observation), time: live.time + 60 };
  const merged = mergeReading(live, rest);
  assert.equal(merged.temperature, 10.5);
  assert.equal(merged.battery, 2.62);
  // An older reading never overwrites a newer one.
  assert.equal(mergeReading(rest, live), rest);
});

test('the better_forecast payload: icons, days and hours', () => {
  const forecast = parseForecast(FIXTURES.forecast);
  assert.equal(forecast.timezone, 'America/Denver');
  assert.equal(forecast.current.icon, 'clear-day');
  assert.equal(forecast.days.length, 10);
  assert.equal(forecast.hours.length, 48);
  const { today, tomorrow } = forecastDays(forecast, FIXTURE_NOW_MS / 1000);
  assert.equal(today.temperatureMax, 5);
  assert.equal(today.temperatureMin, -6);
  assert.equal(tomorrow.start, today.start + 86400);
  // Past midnight, tomorrow becomes today.
  const later = forecastDays(forecast, today.start + 86400 + 60);
  assert.equal(later.today.start, tomorrow.start);
  // An icon the API may add one day is shown as unknown, never guessed.
  const odd = parseForecast({ forecast: { daily: [{ day_start_local: 1, icon: 'tornado' }] } });
  assert.equal(odd.days[0].icon, 'unknown');
  assert.deepEqual(parseForecast(null).days, []);
});
