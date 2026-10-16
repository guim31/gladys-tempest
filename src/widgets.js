// -----------------------------------------------------------------------------
// The "Tempest station" dashboard widget: the live observation and the
// forecast of one station.
//
// Content budget of the core: 8 components, 2 texts at most. Here: 5 live
// tiles bound to the station's features (they follow the published states
// without any refresh), 1 status list, 1 forecast list, 1 caption.
// The content is pre-localized from the viewer's `language` and `units`
// (the core caches it per settings, language and units).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { stationIdOf, stationIds } from './devices.js';
import {
  CONDITIONS,
  PRECIPITATION_TYPES_TEXT,
  PRESSURE_TRENDS,
  compassPoint,
  pick,
} from './i18n.js';
import { forecastDays } from './tempest/model.js';

export const WIDGET = {
  STATION: 'station',
};

export const FORECAST_VIEWS = ['daily', 'hourly'];

export const CONTENT_TTL_SECONDS = 300;

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

export const TEXT = {
  en: {
    notConfigured: 'Enter your Tempest access token in the integration configuration.',
    pickStation: 'Pick a station in the widget settings.',
    unknownStation: 'This station is no longer in Gladys: pick another one in the settings.',
    waiting: 'Waiting for the first observation of the station…',
    temperature: 'Temperature',
    humidity: 'Humidity',
    wind: 'Wind',
    rainToday: 'Rain today',
    pressure: 'Pressure',
    now: 'Now',
    windDirection: 'Wind',
    gusts: (value) => `gusts ${value}`,
    trend: 'Pressure trend',
    precipitation: 'Precipitation',
    lightning: 'Last lightning',
    noLightning: 'None recently',
    uv: 'UV index',
    observed: (ago) => `Observed ${ago}`,
    live: 'live feed',
    rest: 'Tempest API',
    forecastMissing: 'Forecast not available yet.',
  },
  fr: {
    notConfigured: "Saisissez votre jeton d'accès Tempest dans la configuration de l'intégration.",
    pickStation: 'Choisissez une station dans les réglages du widget.',
    unknownStation:
      "Cette station n'est plus dans Gladys : choisissez-en une autre dans les réglages.",
    waiting: 'En attente de la première observation de la station…',
    temperature: 'Température',
    humidity: 'Humidité',
    wind: 'Vent',
    rainToday: 'Pluie du jour',
    pressure: 'Pression',
    now: 'Maintenant',
    windDirection: 'Vent',
    gusts: (value) => `rafales ${value}`,
    trend: 'Tendance de la pression',
    precipitation: 'Précipitation',
    lightning: 'Dernier éclair',
    noLightning: 'Aucun récemment',
    uv: 'Indice UV',
    observed: (ago) => `Observé ${ago}`,
    live: 'flux en direct',
    rest: 'API Tempest',
    forecastMissing: 'Prévisions pas encore disponibles.',
  },
  de: {
    notConfigured: 'Gib deinen Tempest-Zugriffstoken in der Konfiguration der Integration ein.',
    pickStation: 'Wähle eine Station in den Einstellungen des Widgets.',
    unknownStation:
      'Diese Station ist nicht mehr in Gladys: Wähle in den Einstellungen eine andere.',
    waiting: 'Warte auf die erste Beobachtung der Station…',
    temperature: 'Temperatur',
    humidity: 'Feuchtigkeit',
    wind: 'Wind',
    rainToday: 'Regen heute',
    pressure: 'Luftdruck',
    now: 'Jetzt',
    windDirection: 'Wind',
    gusts: (value) => `Böen ${value}`,
    trend: 'Luftdrucktendenz',
    precipitation: 'Niederschlag',
    lightning: 'Letzter Blitz',
    noLightning: 'Keiner in letzter Zeit',
    uv: 'UV-Index',
    observed: (ago) => `Beobachtet ${ago}`,
    live: 'Live-Daten',
    rest: 'Tempest-API',
    forecastMissing: 'Vorhersage noch nicht verfügbar.',
  },
  es: {
    notConfigured:
      'Introduzca su token de acceso de Tempest en la configuración de la integración.',
    pickStation: 'Elija una estación en los ajustes del widget.',
    unknownStation: 'Esta estación ya no está en Gladys: elija otra en los ajustes.',
    waiting: 'Esperando la primera observación de la estación…',
    temperature: 'Temperatura',
    humidity: 'Humedad',
    wind: 'Viento',
    rainToday: 'Lluvia de hoy',
    pressure: 'Presión',
    now: 'Ahora',
    windDirection: 'Viento',
    gusts: (value) => `ráfagas ${value}`,
    trend: 'Tendencia de la presión',
    precipitation: 'Precipitación',
    lightning: 'Último rayo',
    noLightning: 'Ninguno recientemente',
    uv: 'Índice UV',
    observed: (ago) => `Observado ${ago}`,
    live: 'datos en directo',
    rest: 'API de Tempest',
    forecastMissing: 'Previsión aún no disponible.',
  },
};

