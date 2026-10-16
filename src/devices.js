// -----------------------------------------------------------------------------
// One Gladys device per Tempest station, and the states of its features.
//
// The device is keyed on the station id of the Tempest cloud: a Tempest
// replaced under warranty joins the same station and keeps its history in
// Gladys. Feature keys are forever (Gladys keys the history, scenes and
// dashboards on them): add new ones, never rename one.
//
// Units: the API speaks metric. Temperatures in °C, speeds in km/h (the
// Gladys front converts both to the user's preference), pressures in hPa,
// rain in mm.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, CONDITIONS, PRECIPITATION_TYPES_TEXT, pick } from './i18n.js';
import { forecastDays } from './tempest/model.js';

export const DEVICE_TYPE = 'station';

const MS_TO_KMH = 3.6;

const round = (value, decimals) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * The features of a station, in display order. `read` turns the station data
 * ({ reading, forecast, rapid }) into the state: a number, `{ text }`, or null
 * when the value is unknown (nothing is published then).
 */
export const FEATURES = [
  {
    key: 'temperature',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -60,
    max: 70,
    read: ({ reading }) => round(reading?.temperature, 1),
  },
  {
    key: 'feels_like',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -80,
    max: 80,
    read: ({ reading }) => round(reading?.feelsLike, 1),
  },
  {
    key: 'dew_point',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -80,
    max: 60,
    read: ({ reading }) => round(reading?.dewPoint, 1),
  },
  {
    key: 'humidity',
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    read: ({ reading }) => round(reading?.humidity, 0),
  },
  {
    key: 'pressure_station',
    category: C.PRESSURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.HECTO_PASCAL,
    min: 500,
    max: 1100,
    read: ({ reading }) => round(reading?.stationPressure, 1),
  },
  {
    key: 'pressure_sea_level',
    category: C.PRESSURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.HECTO_PASCAL,
    min: 850,
    max: 1100,
    read: ({ reading }) => round(reading?.seaLevelPressure, 1),
  },
  {
    key: 'wind_speed',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
    read: ({ reading }) => round(scale(reading?.windAvg, MS_TO_KMH), 1),
  },
  {
    key: 'wind_gust',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
    read: ({ reading }) => round(scale(reading?.windGust, MS_TO_KMH), 1),
  },
  {
    key: 'wind_direction',
    category: C.ANGLE_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.DEGREE,
    min: 0,
    max: 360,
    read: ({ reading }) => round(reading?.windDirection, 0),
  },
  {
    // Every 3 seconds from the live feed: no history, it would only fill the
    // database with what the average and the gusts already tell.
    key: 'wind_rapid',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
    keepHistory: false,
    read: ({ reading, rapid }) =>
      round(scale(rapid ? rapid.speed : reading?.windAvg, MS_TO_KMH), 1),
  },
  {
    key: 'rain_rate',
    category: C.PRECIPITATION_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MILLIMETER_PER_HOUR,
    min: 0,
    max: 500,
    read: ({ reading }) => round(reading?.rainRate, 1),
  },
  {
    key: 'rain_today',
    category: C.PRECIPITATION_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MILLIMETER_PER_DAY,
    min: 0,
    max: 2000,
    read: ({ reading }) => round(reading?.rainToday, 1),
  },
  {
    key: 'raining',
    category: C.RAIN_SENSOR,
    type: T.SENSOR.BINARY,
    min: 0,
    max: 1,
    read: ({ reading }) => (isRaining(reading) === null ? null : isRaining(reading) ? 1 : 0),
  },
  {
    key: 'precipitation_type',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    min: 0,
    max: 0,
    read: ({ reading }, language) =>
      reading?.precipitationType === null || reading?.precipitationType === undefined
        ? null
        : { text: pick(PRECIPITATION_TYPES_TEXT, language)[reading.precipitationType] },
  },
  {
    key: 'lightning_count',
    category: C.COUNTER_SENSOR,
    type: T.SENSOR.INTEGER,
    min: 0,
    max: 100000,
    read: ({ reading }) => round(reading?.strikeCount1h, 0),
  },
  {
    key: 'lightning_distance',
    category: C.DISTANCE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KM,
    min: 0,
    max: 100,
    read: ({ reading }) => round(reading?.strikeLastDistance, 0),
  },
  {
    key: 'uv',
    category: C.UV_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.UV_INDEX,
    min: 0,
    max: 20,
    read: ({ reading }) => round(reading?.uv, 1),
  },
  {
    // No W/m² unit in Gladys: the unit is in the name.
    key: 'solar_radiation',
    category: C.LIGHT_SENSOR,
    type: T.SENSOR.DECIMAL,
    min: 0,
    max: 2000,
    read: ({ reading }) => round(reading?.solarRadiation, 0),
  },
  {
    key: 'illuminance',
    category: C.LIGHT_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.LUX,
    min: 0,
    max: 200000,
    read: ({ reading }) => round(reading?.illuminance, 0),
  },
  {
    // The Tempest reports its supercapacitor voltage, not a percentage:
    // around 2.4 to 2.8 V, power saving below 2.455 V (Tempest
    // documentation). Inventing a percentage would mislead the battery alerts
    // of Gladys.
    key: 'battery_voltage',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.VOLTAGE,
    unit: U.VOLT,
    min: 0,
    max: 4,
    read: ({ reading }) => round(reading?.battery, 2),
  },
  ...['today', 'tomorrow'].flatMap((day) => [
    {
      key: `forecast_${day}_condition`,
      category: C.TEXT,
      type: T.TEXT.TEXT,
      min: 0,
      max: 0,
      forecast: true,
      read: (data, language) => {
        const forecast = dayOf(data, day);
        return forecast ? { text: pick(CONDITIONS, language)[forecast.icon] } : null;
      },
    },
    {
      key: `forecast_${day}_min`,
      category: C.TEMPERATURE_SENSOR,
      type: T.TEMPERATURE_SENSOR.MIN,
      unit: U.CELSIUS,
      min: -60,
      max: 70,
      forecast: true,
      read: (data) => round(dayOf(data, day)?.temperatureMin, 1),
    },
    {
      key: `forecast_${day}_max`,
      category: C.TEMPERATURE_SENSOR,
      type: T.TEMPERATURE_SENSOR.MAX,
      unit: U.CELSIUS,
      min: -60,
      max: 70,
      forecast: true,
      read: (data) => round(dayOf(data, day)?.temperatureMax, 1),
    },
    {
      key: `forecast_${day}_precipitation`,
      category: C.PRECIPITATION_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: U.PERCENT,
      min: 0,
      max: 100,
      forecast: true,
      read: (data) => round(dayOf(data, day)?.precipitationProbability, 0),
    },
  ]),
];

