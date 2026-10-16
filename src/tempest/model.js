// -----------------------------------------------------------------------------
// The Tempest API payloads, turned into one flat "reading" per station.
//
// Three sources describe the same station, each with its own shape:
//   - the WebSocket `obs_st` message: a positional array (layout below) plus a
//     `summary` object (feels like, dew point, lightning of the last hour…);
//   - the REST station observation (`/observations/station/{id}`): named
//     fields, but no battery voltage nor precipitation type;
//   - the REST `better_forecast`: current conditions, daily and hourly
//     forecasts.
// Every value is metric as the API sends it by default (°C, m/s, mb, mm, km).
// The units the user picked in the Tempest app (`station_units`) only concern
// their own display and are ignored here.
// -----------------------------------------------------------------------------

// `obs_st` layout (Tempest API WebSocket reference).
export const OBS_ST = {
  EPOCH: 0,
  WIND_LULL: 1,
  WIND_AVG: 2,
  WIND_GUST: 3,
  WIND_DIRECTION: 4,
  WIND_SAMPLE_INTERVAL: 5,
  STATION_PRESSURE: 6,
  AIR_TEMPERATURE: 7,
  RELATIVE_HUMIDITY: 8,
  ILLUMINANCE: 9,
  UV: 10,
  SOLAR_RADIATION: 11,
  RAIN_ACCUMULATED: 12,
  PRECIPITATION_TYPE: 13,
  STRIKE_AVG_DISTANCE: 14,
  STRIKE_COUNT: 15,
  BATTERY: 16,
  REPORT_INTERVAL: 17,
  LOCAL_DAY_RAIN: 18,
};

// Precipitation type of the station: 0 none, 1 rain, 2 hail, 3 rain + hail.
export const PRECIPITATION_TYPES = [0, 1, 2, 3];

// The forecast icons of the API (better_forecast reference). Anything else is
// shown as "unknown" rather than guessed.
export const FORECAST_ICONS = [
  'clear-day',
  'clear-night',
  'cloudy',
  'foggy',
  'partly-cloudy-day',
  'partly-cloudy-night',
  'possibly-rainy-day',
  'possibly-rainy-night',
  'possibly-sleet-day',
  'possibly-sleet-night',
  'possibly-snow-day',
  'possibly-snow-night',
  'possibly-thunderstorm-day',
  'possibly-thunderstorm-night',
  'rainy',
  'sleet',
  'snow',
  'thunderstorm',
  'windy',
];

const finite = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : null;

/**
 * The stations of the account, from `GET /stations`. Only the stations with a
 * Tempest device (`ST`) are usable: the older AIR and SKY sensors send other
 * messages, not supported here.
 * @param {object} payload
 * @returns {Array<object>}
 */
export function parseStations(payload) {
  const stations = Array.isArray(payload?.stations) ? payload.stations : [];
  return stations
    .filter((station) => finite(station?.station_id) !== null)
    .map((station) => {
      const devices = Array.isArray(station.devices) ? station.devices : [];
      const tempest = devices.find(
        (device) => device?.device_type === 'ST' && finite(device.device_id) !== null,
      );
      const name =
        (typeof station.name === 'string' && station.name.trim()) ||
        (typeof station.public_name === 'string' && station.public_name.trim()) ||
        `Tempest ${station.station_id}`;
      return {
        id: finite(station.station_id),
        name: name.slice(0, 100),
        deviceId: tempest ? finite(tempest.device_id) : null,
        serial: typeof tempest?.serial_number === 'string' ? tempest.serial_number : null,
        // Height of the sensor: ground elevation plus height above ground,
        // used to reduce the station pressure to sea level.
        elevation: finite(station.station_meta?.elevation),
        heightAboveGround: finite(tempest?.device_meta?.agl) ?? 0,
        timezone: typeof station.timezone === 'string' ? station.timezone : null,
        otherDevices: devices
          .filter((device) => device?.device_type && !['ST', 'HB'].includes(device.device_type))
          .map((device) => device.device_type),
      };
    });
}

/**
 * Station pressure reduced to sea level (AMS formula of the Tempest
 * derived-metric reference), in mb.
 * @param {number} stationPressure mb
 * @param {number} height metres (elevation + height above ground)
 */
