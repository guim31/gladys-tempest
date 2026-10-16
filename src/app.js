// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys), so index.js stays a few lines and the tests drive the very same
// wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { stationIdOf } from './devices.js';
import { TempestHub } from './hub.js';
import { MESSAGES } from './i18n.js';
import { createPoller } from './poller.js';
import { SCENE_ACTION, forecastSummary } from './scenes.js';
import { WIDGET, getStationWidget } from './widgets.js';

const logger = createLogger({ name: 'tempest-app' });

export const ACTION = {
  LIST_STATIONS: 'list_stations',
};

/**
 * @param {object} gladys
 * @param {object} [options] test seams: fetch, createWebSocket, now, timers, timings, socketTimings
 * @returns {{ hub: TempestHub, poller: object, stop: () => void }}
 */
export function registerHandlers(gladys, options = {}) {
  const now = options.now ?? (() => Date.now());
  const hub = new TempestHub({
    gladys,
    fetch: options.fetch,
    createWebSocket: options.createWebSocket,
    now,
    timings: options.timings,
    socketTimings: options.socketTimings,
  });
  const poller = createPoller({ hub, gladys, timers: options.timers ?? true, now });

  // --- Discovery: the stations of the account ------------------------------
  gladys.onScanRequest(async () => {
    logger.info('Scan requested: reading the Tempest stations');
    await hub.loadStations();
    hub.syncSubscriptions();
  });

  // --- Read-only devices -------------------------------------------------------
  gladys.onSetValue(async (device, feature) => {
    throw new Error(`${feature.external_id} is read-only`);
  });

  // The core's poll: a fallback of the container's own timer.
  gladys.onPoll(() => poller.pollFromCore());

  // A station just added (or updated) in Gladys: the SDK forgot what it had
  // published for it and the core dropped the states sent before it existed.
  // Listen to it, send everything now, and refresh the open widgets.
  const onStationChanged = async (device) => {
    if (stationIdOf(gladys, device.external_id) === null) {
      return;
    }
    hub.syncSubscriptions();
    await poller.refreshNow();
    hub.requestWidgetRefresh();
  };
  gladys.onDeviceCreated(onStationChanged);
  gladys.onDeviceUpdated(onStationChanged);
  gladys.onDeviceDeleted(async (device) => {
    const stationId = stationIdOf(gladys, device.external_id);
    if (stationId !== null) {
      hub.triggers.forget(stationId);
      hub.syncSubscriptions();
    }
  });

  // --- Configuration screen action ----------------------------------------------
  gladys.onAction(ACTION.LIST_STATIONS, async () => {
    logger.info('Action list_stations');
    return hub.listStations();
  });

  // --- Scene action ---------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTION.FORECAST_SUMMARY, (fields) =>
    forecastSummary(hub, fields, now),
  );

  // --- Dashboard widget -----------------------------------------------------------
  gladys.onWidgetGet(WIDGET.STATION, (request) => getStationWidget(hub, request));

  // --- Configuration -------------------------------------------------------------
  gladys.onConfigUpdated(async (raw) => {
    logger.info('Configuration updated');
    await hub.configure(normalizeConfig(raw));
    await poller.restart();
  });

  // --- Connection lifecycle (the SDK logs the Gladys link itself) -------------
  gladys.on('connected', async () => {
    try {
      await hub.configure(normalizeConfig(await gladys.getConfig()));
      await poller.restart();
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    }
  });

  return {
    hub,
    poller,
    stop() {
      poller.stop();
      hub.stop();
    },
  };
}
