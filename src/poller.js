// -----------------------------------------------------------------------------
// The container's own refresh timer.
//
// The stations are published with `should_poll: true` and a valid
// `poll_frequency`, but the core cannot be trusted to call onPoll: Gladys
// 5.2.x skips devices created without `should_poll`, and a device keeps the
// polling fields it was created with (GladysAssistant/Gladys#3198). So the
// container refreshes by itself, once a minute, and the core's onPoll stays
// as a fallback.
//
// No double work: a cycle skips when the previous one ran less than half a
// period ago, and the core's onPoll skips when one ran less than 90 % of a
// period ago — while the timer runs, the core's poll costs nothing; it takes
// over only if the timer stalls.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'poller' });

export const POLL_PERIOD_MS = 60 * 1000;

/**
 * @param {object} options
 * @param {{ cycle: (options?: { force?: boolean }) => Promise<void> }} options.hub
 * @param {object} options.gladys
 * @param {number} [options.periodMs]
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {() => number} [options.now]
 */
export function createPoller({
  hub,
  gladys,
  periodMs = POLL_PERIOD_MS,
  timers = true,
  now = () => Date.now(),
}) {
  let lastCycleAt = null;
  let running = null;
  let timer = null;
  let stopped = true;

  /**
   * One cycle, unless one ran less than `minGap` periods ago. Concurrent
   * callers share the cycle in progress; a forced call waits for it, then
   * runs a fresh one.
   */
  async function run({ force = false, minGap = 0.5 } = {}) {
    while (running && force) {
      await running.catch(() => {});
    }
    if (running) {
      return running;
    }
    if (!force && lastCycleAt !== null && now() - lastCycleAt < periodMs * minGap) {
      logger.debug(`Refreshed ${now() - lastCycleAt} ms ago, skipped`);
      return undefined;
    }
    if (gladys.connected === false) {
      logger.debug('Gladys unreachable: refresh skipped');
      return undefined;
    }
    lastCycleAt = now();
    running = hub.cycle({ force }).catch((err) => {
      logger.error(`Refresh cycle failed (${err.message})`);
    });
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      await run();
      schedule();
    }, periodMs);
    timer.unref?.();
  }

  return {
    /** The core's onPoll: a fallback, skipped while the timer runs. */
    pollFromCore() {
      return run({ minGap: 0.9 });
    },

    /** (Re)start: refresh everything now, then every period. */
    async restart() {
      stopped = false;
      schedule();
      await run({ force: true });
    },

    /** A cycle now, e.g. a station just added in Gladys. */
    refreshNow() {
      return run({ force: true });
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