export function seaLevelPressure(stationPressure, height) {
  const P0 = 1013.25;
  const Rd = 287.05;
  const gamma = 0.0065;
  const g = 9.80665;
  const T0 = 288.15;
  const exponent = (Rd * gamma) / g;
  return (
    stationPressure *
    (1 + (P0 / stationPressure) ** exponent * ((gamma * height) / T0)) ** (1 / exponent)
  );
}

/**
 * Dew point (Magnus formula, the Tempest reference constants), in °C.
 * @param {number} temperature °C
 * @param {number} humidity %
 */
export function dewPoint(temperature, humidity) {
  if (humidity <= 0) {
    return null;
  }
  const gamma = Math.log(humidity / 100) + (17.67 * temperature) / (temperature + 243.5);
  return (243.5 * gamma) / (17.67 - gamma);
}

/**
 * A WebSocket (or REST device) `obs_st` message, as a reading.
 * @param {object} message
 * @param {{ elevation: number|null, heightAboveGround: number }} [station]
 * @returns {object|null} null when the message carries no observation
 */
export function readingFromObsSt(message, station = {}) {
  const obs = Array.isArray(message?.obs) ? message.obs[message.obs.length - 1] : null;
  if (!Array.isArray(obs) || finite(obs[OBS_ST.EPOCH]) === null) {
    return null;
  }
  const at = (index) => finite(obs[index]);
  const summary = message.summary && typeof message.summary === 'object' ? message.summary : {};
  const temperature = at(OBS_ST.AIR_TEMPERATURE);
  const humidity = at(OBS_ST.RELATIVE_HUMIDITY);
  const stationPressure = at(OBS_ST.STATION_PRESSURE);
  const reportMinutes = at(OBS_ST.REPORT_INTERVAL) || 1;
  const rainInterval = at(OBS_ST.RAIN_ACCUMULATED);
  const precipitationType = at(OBS_ST.PRECIPITATION_TYPE);
  const height =
    station.elevation === null || station.elevation === undefined
      ? null
      : station.elevation + (station.heightAboveGround ?? 0);
  return {
    time: at(OBS_ST.EPOCH),
    temperature,
    humidity,
    dewPoint:
      finite(summary.dew_point) ??
      (temperature !== null && humidity !== null ? dewPoint(temperature, humidity) : null),
    feelsLike: finite(summary.feels_like) ?? temperature,
    stationPressure,
    seaLevelPressure:
      stationPressure !== null && stationPressure > 0 && height !== null
        ? seaLevelPressure(stationPressure, height)
        : null,
    pressureTrend: typeof summary.pressure_trend === 'string' ? summary.pressure_trend : null,
    windLull: at(OBS_ST.WIND_LULL),
    windAvg: at(OBS_ST.WIND_AVG),
    windGust: at(OBS_ST.WIND_GUST),
    windDirection: at(OBS_ST.WIND_DIRECTION),
    // The rain of the report interval, scaled to an hourly rate.
    rainRate: rainInterval === null ? null : (rainInterval * 60) / reportMinutes,
    rainToday: at(OBS_ST.LOCAL_DAY_RAIN),
    precipitationType: PRECIPITATION_TYPES.includes(precipitationType) ? precipitationType : null,
    strikeCount1h: finite(summary.strike_count_1h),
    strikeLastDistance: finite(summary.strike_last_dist),
    strikeLastEpoch: finite(summary.strike_last_epoch),
    uv: at(OBS_ST.UV),
    solarRadiation: at(OBS_ST.SOLAR_RADIATION),
    illuminance: at(OBS_ST.ILLUMINANCE),
    battery: at(OBS_ST.BATTERY),
  };
}

/**
 * A REST station observation, as a reading.
 * @param {object} payload `/observations/station/{id}`
 * @returns {object|null} null when the station sent nothing yet
 */
