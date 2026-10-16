// -----------------------------------------------------------------------------
// The two scene triggers, as transitions.
//
// `rain_started` — "it starts raining". The station's own rain-start event
// (`evt_precip`, live feed) arrives within seconds, where the minute
// observation lags up to a minute; and the "Raining" feature flaps between two
// showers, so a scene bound to it would run at every lull. The trigger fires
// once per rain episode: on the first sign of rain (rain-start event, or an
// observation reporting rain) after 30 minutes without any.
//
// `lightning_nearby` — "lightning within N km". Scene filters only compare
// for equality (a threshold belongs to a device feature), so the event is
// fired once per distance threshold the strike falls within: a strike at
// 8 km fires `within_km: "10"`, `"15"`, `"20"`, `"30"`, `"40"`, and the
// scene author picks one threshold (required filter). Each threshold fires
// once per storm: on the first strike within it after 30 minutes without
// any — the storm coming closer fires the smaller thresholds in turn.
//
// After a restart, the first reading is a baseline: rain already falling or a
// strike already known fires nothing (it would re-run every scene).
// -----------------------------------------------------------------------------

export const TRIGGER = {
  RAIN_STARTED: 'rain_started',
  LIGHTNING_NEARBY: 'lightning_nearby',
};

// Distance thresholds offered to the scene author, in km. The Tempest
// estimates strike distances up to about 40 km.
export const LIGHTNING_THRESHOLDS_KM = [5, 10, 15, 20, 30, 40];

export const QUIET_PERIOD_MS = 30 * 60 * 1000;

// A strike older than this when first seen (REST fallback after an outage)
// is history, not news.
export const STRIKE_FRESHNESS_MS = 15 * 60 * 1000;

/**
 * @param {object} options
 * @param {() => number} [options.now]
 */
export function createTriggerTracker({ now = () => Date.now() } = {}) {
  /** Per station: { baseline, lastRainAt, lastStrikeEpoch, lastStrikeAt: Map<threshold, ms> } */
  const stations = new Map();

  const stateOf = (stationId) => {
    let state = stations.get(stationId);
    if (!state) {
      state = { baseline: false, lastRainAt: null, lastStrikeEpoch: null, lastStrikeAt: new Map() };
      stations.set(stationId, state);
    }
    return state;
  };

  function rainSignal(state, at) {
    const fire = state.lastRainAt === null || at - state.lastRainAt >= QUIET_PERIOD_MS;
    state.lastRainAt = at;
    return fire;
  }

  function strike(state, { epoch, distance }) {
    if (epoch !== null && state.lastStrikeEpoch !== null && epoch <= state.lastStrikeEpoch) {
      return [];
    }
    if (epoch !== null) {
      state.lastStrikeEpoch = epoch;
    }
    const at = now();
    if (epoch !== null && at - epoch * 1000 > STRIKE_FRESHNESS_MS) {
      return [];
    }
    const fired = [];
    for (const threshold of LIGHTNING_THRESHOLDS_KM) {
      if (distance > threshold) {
        continue;
      }
      const last = state.lastStrikeAt.get(threshold);
      state.lastStrikeAt.set(threshold, at);
      if (last === undefined || at - last >= QUIET_PERIOD_MS) {
        fired.push(threshold);
      }
    }
    return fired;
  }

  return {
    /**
     * The rain-start event of the live feed.
     * @returns {boolean} fire `rain_started`
     */
    onRainStart(stationId) {
      const state = stateOf(stationId);
      state.baseline = true;
      return rainSignal(state, now());
    },

    /**
     * A lightning strike of the live feed.
     * @param {{ epoch: number|null, distance: number }} event
     * @returns {number[]} the thresholds to fire `lightning_nearby` for
     */
    onStrike(stationId, event) {
      const state = stateOf(stationId);
      state.baseline = true;
      return strike(state, event);
    },

    /**
     * A new observation (live feed or REST).
     * @param {{ raining: boolean|null, strikeEpoch: number|null, strikeDistance: number|null }} observation
     * @returns {{ rain: boolean, thresholds: number[] }}
     */
    onObservation(stationId, { raining, strikeEpoch, strikeDistance }) {
      const state = stateOf(stationId);
      if (!state.baseline) {
        state.baseline = true;
        if (raining) {
          state.lastRainAt = now();
        }
        if (strikeEpoch !== null) {
          state.lastStrikeEpoch = strikeEpoch;
        }
        return { rain: false, thresholds: [] };
      }
      const rain = raining ? rainSignal(state, now()) : false;
      const thresholds =
        strikeEpoch !== null && strikeDistance !== null
          ? strike(state, { epoch: strikeEpoch, distance: strikeDistance })
          : [];
      return { rain, thresholds };
    },

    /** Forget a station (removed from Gladys). */
    forget(stationId) {
      stations.delete(stationId);
    },
  };
}
