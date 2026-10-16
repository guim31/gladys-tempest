// -----------------------------------------------------------------------------
// Tempest WebSocket feed (wss://ws.weatherflow.com/swd/data).
//
// One outgoing connection for the whole account (the API asks for a single
// socket per client), on which the integration listens to every Tempest
// device of the added stations:
//   - `listen_start`       → `obs_st` every minute, `evt_precip` (rain start)
//                            and `evt_strike` (lightning) as they happen;
//   - `listen_rapid_start` → `rapid_wind` every 3 seconds (optional).
//
// The server drops a connection idle for 10 minutes and, like any cloud
// service, sometimes goes silent without closing: a connection that received
// nothing for 3 minutes (three missed observations) is closed and reopened.
// Reconnection backs off from 1 s to 5 min, and starts over once data flows.
//
// The token is in the URL: the URL is never logged, nor emitted.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

export const WS_URL = 'wss://ws.weatherflow.com/swd/data';

export const SOCKET_TIMINGS = {
  minBackoffMs: 1000,
  maxBackoffMs: 5 * 60 * 1000,
  staleMs: 3 * 60 * 1000,
  watchdogMs: 30 * 1000,
};

const OPEN = 1;

/**
 * @typedef {object} SocketLike the part of the WHATWG WebSocket used here
 * @property {number} readyState
 * @property {(data: string) => void} send
 * @property {() => void} close
 * @property {Function|null} onopen
 * @property {Function|null} onmessage
 * @property {Function|null} onclose
 * @property {Function|null} onerror
 */

export class TempestSocket extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.token
   * @param {(url: string) => SocketLike} [options.createWebSocket]
   * @param {() => number} [options.now]
   * @param {Partial<typeof SOCKET_TIMINGS>} [options.timings]
   */
  constructor({ token, createWebSocket, now = () => Date.now(), timings = {} }) {
    super();
    this.token = token;
    this.createWebSocket = createWebSocket ?? ((url) => new globalThis.WebSocket(url));
    this.now = now;
    this.timings = { ...SOCKET_TIMINGS, ...timings };
    /** @type {SocketLike|null} */
    this.ws = null;
    this.stopped = true;
    this.deviceIds = new Set();
    this.rapid = false;
    /** What the open connection listens to (sent `*_start` messages). */
    this.listening = new Set();
    this.listeningRapid = new Set();
    this.backoffMs = this.timings.minBackoffMs;
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this.lastMessageAt = 0;
    this.requestId = 0;
    this.connected = false;
  }

  /** True while the connection is open and data arrived recently. */
  get live() {
    return this.connected && this.now() - this.lastMessageAt < this.timings.staleMs;
  }

  /**
   * The Tempest devices to listen to. Applied at once on an open connection.
   * @param {{ deviceIds: number[], rapid: boolean }} subscription
   */
  subscribe({ deviceIds, rapid }) {
    this.deviceIds = new Set(deviceIds);
    this.rapid = Boolean(rapid);
    if (this.connected) {
      this.syncListeners();
    }
  }

  start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.backoffMs = this.timings.minBackoffMs;
    this.open();
    this.watchdogTimer = setInterval(() => this.checkStale(), this.timings.watchdogMs);
    this.watchdogTimer.unref?.();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.watchdogTimer);
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this.drop('stopped');
  }

  open() {
    this.reconnectTimer = null;
    if (this.stopped) {
      return;
    }
    let ws;
    try {
      ws = this.createWebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    } catch (err) {
      this.scheduleReconnect(err?.message ?? 'cannot open');
      return;
    }
    this.ws = ws;
    // The time the connection attempt started counts as activity: the
    // watchdog gives a fresh connection the same 3 minutes to speak.
    this.lastMessageAt = this.now();
    ws.onopen = () => {
      if (this.ws !== ws) {
        return;
      }
      this.connected = true;
      this.listening.clear();
      this.listeningRapid.clear();
      this.syncListeners();
      this.emit('connected');
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) {
        return;
      }
      this.onMessage(event?.data);
    };
    ws.onerror = () => {
      // The close event follows and carries the reconnection.
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) {
        return;
      }
      this.ws = null;
      const wasConnected = this.connected;
      this.connected = false;
      const reason = event?.code ? `closed (${event.code})` : 'closed';
      if (wasConnected) {
        this.emit('disconnected', reason);
      }
      this.scheduleReconnect(reason);
    };
  }

  onMessage(data) {
    let message;
    try {
      message = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') {
      return;
    }
    this.lastMessageAt = this.now();
    if (message.type === 'obs_st' || message.type === 'rapid_wind') {
      // Data flows: the next drop starts the backoff over.
      this.backoffMs = this.timings.minBackoffMs;
    }
    this.emit('message', message);
  }

  /** Send the listen_start/stop messages that make the connection match the subscription. */
  syncListeners() {
    const wanted = this.deviceIds;
    const wantedRapid = this.rapid ? this.deviceIds : new Set();
    for (const id of this.listening) {
      if (!wanted.has(id)) {
        this.send({ type: 'listen_stop', device_id: id });
        this.listening.delete(id);
      }
    }
    for (const id of this.listeningRapid) {
      if (!wantedRapid.has(id)) {
        this.send({ type: 'listen_rapid_stop', device_id: id });
        this.listeningRapid.delete(id);
      }
    }
    for (const id of wanted) {
      if (!this.listening.has(id)) {
        this.send({ type: 'listen_start', device_id: id });
        this.listening.add(id);
      }
    }
    for (const id of wantedRapid) {
      if (!this.listeningRapid.has(id)) {
        this.send({ type: 'listen_rapid_start', device_id: id });
        this.listeningRapid.add(id);
      }
    }
  }

  send(message) {
    if (!this.ws || this.ws.readyState !== OPEN) {
      return;
    }
    this.requestId += 1;
    try {
      this.ws.send(JSON.stringify({ ...message, id: `gladys-${this.requestId}` }));
    } catch {
      // A send on a dying socket: the close event reconnects.
    }
  }

  checkStale() {
    if (this.ws && this.now() - this.lastMessageAt >= this.timings.staleMs) {
      this.drop('silent for too long');
      this.scheduleReconnect('silent for too long');
    }
  }

  /** Close the current connection without waiting for its close event. */
  drop(reason) {
    const ws = this.ws;
    this.ws = null;
    const wasConnected = this.connected;
    this.connected = false;
    this.listening.clear();
    this.listeningRapid.clear();
    if (ws) {
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    }
    if (wasConnected) {
      this.emit('disconnected', reason);
    }
  }

  scheduleReconnect(reason) {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.timings.maxBackoffMs);
    this.emit('retry', { delay, reason });
    this.reconnectTimer = setTimeout(() => this.open(), delay);
    this.reconnectTimer.unref?.();
  }
}