function scale(value, factor) {
  return value === null || value === undefined ? null : value * factor;
}

/**
 * Rain right now: a precipitation type, or rain in the last interval.
 * @returns {boolean|null} null when the reading says nothing about it
 */
export function isRaining(reading) {
  if (!reading) {
    return null;
  }
  const typed = reading.precipitationType;
  const rate = reading.rainRate;
  if ((typed === null || typed === undefined) && (rate === null || rate === undefined)) {
    return null;
  }
  return (typed ?? 0) > 0 || (rate ?? 0) > 0;
}

function dayOf({ forecast, now }, which) {
  if (!forecast) {
    return null;
  }
  return forecastDays(forecast, Math.floor((now ?? Date.now()) / 1000))[which];
}

/** The external ids of a station. */
export const stationIds = (gladys, stationId) => gladys.externalIds(DEVICE_TYPE, String(stationId));

/**
 * The station id behind a device external id, or null for any other id.
 * @param {string} externalId
 */
export function stationIdOf(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = Number(externalId.slice(prefix.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The discovered device of a station.
 * @param {object} gladys
 * @param {{ id: number, name: string, serial: string|null }} station
 * @param {string} language feature names language
 */
export function buildDevice(gladys, station, language) {
  const ids = stationIds(gladys, station.id);
  const names = pick(FEATURE_NAMES, language);
  return {
    name: station.name,
    external_id: ids.device,
    model: 'Tempest',
    // The container refreshes the stations itself (src/poller.js): the core's
    // poll is a fallback, at the slowest pace it schedules.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: [{ name: 'STATION_ID', value: String(station.id) }],
    features: FEATURES.map((feature) => ({
      name: names[feature.key],
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: feature.min,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: feature.keepHistory ?? true,
    })),
  };
}

/**
 * The states of a station, in the publishStates format.
 * @param {object} gladys
 * @param {number} stationId
 * @param {{ reading?: object|null, forecast?: object|null, rapid?: object|null, now?: number }} data
 * @param {string} language
 * @param {(feature: object) => boolean} [only] filter on the features
 */
export function buildStates(gladys, stationId, data, language, only = () => true) {
  const ids = stationIds(gladys, stationId);
  const states = [];
  for (const feature of FEATURES) {
    if (!only(feature)) {
      continue;
    }
    const value = feature.read(data, language);
    if (value === null || value === undefined) {
      continue;
    }
    const externalId = ids.feature(feature.key);
    states.push(
      typeof value === 'object'
        ? { device_feature_external_id: externalId, text: value.text }
        : { device_feature_external_id: externalId, state: value },
    );
  }
  return states;
}
