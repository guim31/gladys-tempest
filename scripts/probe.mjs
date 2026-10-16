#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real Tempest cloud, read-only, with the integration's own
// clients (src/tempest/). Run it from a machine that has the network:
//
//   node scripts/probe.mjs                 # a made-up token: the refusals
//   TEMPEST_TOKEN=… node scripts/probe.mjs # your token: what the API sends
//
// It shows how the API refuses a bad token (REST status, WebSocket close
// code) — the integration relies on it — and, with a real token, the SHAPE
// of the answers (field names, counts, types). It never prints the token,
// a URL, a coordinate, a station name nor a serial number.
// -----------------------------------------------------------------------------

import { createTempestClient } from '../src/tempest/client.js';
import {
  parseForecast,
  parseStations,
  readingFromObsSt,
  readingFromStationObservation,
} from '../src/tempest/model.js';
import { TempestSocket } from '../src/tempest/socket.js';

const FAKE_TOKEN = '00000000-0000-4000-8000-000000000000';
const token = process.env.TEMPEST_TOKEN?.trim() || FAKE_TOKEN;
const real = token !== FAKE_TOKEN;
const WS_WAIT_MS = real ? 90 * 1000 : 15 * 1000;

const say = (...args) => console.log(...args);
const shape = (object) =>
  Object.keys(object ?? {})
    .sort()
    .join(', ');
const present = (reading) =>
  Object.entries(reading ?? {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key]) => key)
    .sort()
    .join(', ');

async function probeRest() {
  const client = createTempestClient({ token });
  say(`REST: GET /stations with ${real ? 'your' : 'a made-up'} token`);
  let stations;
  try {
    stations = parseStations(await client.getStations());
  } catch (err) {
    say(`  refused: code=${err.code} status=${err.status ?? '-'} message="${err.message}"`);
    return [];
  }
  say(
    `  ${stations.length} station(s); with a Tempest: ${stations.filter((s) => s.deviceId).length}`,
  );
  for (const [index, station] of stations.entries()) {
    say(
      `  station #${index + 1}: tempest=${station.deviceId !== null} elevation=${station.elevation !== null} ` +
        `timezone=${station.timezone !== null} other devices=[${station.otherDevices.join(', ')}]`,
    );
  }
  const first = stations.find((station) => station.deviceId !== null);
  if (!first) {
    return stations;
  }
  try {
    const observation = await client.getStationObservation(first.id);
    say(`  observation keys: ${shape(observation?.obs?.[0])}`);
    say(`  reading fields present: ${present(readingFromStationObservation(observation))}`);
  } catch (err) {
    say(`  observation failed: ${err.message}`);
  }
  try {
    const raw = await client.getForecast(first.id);
    const forecast = parseForecast(raw);
    say(`  forecast units: ${JSON.stringify(raw.units)}`);
    say(
      `  forecast: ${forecast.days.length} day(s), ${forecast.hours.length} hour(s), current icon=${forecast.current?.icon}`,
    );
    say(`  forecast icons seen: ${[...new Set(forecast.days.map((d) => d.icon))].join(', ')}`);
  } catch (err) {
    say(`  forecast failed: ${err.message}`);
  }
  return stations;
}

function probeSocket(stations) {
  return new Promise((resolve) => {
    const station = stations.find((s) => s.deviceId !== null);
    say(`WebSocket: connecting for ${WS_WAIT_MS / 1000} s`);
    let opened = false;
    // The real WebSocket, wrapped to see the close code the server sends.
    const socket = new TempestSocket({
      token,
      createWebSocket: (url) => {
        const ws = new globalThis.WebSocket(url);
        ws.addEventListener('close', (event) =>
          say(`  closed by the server: code=${event.code} reason="${event.reason}"`),
        );
        ws.addEventListener('error', () => say('  connection error (no detail exposed)'));
        return ws;
      },
    });
    const counts = {};
    socket.on('connected', () => {
      opened = true;
      say('  open');
    });
    socket.on('retry', ({ delay, reason }) => say(`  ${reason}, would retry in ${delay} ms`));
    socket.on('message', (message) => {
      counts[message.type] = (counts[message.type] ?? 0) + 1;
      if (counts[message.type] === 1) {
        say(`  first "${message.type}" message, keys: ${shape(message)}`);
        if (message.type === 'obs_st') {
          say(`  reading fields present: ${present(readingFromObsSt(message, station))}`);
        }
        if (message.status) {
          say(`  status: ${JSON.stringify(message.status)}`);
        }
      }
    });
    socket.subscribe({ deviceIds: station ? [station.deviceId] : [1], rapid: Boolean(station) });
    socket.start();
    setTimeout(() => {
      socket.stop();
      say(`  opened=${opened} messages=${JSON.stringify(counts)}`);
      resolve();
    }, WS_WAIT_MS);
  });
}

const stations = await probeRest();
await probeSocket(stations);
say('Done.');
