// -----------------------------------------------------------------------------
// A fake Tempest cloud: the REST API (as a `fetch`) and the WebSocket feed
// (as a `createWebSocket`), answering with the fixtures of
// test/fixtures/tempest. Nothing touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/tempest/${name}.json`, import.meta.url), 'utf8'));

export const FIXTURES = {
  stations: fixture('stations'),
  observation: fixture('station_observation'),
  forecast: fixture('forecast'),
  websocket: fixture('websocket'),
  unauthorized: fixture('unauthorized'),
};

// A made-up token: the tests check it never reaches the logs.
export const TOKEN = 'c0ffee00-1234-4abc-9def-00000000beef';

// The fixtures' "now": the forecast's current conditions time.
export const FIXTURE_NOW_MS = FIXTURES.forecast.current_conditions.time * 1000;

export const GARDEN = { stationId: 20001, deviceId: 100001 };
export const CHALET = { stationId: 20002 };

const clone = (value) => structuredClone(value);

/**
 * @param {object} [options]
 * @param {string} [options.token] the token the fake cloud accepts
 */
export function createFakeTempest({ token = TOKEN } = {}) {
  const cloud = {
    token,
    stations: clone(FIXTURES.stations),
    observations: { [GARDEN.stationId]: clone(FIXTURES.observation) },
    forecasts: { [GARDEN.stationId]: clone(FIXTURES.forecast) },
    /** Every REST request: { path, query } (token removed). */
    requests: [],
    /** Every WebSocket opened, most recent last. */
    sockets: [],
    /** path prefix → 'down' | number (HTTP status) */
    failures: {},
    /** WebSocket attempts fail to open while true. */
    socketDown: false,

    async fetch(input) {
      const url = new URL(String(input));
      const query = Object.fromEntries(url.searchParams);
      const sent = query.token;
      delete query.token;
      const path = url.pathname.replace(/^\/swd\/rest\//, '');
      cloud.requests.push({ path, query });
      for (const [prefix, failure] of Object.entries(cloud.failures)) {
        if (path.startsWith(prefix)) {
          if (failure === 'down') {
            const error = new TypeError('fetch failed');
            error.cause = { code: 'ECONNREFUSED' };
            throw error;
          }
          return json({ status: { status_code: failure, status_message: 'ERROR' } }, failure);
        }
      }
      if (url.host !== 'swd.weatherflow.com') {
        return json({}, 404);
      }
      if (sent !== cloud.token) {
        return json(FIXTURES.unauthorized, 401);
      }
      if (path === 'stations') {
        return json(cloud.stations);
      }
      const match = path.match(/^observations\/station\/(\d+)$/);
      if (match) {
        const body = cloud.observations[match[1]];
        return body ? json(body) : json({ status: { status_code: 404 } }, 404);
      }
      if (path === 'better_forecast') {
        const body = cloud.forecasts[query.station_id];
        return body ? json(body) : json({ status: { status_code: 404 } }, 404);
      }
      return json({}, 404);
    },

    createWebSocket(url) {
      const socket = new FakeSocket(url, cloud);
      cloud.sockets.push(socket);
      return socket;
    },

    /** The socket currently in use. */
    get socket() {
      return cloud.sockets[cloud.sockets.length - 1];
    },
  };
  return cloud;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The WHATWG WebSocket surface the integration uses, driven by the test. */
export class FakeSocket {
  constructor(url, cloud) {
    this.url = url;
    this.cloud = cloud;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  get token() {
    return new URL(this.url).searchParams.get('token');
  }

  /** The server accepts the connection (or refuses it, see `cloud.socketDown`). */
  accept() {
    if (this.cloud.socketDown || this.token !== this.cloud.token) {
      this.serverClose(1006);
      return;
    }
    this.readyState = 1;
    this.onopen?.({});
    this.push({ type: 'connection_opened' });
  }

  /** The server sends a message. */
  push(message) {
    if (this.readyState !== 1) {
      return;
    }
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  serverClose(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  /** The listen messages sent, without their request id. */
  get listens() {
    return this.sent.map(({ type, device_id: deviceId }) => `${type}:${deviceId}`);
  }
}
