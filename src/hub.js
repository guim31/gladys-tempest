// -----------------------------------------------------------------------------
// The Tempest hub: the account's stations, what is known of each, and the
// way it reaches Gladys.
//
// Sources, by preference:
//   1. the WebSocket live feed — one observation a minute per station, the
//      rain-start and lightning events as they happen, the wind every 3 s;
//   2. the REST station observation, read once a minute for a station the
//      live feed has not covered for 3 minutes (feed down, station silent);
//   3. the REST forecast (`better_forecast`), every 30 minutes.
// Only the stations the user added to Gladys are followed: the core drops
// the states of a device it does not know.
//
// States go out through `publishChangedStates` (only what changed, plus a
// 6-hour heartbeat so a steady value never reads "no recent value").
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { buildDevice, buildStates, isRaining, stationIdOf, stationIds } from './devices.js';
import { MESSAGES, stationListMessage } from './i18n.js';
import { createIssueLog } from './issues.js';
import { createTempestClient } from './tempest/client.js';
import {
  mergeReading,
  parseForecast,
  parseStations,
  readingFromObsSt,
  readingFromStationObservation,
} from './tempest/model.js';
import { TempestSocket } from './tempest/socket.js';
import { TRIGGER, createTriggerTracker } from './triggers.js';

const logger = createLogger({ name: 'tempest' });

export const HUB_TIMINGS = {
  // A station the live feed has not covered for this long is read over REST.
  liveFreshMs: 3 * 60 * 1000,
  forecastMs: 30 * 60 * 1000,
  // After a refused token, the stations are asked again this rarely.
  unauthorizedRetryMs: 30 * 60 * 1000,
  heartbeatMs: 6 * 60 * 60 * 1000,
};

export const WIDGET_KEY = 'station';

