// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `forecast_summary` — the forecast of a station for today or tomorrow, as a
// ready-made sentence ("Today: Partly cloudy, 4 to 12 °C, 20 % chance of
// rain.") plus its numbers, for a morning message or a "should I water the
// garden" scene. The values also exist as device features; the sentence is
// what a feature cannot give. Its language is the one of the configuration
// (a scene action does not receive the user's language).
// -----------------------------------------------------------------------------

import { stationIdOf } from './devices.js';
import { forecastSentence, pick, CONDITIONS } from './i18n.js';
import { forecastDays } from './tempest/model.js';

export const SCENE_ACTION = {
  FORECAST_SUMMARY: 'forecast_summary',
};

export const DAYS = ['today', 'tomorrow'];

const roundOrNull = (value) => (value === null || value === undefined ? null : Math.round(value));

/**
 * @param {object} hub TempestHub
 * @param {{ device: string, day?: string }} fields resolved by the core
 * @param {() => number} now
 */
export async function forecastSummary(hub, fields, now = () => Date.now()) {
  const stationId = stationIdOf(hub.gladys, fields.device);
  if (stationId === null || !hub.addedStationIds().includes(stationId)) {
    throw new Error('Unknown Tempest station: pick one of the stations added to Gladys');
  }
  const which = DAYS.includes(fields.day) ? fields.day : 'today';
  const forecast = await hub.forecastOf(stationId);
  const day = forecastDays(forecast, Math.floor(now() / 1000))[which];
  if (!day) {
    throw new Error(`No forecast for ${which} yet`);
  }
  const language = hub.config.language;
  return {
    summary: forecastSentence(day, which, language),
    condition: pick(CONDITIONS, language)[day.icon],
    temperature_min: roundOrNull(day.temperatureMin),
    temperature_max: roundOrNull(day.temperatureMax),
    precipitation_probability: roundOrNull(day.precipitationProbability),
  };
}
