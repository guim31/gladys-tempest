// -----------------------------------------------------------------------------
// The WebSocket feed: what it listens to, how it reconnects.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOCKET_TIMINGS, TempestSocket } from '../src/tempest/socket.js';
import { FIXTURES, TOKEN, createFakeTempest } from './helpers/fakeTempest.js';

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const cloud = createFakeTempest();
  const socket = new TempestSocket({
    token: TOKEN,
    createWebSocket: cloud.createWebSocket,
    now: () => Date.now(),
  });
  const events = [];
  for (const name of ['connected', 'disconnected', 'retry', 'message']) {
    socket.on(name, (payload) => events.push({ name, payload }));
  }
  t.after(() => socket.stop());
  return { cloud, socket, events };
}

test('listens to the subscribed devices once open, rapid wind included', (t) => {
  const { cloud, socket } = setup(t);
  socket.subscribe({ deviceIds: [100001], rapid: true });
  socket.start();
  assert.equal(cloud.sockets.length, 1);
  assert.equal(cloud.socket.token, TOKEN);
  assert.match(cloud.socket.url, /^wss:\/\/ws\.weatherflow\.com\/swd\/data\?token=/);
  cloud.socket.accept();
  assert.deepEqual(cloud.socket.listens, ['listen_start:100001', 'listen_rapid_start:100001']);
  // Request ids are unique.
  assert.equal(new Set(cloud.socket.sent.map((m) => m.id)).size, 2);

  // Rapid wind turned off, a second station added: only the difference is sent.
  socket.subscribe({ deviceIds: [100001, 100021], rapid: false });
  assert.deepEqual(cloud.socket.listens.slice(2), [
    'listen_rapid_stop:100001',
    'listen_start:100021',
  ]);
  socket.subscribe({ deviceIds: [100021], rapid: false });
  assert.deepEqual(cloud.socket.listens.slice(4), ['listen_stop:100001']);
});

test('relays the messages and tells when the feed is live', (t) => {
  const { cloud, socket, events } = setup(t);
  socket.subscribe({ deviceIds: [100001], rapid: false });
  socket.start();
  assert.equal(socket.live, false);
  cloud.socket.accept();
  cloud.socket.push(FIXTURES.websocket.obs_st);
  assert.equal(socket.live, true);
  const messages = events.filter((e) => e.name === 'message').map((e) => e.payload.type);
  assert.deepEqual(messages, ['connection_opened', 'obs_st']);
  // Garbage is ignored.
  cloud.socket.onmessage({ data: 'not json' });
  assert.equal(events.filter((e) => e.name === 'message').length, 2);
});

test('reconnects with a growing backoff, back to 1 s once data flows', (t) => {
  const { cloud, socket, events } = setup(t);
  socket.subscribe({ deviceIds: [100001], rapid: false });
  socket.start();
  cloud.socket.accept();
  cloud.socket.serverClose(1006);
  assert.deepEqual(
    events.filter((e) => e.name === 'disconnected').map((e) => e.payload),
    ['closed (1006)'],
  );
  const delays = () => events.filter((e) => e.name === 'retry').map((e) => e.payload.delay);
  assert.deepEqual(delays(), [1000]);
  t.mock.timers.tick(1000);
  assert.equal(cloud.sockets.length, 2);
  cloud.socket.serverClose(1006); // refused before opening
  t.mock.timers.tick(2000);
  cloud.socket.serverClose(1006);
  assert.deepEqual(delays(), [1000, 2000, 4000]);
  t.mock.timers.tick(4000);
  cloud.socket.accept();
  // Listening again after the reconnection.
  assert.deepEqual(cloud.socket.listens, ['listen_start:100001']);
  cloud.socket.push(FIXTURES.websocket.obs_st);
  cloud.socket.serverClose(1001);
  assert.equal(delays().at(-1), 1000);
});

test('the backoff stops growing at 5 minutes', (t) => {
  const { cloud, socket, events } = setup(t);
  cloud.socketDown = true;
  socket.subscribe({ deviceIds: [100001], rapid: false });
  socket.start();
  for (let i = 0; i < 12; i += 1) {
    cloud.socket.accept();
    t.mock.timers.tick(SOCKET_TIMINGS.maxBackoffMs);
  }
  const delays = events.filter((e) => e.name === 'retry').map((e) => e.payload.delay);
  assert.equal(Math.max(...delays), SOCKET_TIMINGS.maxBackoffMs);
});

test('a connection silent for 3 minutes is dropped and reopened', (t) => {
  const { cloud, socket, events } = setup(t);
  socket.subscribe({ deviceIds: [100001], rapid: false });
  socket.start();
  cloud.socket.accept();
  const first = cloud.socket;
  t.mock.timers.tick(SOCKET_TIMINGS.staleMs + SOCKET_TIMINGS.watchdogMs);
  assert.equal(first.closed, true);
  assert.ok(events.some((e) => e.name === 'disconnected' && /silent/.test(e.payload)));
  t.mock.timers.tick(1000);
  assert.notEqual(cloud.socket, first);
});

test('stop closes the connection and never reconnects', (t) => {
  const { cloud, socket } = setup(t);
  socket.subscribe({ deviceIds: [100001], rapid: false });
  socket.start();
  cloud.socket.accept();
  socket.stop();
  assert.equal(cloud.socket.closed, true);
  t.mock.timers.tick(10 * 60 * 1000);
  assert.equal(cloud.sockets.length, 1);
});