export class TempestHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {typeof fetch} [options.fetch]
   * @param {(url: string) => object} [options.createWebSocket]
   * @param {() => number} [options.now]
   * @param {Partial<typeof HUB_TIMINGS>} [options.timings]
   * @param {object} [options.socketTimings]
   */
  constructor({
    gladys,
    fetch,
    createWebSocket,
    now = () => Date.now(),
    timings = {},
    socketTimings,
  }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.createWebSocket = createWebSocket;
    this.now = now;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.socketTimings = socketTimings;
    this.issues = createIssueLog(logger);
    this.triggers = createTriggerTracker({ now });
    this.config = { token: '', language: 'fr', rapid_wind: true };
    this.client = null;
    /** @type {TempestSocket|null} */
    this.socket = null;
    /** @type {Map<number, object>} station id → station (from GET /stations) */
    this.stations = null;
    /** @type {Map<number, { reading, readingAt, readingSource, forecast, forecastAt, rapid }>} */
    this.data = new Map();
    // 'not_configured' | 'unauthorized' | 'unreachable' | 'ok'
    this.status = 'not_configured';
    this.stationsCheckedAt = 0;
    this.everConnected = false;
  }

  /**
   * Apply a (new) configuration: a new token starts everything over.
   * @param {{ token: string, language: string, rapid_wind: boolean }} config
   */
  async configure(config) {
    const tokenChanged = config.token !== this.config.token;
    this.config = config;
    if (tokenChanged || !this.client) {
      this.stopSocket();
      this.stations = null;
      this.data.clear();
      this.status = 'not_configured';
      this.stationsCheckedAt = 0;
      this.client = isConfigured(config)
        ? createTempestClient({ token: config.token, fetch: this.fetch })
        : null;
    }
    if (!isConfigured(config)) {
      logger.info('Not configured yet: waiting for a Tempest access token');
      await this.gladys.setConnectionStatus(false, MESSAGES.notConfigured);
      return;
    }
    await this.loadStations();
    this.syncSubscriptions();
  }

  /**
   * Read the stations of the account, publish them as discovered devices and
   * report the connection status. Never throws: the outcome is in `status`.
   * @returns {Promise<Array<object>|null>} the stations, null on failure
   */
  async loadStations() {
    if (!this.client) {
      return null;
    }
    this.stationsCheckedAt = this.now();
    let stations;
    try {
      stations = parseStations(await this.client.getStations());
    } catch (err) {
      const unauthorized = err?.isAuthError === true;
      this.status = unauthorized ? 'unauthorized' : 'unreachable';
      this.issues.fail('stations', `Reading the Tempest stations failed: ${err.message}`);
      if (unauthorized) {
        this.stopSocket();
      }
      await this.gladys
        .setConnectionStatus(false, unauthorized ? MESSAGES.tokenRefused : MESSAGES.unreachable)
        .catch(() => {});
      return null;
    }
    const firstTime = this.stations === null;
    this.stations = new Map(stations.map((station) => [station.id, station]));
    this.status = 'ok';
    this.issues.ok('stations', 'The Tempest API answers again');
    if (firstTime) {
      const usable = stations.filter((station) => station.deviceId !== null).length;
      logger.info(`Tempest account reached: ${usable} station(s) with a Tempest`);
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
      this.issues.ok('discovery', 'Gladys accepts the stations again');
      await this.gladys.setConnectionStatus(true);
    } catch (err) {
      this.issues.fail('discovery', `Publishing the stations failed: ${err.message}`);
      await this.gladys.setConnectionStatus(false, MESSAGES.publishFailed).catch(() => {});
    }
    return stations;
  }

  /** The discovered devices: every station with a Tempest. */
  discoveredDevices() {
    return [...(this.stations?.values() ?? [])]
      .filter((station) => station.deviceId !== null)
      .map((station) => buildDevice(this.gladys, station, this.config.language));
  }

  /** The "List my stations" action: reads the account again. */
  async listStations() {
    if (!isConfigured(this.config)) {
      throw new Error(MESSAGES.notConfigured.en);
    }
    const stations = await this.loadStations();
    if (stations === null) {
      throw new Error(
        (this.status === 'unauthorized' ? MESSAGES.tokenRefused : MESSAGES.unreachable).en,
      );
    }
    this.syncSubscriptions();
    return stationListMessage(stations);
  }

  /** The station ids of the devices the user added to Gladys. */
  addedStationIds() {
    const ids = new Set();
    for (const device of this.gladys.devices ?? []) {
      const id = stationIdOf(this.gladys, device.external_id);
      if (id !== null) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  /** Listen to the Tempest devices of the added stations (and only them). */
  syncSubscriptions() {
    if (this.status !== 'ok' || !this.stations) {
      return;
    }
    const deviceIds = this.addedStationIds()
      .map((id) => this.stations.get(id)?.deviceId)
      .filter((deviceId) => deviceId !== null && deviceId !== undefined);
    if (deviceIds.length === 0) {
      this.stopSocket();
      return;
    }
    if (!this.socket) {
      this.startSocket();
    }
    this.socket.subscribe({ deviceIds, rapid: this.config.rapid_wind });
  }

  startSocket() {
    const socket = new TempestSocket({
      token: this.config.token,
      createWebSocket: this.createWebSocket,
      now: this.now,
      timings: this.socketTimings,
    });
    socket.on('connected', () => {
      if (!this.everConnected) {
        this.everConnected = true;
        logger.info('Tempest live feed connected');
      }
      this.issues.ok('socket', 'Tempest live feed connected again');
    });
    socket.on('disconnected', (reason) => {
      this.issues.fail('socket', `Tempest live feed lost (${reason}): REST fallback meanwhile`);
    });
    socket.on('retry', ({ delay, reason }) => {
      logger.debug(`Tempest live feed ${reason}, next attempt in ${Math.round(delay / 1000)} s`);
    });
    socket.on('message', (message) => {
      this.onSocketMessage(message).catch((err) => {
        logger.debug(`Live message not handled: ${err.message}`);
      });
    });
    this.socket = socket;
    socket.start();
  }

  stopSocket() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.stop();
      this.socket = null;
    }
  }

  stop() {
    this.stopSocket();
  }

  /** The station of a Tempest device id, among the added ones. */
  stationOfDevice(deviceId) {
    if (!this.stations) {
      return null;
    }
    const added = new Set(this.addedStationIds());
    for (const station of this.stations.values()) {
      if (station.deviceId === deviceId && added.has(station.id)) {
        return station;
      }
    }
    return null;
  }

  dataOf(stationId) {
    let data = this.data.get(stationId);
    if (!data) {
      data = {
        reading: null,
        readingAt: 0,
        readingSource: null,
        forecast: null,
        forecastAt: 0,
        rapid: null,
      };
      this.data.set(stationId, data);
    }
    return data;
  }

  async onSocketMessage(message) {
    const station = this.stationOfDevice(message.device_id);
    if (!station) {
      logger.debug(`Live message ${message.type ?? '?'} ignored`);
      return;
    }
    const data = this.dataOf(station.id);
    switch (message.type) {
      case 'obs_st': {
        const reading = readingFromObsSt(message, station);
        if (!reading) {
          return;
        }
        logger.debug(`Live observation of station ${station.id}`);
        this.applyReading(station.id, reading, 'ws');
        await this.publish(station.id);
        await this.fireObservationTriggers(station.id, data.reading);
        return;
      }
      case 'rapid_wind': {
        const [epoch, speed, direction] = Array.isArray(message.ob) ? message.ob : [];
        if (!Number.isFinite(speed)) {
          return;
        }
        data.rapid = { time: epoch, speed, direction };
        await this.publish(station.id, { only: (feature) => feature.key === 'wind_rapid' });
        return;
      }
      case 'evt_precip': {
        logger.debug(`Rain start event of station ${station.id}`);
        if (this.triggers.onRainStart(station.id)) {
          await this.fireScene(TRIGGER.RAIN_STARTED, station);
        }
        return;
      }
      case 'evt_strike': {
        const [epoch, distance] = Array.isArray(message.evt) ? message.evt : [];
        if (!Number.isFinite(distance)) {
          return;
        }
        logger.debug(`Lightning event of station ${station.id}: ${distance} km`);
        if (data.reading) {
          data.reading = {
            ...data.reading,
            strikeLastDistance: distance,
            strikeLastEpoch: Number.isFinite(epoch) ? epoch : data.reading.strikeLastEpoch,
          };
          await this.publish(station.id, {
            only: (feature) => feature.key === 'lightning_distance',
          });
        }
        const thresholds = this.triggers.onStrike(station.id, {
          epoch: Number.isFinite(epoch) ? epoch : null,
          distance,
        });
        await this.fireLightning(station, thresholds, distance);
        return;
      }
      default:
        return;
    }
  }

  applyReading(stationId, reading, source) {
    const data = this.dataOf(stationId);
    data.reading = mergeReading(data.reading, reading);
    data.readingAt = this.now();
    data.readingSource = source;
  }

  /** True when the live feed brought this station's observation recently. */
  isLive(stationId) {
    const data = this.data.get(stationId);
    return (
      Boolean(this.socket?.live) &&
      data?.readingSource === 'ws' &&
      this.now() - data.readingAt < this.timings.liveFreshMs
    );
  }

  /**
   * Refresh one added station over REST where the live feed does not cover
   * it, and the forecast when it is due. Errors are logged once while they
   * last, never thrown.
   * @param {number} stationId
   * @param {{ force?: boolean }} [options] force: read both now
   */
  async refreshStation(stationId, { force = false } = {}) {
    if (!this.client || this.status === 'unauthorized') {
      return;
    }
    const data = this.dataOf(stationId);
    if (force || !this.isLive(stationId)) {
      try {
        const reading = readingFromStationObservation(
          await this.client.getStationObservation(stationId),
        );
        this.issues.ok(`observation:${stationId}`, `Station ${stationId} observations are back`);
        if (reading && (!data.reading || reading.time > data.reading.time)) {
          this.applyReading(stationId, reading, 'rest');
          await this.fireObservationTriggers(stationId, data.reading);
        } else if (!reading) {
          logger.debug(`Station ${stationId} has no observation yet`);
        }
      } catch (err) {
        this.onRestError(`observation:${stationId}`, `Station ${stationId} observation`, err);
      }
    }
    if (force || this.now() - data.forecastAt >= this.timings.forecastMs) {
      try {
        data.forecast = parseForecast(await this.client.getForecast(stationId));
        data.forecastAt = this.now();
        this.issues.ok(`forecast:${stationId}`, `Station ${stationId} forecast is back`);
        this.requestWidgetRefresh();
      } catch (err) {
        this.onRestError(`forecast:${stationId}`, `Station ${stationId} forecast`, err);
      }
    }
  }

  onRestError(key, what, err) {
    if (err?.isAuthError) {
      // A token revoked while running: say it in the Configuration screen.
      this.status = 'unauthorized';
      this.stopSocket();
      this.gladys.setConnectionStatus(false, MESSAGES.tokenRefused).catch(() => {});
    }
    this.issues.fail(key, `${what} failed: ${err.message}`);
  }

  /**
   * One cycle of the container's timer: every added station refreshed and
   * published (with the heartbeat). The stations list is read again when
   * it could not be read so far.
   */
  async cycle({ force = false } = {}) {
    if (!this.client) {
      return;
    }
    if (this.status !== 'ok') {
      const wait = this.status === 'unauthorized' ? this.timings.unauthorizedRetryMs : 0;
      if (this.now() - this.stationsCheckedAt >= wait) {
        await this.loadStations();
        this.syncSubscriptions();
      }
      if (this.status !== 'ok') {
        return;
      }
    }
    for (const stationId of this.addedStationIds()) {
      await this.refreshStation(stationId, { force });
      await this.publish(stationId);
    }
  }

  /**
   * Publish what changed for a station (and the heartbeat of the rest).
   * @param {number} stationId
   * @param {{ only?: (feature: object) => boolean }} [options]
   */
  async publish(stationId, { only } = {}) {
    if (!this.addedStationIds().includes(stationId)) {
      return;
    }
    const data = this.dataOf(stationId);
    const states = buildStates(
      this.gladys,
      stationId,
      { ...data, now: this.now() },
      this.config.language,
      only,
    );
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeatMs,
      });
      if (count > 0) {
        logger.debug(`Station ${stationId}: ${count} state(s) published`);
      }
      this.issues.ok('publish', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('publish', `Publishing the states failed: ${err.message}`);
    }
  }

  async fireObservationTriggers(stationId, reading) {
    const station = this.stations?.get(stationId) ?? { id: stationId, name: String(stationId) };
    const { rain, thresholds } = this.triggers.onObservation(stationId, {
      raining: isRaining(reading),
      strikeEpoch: reading?.strikeLastEpoch ?? null,
      strikeDistance: reading?.strikeLastDistance ?? null,
    });
    if (rain) {
      await this.fireScene(TRIGGER.RAIN_STARTED, station);
    }
    await this.fireLightning(station, thresholds, reading?.strikeLastDistance);
  }

  async fireLightning(station, thresholds, distance) {
    for (const threshold of thresholds) {
      await this.fireScene(TRIGGER.LIGHTNING_NEARBY, station, {
        within_km: String(threshold),
        distance_km: distance,
      });
    }
  }

  async fireScene(key, station, extra = {}) {
    try {
      await this.gladys.publishSceneEvent(key, {
        device: stationIds(this.gladys, station.id).device,
        station: this.deviceName(station.id) ?? station.name,
        ...extra,
      });
      logger.debug(`Scene event ${key} fired for station ${station.id}`);
      this.issues.ok('scene', 'Gladys accepts the scene events again');
    } catch (err) {
      this.issues.fail('scene', `Firing the scene event ${key} failed: ${err.message}`);
    }
  }

  /** The name the user gave the station's device in Gladys. */
  deviceName(stationId) {
    const externalId = stationIds(this.gladys, stationId).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === externalId)?.name;
  }

  /**
   * The forecast of a station, read now when missing or older than its
   * refresh period (the scene action and the widget may come first).
   * @throws when it cannot be read
   */
  async forecastOf(stationId) {
    const data = this.dataOf(stationId);
    if (!data.forecast || this.now() - data.forecastAt >= this.timings.forecastMs) {
      if (!this.client) {
        throw new Error(MESSAGES.notConfigured.en);
      }
      data.forecast = parseForecast(await this.client.getForecast(stationId));
      data.forecastAt = this.now();
    }
    return data.forecast;
  }

  /** Fire-and-forget nudge: the dashboards re-pull the widget content. */
  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not sent: ${err.message}`);
    }
  }
}
