// -----------------------------------------------------------------------------
// The "Forecast summary" scene action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN } from './helpers/fakeTempest.js';
import { addStation, createWorld } from './helpers/world.js';

const device = (gladys) => gladys.externalIds('station', '20001').device;

test("today's and tomorrow's forecast, as a sentence and numbers", async () => {
  const world = await createWorld();
  await addStation(world);
  const today = await world.gladys.fake.sceneAction('forecast_summary', {
    device: device(world.gladys),
  });
  assert.deepEqual(today, {
    success: true,
    data: {
      outputs: {
        summary: "Aujourd'hui : Dégagé, de -6 à 5 °C, 0 % de risque de pluie.",
        condition: 'Dégagé',
        temperature_min: -6,
        temperature_max: 5,
        precipitation_probability: 0,
      },
    },
  });
  const tomorrow = await world.gladys.fake.sceneAction('forecast_summary', {
    device: device(world.gladys),
    day: 'tomorrow',
  });
  assert.equal(tomorrow.data.outputs.temperature_max, 7);
  world.app.stop();
});

test('the sentence follows the configured language', async () => {
  const world = await createWorld({ config: { token: TOKEN, language: 'de' } });
  await addStation(world);
  const ack = await world.gladys.fake.sceneAction('forecast_summary', {
    device: device(world.gladys),
    day: 'tomorrow',
  });
  assert.equal(ack.data.outputs.summary, 'Morgen: Klar, -1 bis 7 °C, 0 % Regenwahrscheinlichkeit.');
  world.app.stop();
});

test('a station not added, or an unreachable forecast, fails the action only', async () => {
  const world = await createWorld();
  let ack = await world.gladys.fake.sceneAction('forecast_summary', {
    device: device(world.gladys),
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unknown Tempest station/);

  await addStation(world);
  world.cloud.failures['better_forecast'] = 'down';
  world.now.advance(31 * 60 * 1000);
  ack = await world.gladys.fake.sceneAction('forecast_summary', { device: device(world.gladys) });
  assert.equal(ack.success, false);
  assert.match(ack.error, /unreachable/);
  world.app.stop();
});