// A strike older than this is not shown as "last lightning".
const LIGHTNING_RECENT_S = 3 * 60 * 60;

const textContent = (text) => ({
  ttl_seconds: CONTENT_TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text }],
});

function locale(language) {
  return LOCALES[language] ?? LOCALES.en;
}

function relativeTime(seconds, language) {
  const format = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) {
    return format.format(-Math.round(abs), 'second');
  }
  if (abs < 3600) {
    return format.format(-Math.round(abs / 60), 'minute');
  }
  if (abs < 86400) {
    return format.format(-Math.round(abs / 3600), 'hour');
  }
  return format.format(-Math.round(abs / 86400), 'day');
}

function temperature(celsius, units) {
  if (celsius === null || celsius === undefined) {
    return '–';
  }
  const value = units === 'us' ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

function speed(metresPerSecond, units) {
  return units === 'us'
    ? `${Math.round(metresPerSecond * 2.23694)} mph`
    : `${Math.round(metresPerSecond * 3.6)} km/h`;
}

function formatter(language, timeZone, options) {
  try {
    return new Intl.DateTimeFormat(locale(language), {
      ...options,
      timeZone: timeZone ?? undefined,
    });
  } catch {
    // An unknown time zone: the container's own (Gladys injects TZ).
    return new Intl.DateTimeFormat(locale(language), options);
  }
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The forecast list: the next days, or the next hours. */
function forecastList({ forecast, view, language, units, timeZone, nowSeconds }) {
  const conditions = pick(CONDITIONS, language);
  const percent = (value) => (value === null ? null : `${Math.round(value)} %`);
  if (view === 'hourly') {
    const hours = forecast.hours.filter((hour) => hour.time + 3600 > nowSeconds).slice(0, 8);
    if (hours.length === 0) {
      return null;
    }
    const time = formatter(language, timeZone, { hour: '2-digit', minute: '2-digit' });
    return {
      type: 'card-list',
      display: 'list',
      items: hours.map((hour) => ({
        title: time.format(new Date(hour.time * 1000)),
        subtitle: [
          conditions[hour.icon],
          temperature(hour.temperature, units),
          percent(hour.precipitationProbability),
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    };
  }
  const { upcoming } = forecastDays(forecast, nowSeconds);
  const days = upcoming.slice(0, 5);
  if (days.length === 0) {
    return null;
  }
  const weekday = formatter(language, timeZone, { weekday: 'long' });
  return {
    type: 'card-list',
    display: 'list',
    items: days.map((day) => ({
      title: capitalize(weekday.format(new Date((day.start + 12 * 3600) * 1000))),
      subtitle: [
        conditions[day.icon],
        `${temperature(day.temperatureMin, units)} / ${temperature(day.temperatureMax, units)}`,
        percent(day.precipitationProbability),
      ]
        .filter(Boolean)
        .join(' · '),
    })),
  };
}

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {object} input.gladys
 * @param {number} input.stationId
 * @param {{ reading: object|null, readingSource: string|null, forecast: object|null }} input.data
 * @param {string|null} input.timeZone station time zone
 * @param {string} input.view 'daily' | 'hourly'
 * @param {string} input.language
 * @param {string} input.units 'metric' | 'us'
 * @param {number} input.now ms
 */
export function buildStationContent({
  gladys,
  stationId,
  data,
  timeZone,
  view,
  language,
  units,
  now,
}) {
  const text = pick(TEXT, language);
  const { reading, forecast } = data;
  if (!reading && !forecast) {
    return textContent(text.waiting);
  }
  const nowSeconds = Math.floor(now / 1000);
  const ids = stationIds(gladys, stationId);
  const components = [
    {
      type: 'value',
      label: text.temperature,
      icon: 'thermometer',
      device_feature: ids.feature('temperature'),
    },
    {
      type: 'value',
      label: text.humidity,
      icon: 'droplet',
      device_feature: ids.feature('humidity'),
    },
    { type: 'value', label: text.wind, icon: 'wind', device_feature: ids.feature('wind_speed') },
    {
      type: 'value',
      label: text.rainToday,
      icon: 'umbrella',
      device_feature: ids.feature('rain_today'),
    },
    {
      type: 'value',
      label: text.pressure,
      icon: 'activity',
      device_feature: ids.feature('pressure_sea_level'),
    },
  ];

  const items = [];
  if (forecast?.current) {
    items.push({
      label: text.now,
      value: pick(CONDITIONS, language)[forecast.current.icon],
      icon: 'cloud',
    });
  }
  if (reading?.windAvg !== null && reading?.windAvg !== undefined) {
    const direction =
      reading.windDirection === null || reading.windDirection === undefined
        ? ''
        : `${compassPoint(reading.windDirection, language)} `;
    const gusts =
      reading.windGust === null || reading.windGust === undefined
        ? ''
        : `, ${text.gusts(speed(reading.windGust, units))}`;
    items.push({
      label: text.windDirection,
      value: `${direction}${speed(reading.windAvg, units)}${gusts}`,
      icon: 'navigation',
    });
  }
  const trend = reading?.pressureTrend ?? forecast?.current?.pressureTrend;
  if (trend && pick(PRESSURE_TRENDS, language)[trend]) {
    items.push({
      label: text.trend,
      value: pick(PRESSURE_TRENDS, language)[trend],
      icon: trend === 'rising' ? 'trending-up' : trend === 'falling' ? 'trending-down' : 'minus',
    });
  }
  if (reading?.precipitationType !== null && reading?.precipitationType !== undefined) {
    items.push({
      label: text.precipitation,
      value: pick(PRECIPITATION_TYPES_TEXT, language)[reading.precipitationType],
      icon: 'umbrella',
      color: reading.precipitationType > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  const strikeEpoch = reading?.strikeLastEpoch ?? forecast?.current?.lightningLastEpoch ?? null;
  const strikeDistance =
    reading?.strikeLastDistance ?? forecast?.current?.lightningLastDistance ?? null;
  if (
    strikeEpoch !== null &&
    strikeDistance !== null &&
    nowSeconds - strikeEpoch < LIGHTNING_RECENT_S
  ) {
    items.push({
      label: text.lightning,
      value: `${Math.round(units === 'us' ? strikeDistance * 0.621371 : strikeDistance)} ${units === 'us' ? 'mi' : 'km'}, ${relativeTime(nowSeconds - strikeEpoch, language)}`,
      icon: 'zap',
      color: strikeDistance <= 10 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
    });
  } else if (reading) {
    items.push({
      label: text.lightning,
      value: text.noLightning,
      icon: 'zap',
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  if (reading?.uv !== null && reading?.uv !== undefined) {
    items.push({ label: text.uv, value: Math.round(reading.uv * 10) / 10, icon: 'sun' });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }

  const list = forecast
    ? forecastList({ forecast, view, language, units, timeZone, nowSeconds })
    : null;
  components.push(list ?? { type: 'text', variant: 'caption', text: text.forecastMissing });

  if (reading) {
    const source = data.readingSource === 'ws' ? text.live : text.rest;
    components.push({
      type: 'text',
      variant: 'caption',
      text: `${text.observed(relativeTime(nowSeconds - reading.time, language))} · ${source}`,
    });
  }
  return { ttl_seconds: CONTENT_TTL_SECONDS, components };
}

/**
 * The onWidgetGet handler of the station widget.
 * @param {object} hub TempestHub
 * @param {{ settings?: object, language?: string, units?: string }} request
 */
export async function getStationWidget(
  hub,
  { settings = {}, language = 'en', units = 'metric' } = {},
) {
  const text = pick(TEXT, language);
  if (!hub.client) {
    return textContent(text.notConfigured);
  }
  if (!settings.device) {
    return textContent(text.pickStation);
  }
  const stationId = stationIdOf(hub.gladys, settings.device);
  if (stationId === null || !hub.addedStationIds().includes(stationId)) {
    return textContent(text.unknownStation);
  }
  // The forecast may not be there yet (a widget mounted right after a
  // restart): read it now, the widget shows the observation anyway.
  try {
    await hub.forecastOf(stationId);
    hub.issues.ok('widget', 'Station widget: forecast available again');
  } catch (err) {
    hub.issues.fail('widget', `Station widget: forecast unavailable (${err.message})`);
  }
  const data = hub.dataOf(stationId);
  const station = hub.stations?.get(stationId);
  return buildStationContent({
    gladys: hub.gladys,
    stationId,
    data,
    timeZone: station?.timezone ?? data.forecast?.timezone ?? null,
    view: FORECAST_VIEWS.includes(settings.forecast) ? settings.forecast : 'daily',
    language,
    units,
    now: hub.now(),
  });
}
