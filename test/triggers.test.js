// -----------------------------------------------------------------------------
// The scene triggers as transitions: once per rain episode, once per storm
// and distance threshold, nothing on the baseline after a restart.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIET_PERIOD_MS, createTriggerTracker } from '../src/triggers.js';
import { createClock } from './helpers/world.js';

const MINUTE = 60 * 1000;

test('rain: the first observation is a baseline, then once per episode', () => {
  const now = createClock(1_700_000_000_000);
  const tracker = createTriggerTracker({ now });
  const dry = { raining: false, strikeEpoch: null, strikeDistance: null };
  const wet = { raining: true, strikeEpoch: null, strikeDistance: null };

  // Restarted during a shower: nothing.
  assert.equal(tracker.onObservation(1, wet).rain, false);
  now.advance(MINUTE);
  assert.equal(tracker.onObservation(1, wet).rain, false);
  // A lull of 20 minutes is the same episode.
  now.advance(20 * MINUTE);
  assert.equal(tracker.onObservation(1, dry).rain, false);
  assert.equal(tracker.onObservation(1, wet).rain, false);
  // 30 dry minutes: a new episode.
  now.advance(QUIET_PERIOD_MS);
  assert.equal(tracker.onObservation(1, wet).rain, true);
  // The rain-start event of the same episode adds nothing.
  assert.equal(tracker.onRainStart(1), false);
});

test('rain: the rain-start event fires at once, the next observation does not again', () => {
  const now = createClock(1_700_000_000_000);
  const tracker = createTriggerTracker({ now });
  tracker.onObservation(1, { raining: false, strikeEpoch: null, strikeDistance: null });
  assert.equal(tracker.onRainStart(1), true);
  now.advance(MINUTE);
  assert.equal(
    tracker.onObservation(1, { raining: true, strikeEpoch: null, strikeDistance: null }).rain,
    false,
  );
  // Each station has its own episodes.
  assert.equal(tracker.onRainStart(2), true);
});

test('lightning: one event per threshold the strike falls within, once per storm', () => {
  const now = createClock(1_700_000_000_000);
  const tracker = createTriggerTracker({ now });
  const epoch = () => Math.floor(now() / 1000);

  assert.deepEqual(tracker.onStrike(1, { epoch: epoch(), distance: 27 }), [30, 40]);
  now.advance(MINUTE);
  // The storm comes closer: only the new thresholds fire.
  assert.deepEqual(tracker.onStrike(1, { epoch: epoch(), distance: 8 }), [10, 15, 20]);
  now.advance(MINUTE);
  assert.deepEqual(tracker.onStrike(1, { epoch: epoch(), distance: 3 }), [5]);
  now.advance(MINUTE);
  assert.deepEqual(tracker.onStrike(1, { epoch: epoch(), distance: 3 }), []);
  // The same strike seen again (the observation summary): nothing.
  assert.deepEqual(tracker.onStrike(1, { epoch: epoch(), distance: 3 }), []);
  // Strikes keep each threshold busy; 30 quiet minutes rearm them.
  now.advance(QUIET_PERIOD_MS);
  assert.deepEqual(tracker.onStrike(1, { epoch: epoch(), distance: 12 }), [15, 20, 30, 40]);
});

test('lightning: the baseline and stale strikes fire nothing', () => {
  const now = createClock(1_700_000_000_000);
  const tracker = createTriggerTracker({ now });
  const epoch = Math.floor(now() / 1000);
  // Known at startup: baseline.
  assert.deepEqual(
    tracker.onObservation(1, { raining: false, strikeEpoch: epoch - 60, strikeDistance: 5 })
      .thresholds,
    [],
  );
  // A newer strike reported by an observation fires.
  assert.deepEqual(
    tracker.onObservation(1, { raining: false, strikeEpoch: epoch, strikeDistance: 18 }).thresholds,
    [20, 30, 40],
  );
  // A strike learnt an hour late (REST fallback after an outage) is history.
  now.advance(60 * MINUTE);
  assert.deepEqual(
    tracker.onObservation(1, { raining: false, strikeEpoch: epoch + 30, strikeDistance: 2 })
      .thresholds,
    [],
  );
  tracker.forget(1);
  assert.equal(
    tracker.onObservation(1, { raining: true, strikeEpoch: null, strikeDistance: null }).rain,
    false,
  );
});