export function readingFromStationObservation(payload) {
  const obs = Array.isArray(payload?.obs) ? payload.obs[0] : null;
  if (!obs || finite(obs.timestamp) === null) {
    return null;
  }
  const rain = finite(obs.precip);
  return {
    time: finite(obs.timestamp),
    temperature: finite(obs.air_temperature),
    humidity: finite(obs.relative_humidity),
    dewPoint: finite(obs.dew_point),
    feelsLike: finite(obs.feels_like),
    stationPressure: finite(obs.station_pressure),
    seaLevelPressure: finite(obs.sea_level_pressure),
    pressureTrend: typeof obs.pressure_trend === 'string' ? obs.pressure_trend : null,
    windLull: finite(obs.wind_lull),
    windAvg: finite(obs.wind_avg),
    windGust: finite(obs.wind_gust),
    windDirection: finite(obs.wind_direction),
    // `precip` is the rain of the last minute.
    rainRate: rain === null ? null : rain * 60,
    rainToday: finite(obs.precip_accum_local_day),
    // Not in the REST observation: rain is the only type it can tell.
    precipitationType: rain === null ? null : rain > 0 ? 1 : 0,
    strikeCount1h: finite(obs.lightning_strike_count_last_1hr),
    strikeLastDistance: finite(obs.lightning_strike_last_distance),
    strikeLastEpoch: finite(obs.lightning_strike_last_epoch),
    uv: finite(obs.uv),
    solarRadiation: finite(obs.solar_radiation),
    illuminance: finite(obs.brightness),
    battery: null,
  };
}

/**
 * Merge a newer reading into the previous one: a value the new source does
 * not carry (the battery over REST) keeps the last known one.
 */
export function mergeReading(previous, next) {
  if (!previous) {
    return { ...next };
  }
  if (!next || next.time < previous.time) {
    return previous;
  }
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * A `better_forecast` payload, normalized.
 * @param {object} payload
 * @returns {{ current: object|null, days: Array<object>, hours: Array<object>, timezone: string|null }}
 */
export function parseForecast(payload) {
  const icon = (value) => (FORECAST_ICONS.includes(value) ? value : 'unknown');
  const probability = (value) => {
    const number = finite(value);
    return number === null ? null : Math.min(100, Math.max(0, number));
  };
  const current = payload?.current_conditions ?? null;
  const days = Array.isArray(payload?.forecast?.daily) ? payload.forecast.daily : [];
  const hours = Array.isArray(payload?.forecast?.hourly) ? payload.forecast.hourly : [];
  return {
    timezone: typeof payload?.timezone === 'string' ? payload.timezone : null,
    current: current
      ? {
          time: finite(current.time),
          icon: icon(current.icon),
          temperature: finite(current.air_temperature),
          pressureTrend: typeof current.pressure_trend === 'string' ? current.pressure_trend : null,
          lightningLastEpoch: finite(current.lightning_strike_last_epoch),
          lightningLastDistance: finite(current.lightning_strike_last_distance),
        }
      : null,
    days: days
      .filter((day) => finite(day?.day_start_local) !== null)
      .map((day) => ({
        start: finite(day.day_start_local),
        icon: icon(day.icon),
        temperatureMax: finite(day.air_temp_high),
        temperatureMin: finite(day.air_temp_low),
        precipitationProbability: probability(day.precip_probability),
        precipitationType: typeof day.precip_type === 'string' ? day.precip_type : null,
        sunrise: finite(day.sunrise),
        sunset: finite(day.sunset),
      })),
    hours: hours
      .filter((hour) => finite(hour?.time) !== null)
      .map((hour) => ({
        time: finite(hour.time),
        icon: icon(hour.icon),
        temperature: finite(hour.air_temperature),
        precipitationProbability: probability(hour.precip_probability),
        precipitation: finite(hour.precip),
        windAvg: finite(hour.wind_avg),
        windGust: finite(hour.wind_gust),
      })),
  };
}

/**
 * Today's and tomorrow's forecast: the first day that has not ended yet, and
 * the next one. The API starts the list with the current local day, but a
 * forecast read just before midnight is still served after it.
 * @param {{ days: Array<object> }} forecast
 * @param {number} nowSeconds
 */
export function forecastDays(forecast, nowSeconds) {
  const days = (forecast?.days ?? []).filter((day) => day.start + 86400 > nowSeconds);
  return { today: days[0] ?? null, tomorrow: days[1] ?? null, upcoming: days };
}
