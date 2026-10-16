// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish says "usted" (house rule, enforced by
// test/i18n.test.js). Vocabulary follows the Gladys front translations.
//
// An integration of type "device" does not receive the user's language: the
// feature names, the scene action outputs and the status messages follow the
// `language` field of the configuration (French by default). Widgets get the
// viewer's language with every request.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Pick the text of a language, English as the fallback. */
export function pick(texts, language) {
  return texts[LANGUAGES.includes(language) ? language : 'en'] ?? texts.en;
}

// Feature names, by feature key (src/devices.js). Frozen at device creation
// in Gladys: changing one only affects stations added afterwards.
export const FEATURE_NAMES = {
  en: {
    temperature: 'Temperature',
    feels_like: 'Feels like',
    dew_point: 'Dew point',
    humidity: 'Humidity',
    pressure_station: 'Station pressure',
    pressure_sea_level: 'Sea-level pressure',
    wind_speed: 'Average wind',
    wind_gust: 'Wind gusts',
    wind_direction: 'Wind direction',
    wind_rapid: 'Instant wind (3 s)',
    rain_rate: 'Rain intensity',
    rain_today: 'Rain today',
    raining: 'Raining',
    precipitation_type: 'Precipitation type',
    lightning_count: 'Lightning strikes (last hour)',
    lightning_distance: 'Last lightning distance',
    uv: 'UV index',
    solar_radiation: 'Solar radiation (W/m²)',
    illuminance: 'Illuminance',
    battery_voltage: 'Battery voltage',
    forecast_today_condition: 'Forecast today',
    forecast_today_min: 'Minimum today',
    forecast_today_max: 'Maximum today',
    forecast_today_precipitation: 'Chance of rain today',
    forecast_tomorrow_condition: 'Forecast tomorrow',
    forecast_tomorrow_min: 'Minimum tomorrow',
    forecast_tomorrow_max: 'Maximum tomorrow',
    forecast_tomorrow_precipitation: 'Chance of rain tomorrow',
  },
  fr: {
    temperature: 'Température',
    feels_like: 'Ressenti',
    dew_point: 'Point de rosée',
    humidity: 'Humidité',
    pressure_station: 'Pression (station)',
    pressure_sea_level: 'Pression (niveau de la mer)',
    wind_speed: 'Vent moyen',
    wind_gust: 'Rafales',
    wind_direction: 'Direction du vent',
    wind_rapid: 'Vent instantané (3 s)',
    rain_rate: 'Intensité de pluie',
    rain_today: 'Pluie du jour',
    raining: 'Il pleut',
    precipitation_type: 'Type de précipitation',
    lightning_count: 'Éclairs (dernière heure)',
    lightning_distance: 'Distance du dernier éclair',
    uv: 'Indice UV',
    solar_radiation: 'Rayonnement solaire (W/m²)',
    illuminance: 'Luminosité',
    battery_voltage: 'Tension de la batterie',
    forecast_today_condition: "Prévision aujourd'hui",
    forecast_today_min: "Minimum aujourd'hui",
    forecast_today_max: "Maximum aujourd'hui",
    forecast_today_precipitation: "Risque de pluie aujourd'hui",
    forecast_tomorrow_condition: 'Prévision demain',
    forecast_tomorrow_min: 'Minimum demain',
    forecast_tomorrow_max: 'Maximum demain',
    forecast_tomorrow_precipitation: 'Risque de pluie demain',
  },
  de: {
    temperature: 'Temperatur',
    feels_like: 'Gefühlte Temperatur',
    dew_point: 'Taupunkt',
    humidity: 'Luftfeuchtigkeit',
    pressure_station: 'Luftdruck (Station)',
    pressure_sea_level: 'Luftdruck (Meereshöhe)',
    wind_speed: 'Mittlerer Wind',
    wind_gust: 'Windböen',
    wind_direction: 'Windrichtung',
    wind_rapid: 'Momentanwind (3 s)',
    rain_rate: 'Regenintensität',
    rain_today: 'Regen heute',
    raining: 'Es regnet',
    precipitation_type: 'Niederschlagsart',
    lightning_count: 'Blitze (letzte Stunde)',
    lightning_distance: 'Entfernung des letzten Blitzes',
    uv: 'UV-Index',
    solar_radiation: 'Sonneneinstrahlung (W/m²)',
    illuminance: 'Helligkeit',
    battery_voltage: 'Batteriespannung',
    forecast_today_condition: 'Vorhersage heute',
    forecast_today_min: 'Tiefstwert heute',
    forecast_today_max: 'Höchstwert heute',
    forecast_today_precipitation: 'Regenwahrscheinlichkeit heute',
    forecast_tomorrow_condition: 'Vorhersage morgen',
    forecast_tomorrow_min: 'Tiefstwert morgen',
    forecast_tomorrow_max: 'Höchstwert morgen',
    forecast_tomorrow_precipitation: 'Regenwahrscheinlichkeit morgen',
  },
  es: {
    temperature: 'Temperatura',
    feels_like: 'Sensación térmica',
    dew_point: 'Punto de rocío',
    humidity: 'Humedad',
    pressure_station: 'Presión (estación)',
    pressure_sea_level: 'Presión (nivel del mar)',
    wind_speed: 'Viento medio',
    wind_gust: 'Ráfagas',
    wind_direction: 'Dirección del viento',
    wind_rapid: 'Viento instantáneo (3 s)',
    rain_rate: 'Intensidad de lluvia',
    rain_today: 'Lluvia de hoy',
    raining: 'Está lloviendo',
    precipitation_type: 'Tipo de precipitación',
    lightning_count: 'Rayos (última hora)',
    lightning_distance: 'Distancia del último rayo',
    uv: 'Índice UV',
    solar_radiation: 'Radiación solar (W/m²)',
    illuminance: 'Luminosidad',
    battery_voltage: 'Tensión de la batería',
    forecast_today_condition: 'Previsión de hoy',
    forecast_today_min: 'Mínima de hoy',
    forecast_today_max: 'Máxima de hoy',
    forecast_today_precipitation: 'Probabilidad de lluvia hoy',
    forecast_tomorrow_condition: 'Previsión de mañana',
    forecast_tomorrow_min: 'Mínima de mañana',
    forecast_tomorrow_max: 'Máxima de mañana',
    forecast_tomorrow_precipitation: 'Probabilidad de lluvia mañana',
  },
};

// The forecast icons of the API, as words.
export const CONDITIONS = {
  en: {
    'clear-day': 'Clear',
    'clear-night': 'Clear night',
    cloudy: 'Cloudy',
    foggy: 'Fog',
    'partly-cloudy-day': 'Partly cloudy',
    'partly-cloudy-night': 'Partly cloudy',
    'possibly-rainy-day': 'Rain possible',
    'possibly-rainy-night': 'Rain possible',
    'possibly-sleet-day': 'Sleet possible',
    'possibly-sleet-night': 'Sleet possible',
    'possibly-snow-day': 'Snow possible',
    'possibly-snow-night': 'Snow possible',
    'possibly-thunderstorm-day': 'Thunderstorms possible',
    'possibly-thunderstorm-night': 'Thunderstorms possible',
    rainy: 'Rain',
    sleet: 'Sleet',
    snow: 'Snow',
    thunderstorm: 'Thunderstorms',
    windy: 'Windy',
    unknown: 'Unknown',
  },
  fr: {
    'clear-day': 'Dégagé',
    'clear-night': 'Nuit claire',
    cloudy: 'Nuageux',
    foggy: 'Brouillard',
    'partly-cloudy-day': 'Partiellement nuageux',
    'partly-cloudy-night': 'Partiellement nuageux',
    'possibly-rainy-day': 'Pluie possible',
    'possibly-rainy-night': 'Pluie possible',
    'possibly-sleet-day': 'Pluie et neige possibles',
    'possibly-sleet-night': 'Pluie et neige possibles',
    'possibly-snow-day': 'Neige possible',
    'possibly-snow-night': 'Neige possible',
    'possibly-thunderstorm-day': 'Orages possibles',
    'possibly-thunderstorm-night': 'Orages possibles',
    rainy: 'Pluie',
    sleet: 'Pluie et neige',
    snow: 'Neige',
    thunderstorm: 'Orages',
    windy: 'Venteux',
    unknown: 'Inconnu',
  },
  de: {
    'clear-day': 'Klar',
    'clear-night': 'Klare Nacht',
    cloudy: 'Bewölkt',
    foggy: 'Nebel',
    'partly-cloudy-day': 'Teilweise bewölkt',
    'partly-cloudy-night': 'Teilweise bewölkt',
    'possibly-rainy-day': 'Regen möglich',
    'possibly-rainy-night': 'Regen möglich',
    'possibly-sleet-day': 'Schneeregen möglich',
    'possibly-sleet-night': 'Schneeregen möglich',
    'possibly-snow-day': 'Schnee möglich',
    'possibly-snow-night': 'Schnee möglich',
    'possibly-thunderstorm-day': 'Gewitter möglich',
    'possibly-thunderstorm-night': 'Gewitter möglich',
    rainy: 'Regen',
    sleet: 'Schneeregen',
    snow: 'Schnee',
    thunderstorm: 'Gewitter',
    windy: 'Windig',
    unknown: 'Unbekannt',
  },
  es: {
    'clear-day': 'Despejado',
    'clear-night': 'Noche despejada',
    cloudy: 'Nublado',
    foggy: 'Niebla',
    'partly-cloudy-day': 'Parcialmente nublado',
    'partly-cloudy-night': 'Parcialmente nublado',
    'possibly-rainy-day': 'Posible lluvia',
    'possibly-rainy-night': 'Posible lluvia',
    'possibly-sleet-day': 'Posible aguanieve',
    'possibly-sleet-night': 'Posible aguanieve',
    'possibly-snow-day': 'Posible nieve',
    'possibly-snow-night': 'Posible nieve',
    'possibly-thunderstorm-day': 'Posibles tormentas',
    'possibly-thunderstorm-night': 'Posibles tormentas',
    rainy: 'Lluvia',
    sleet: 'Aguanieve',
    snow: 'Nieve',
    thunderstorm: 'Tormentas',
    windy: 'Ventoso',
    unknown: 'Desconocido',
  },
};

// Precipitation type of the station, by its code (0 to 3).
export const PRECIPITATION_TYPES_TEXT = {
  en: ['No precipitation', 'Rain', 'Hail', 'Rain and hail'],
  fr: ['Aucune précipitation', 'Pluie', 'Grêle', 'Pluie et grêle'],
  de: ['Kein Niederschlag', 'Regen', 'Hagel', 'Regen und Hagel'],
  es: ['Sin precipitación', 'Lluvia', 'Granizo', 'Lluvia y granizo'],
};

export const PRESSURE_TRENDS = {
  en: { rising: 'Rising', falling: 'Falling', steady: 'Steady' },
  fr: { rising: 'En hausse', falling: 'En baisse', steady: 'Stable' },
  de: { rising: 'Steigend', falling: 'Fallend', steady: 'Gleichbleibend' },
  es: { rising: 'En aumento', falling: 'En descenso', steady: 'Estable' },
};

// Eight-point compass, from north clockwise.
export const COMPASS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
  es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
};

/** @param {number} degrees */
export function compassPoint(degrees, language) {
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return pick(COMPASS, language)[index];
}

// Configuration screen: connection status and action results.
export const MESSAGES = {
  notConfigured: {
    en: 'Enter your Tempest personal access token in the configuration.',
    fr: "Saisissez votre jeton d'accès personnel Tempest dans la configuration.",
    de: 'Gib deinen persönlichen Tempest-Zugriffstoken in der Konfiguration ein.',
    es: 'Introduzca su token de acceso personal de Tempest en la configuración.',
  },
  tokenRefused: {
    en: 'The Tempest access token was refused: create a new one on tempestwx.com.',
    fr: "Le jeton d'accès Tempest a été refusé : créez-en un nouveau sur tempestwx.com.",
    de: 'Der Tempest-Zugriffstoken wurde abgelehnt: Erstelle einen neuen auf tempestwx.com.',
    es: 'El token de acceso de Tempest ha sido rechazado: cree uno nuevo en tempestwx.com.',
  },
  unreachable: {
    en: 'The Tempest service is unreachable for now: the integration keeps trying.',
    fr: "Le service Tempest est injoignable pour l'instant : l'intégration réessaie.",
    de: 'Der Tempest-Dienst ist gerade nicht erreichbar: Die Integration versucht es weiter.',
    es: 'El servicio Tempest no está disponible por ahora: la integración sigue intentándolo.',
  },
  noStation: {
    en: 'No Tempest station on this account.',
    fr: 'Aucune station Tempest sur ce compte.',
    de: 'Keine Tempest-Station in diesem Konto.',
    es: 'No hay ninguna estación Tempest en esta cuenta.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  publishFailed: {
    en: 'Gladys refused the stations: check the integration logs.',
    fr: "Gladys a refusé les stations : consultez les journaux de l'intégration.",
    de: 'Gladys hat die Stationen abgelehnt: Sieh dir die Protokolle der Integration an.',
    es: 'Gladys ha rechazado las estaciones: consulte los registros de la integración.',
  },
};

// The "List my stations" report, one table per language.
export const STATION_LIST_TEXT = {
  en: {
    count: (n) => `${n} station(s) on this account:`,
    tempest: (serial) => `Tempest ${serial}`,
    noTempest: 'no Tempest device, not supported',
    next: 'Add them from the Discovery tab of the integration.',
  },
  fr: {
    count: (n) => `${n} station(s) sur ce compte :`,
    tempest: (serial) => `Tempest ${serial}`,
    noTempest: 'pas de capteur Tempest, non prise en charge',
    next: "Ajoutez-les depuis l'onglet Découverte de l'intégration.",
  },
  de: {
    count: (n) => `${n} Station(en) in diesem Konto:`,
    tempest: (serial) => `Tempest ${serial}`,
    noTempest: 'kein Tempest-Gerät, nicht unterstützt',
    next: 'Füge sie über den Tab „Erkennung“ der Integration hinzu.',
  },
  es: {
    count: (n) => `${n} estación(es) en esta cuenta:`,
    tempest: (serial) => `Tempest ${serial}`,
    noTempest: 'sin dispositivo Tempest, no compatible',
    next: 'Añádalas desde la pestaña Descubrimiento de la integración.',
  },
};

/**
 * The "List my stations" report, in the four languages.
 * @param {Array<{ id: number, name: string, serial: string|null, deviceId: number|null }>} stations
 */
export function stationListMessage(stations) {
  const message = {};
  for (const language of LANGUAGES) {
    if (stations.length === 0) {
      message[language] = MESSAGES.noStation[language];
      continue;
    }
    const text = STATION_LIST_TEXT[language];
    const lines = stations.map((station) => {
      const detail = station.deviceId
        ? text.tempest(station.serial ?? station.deviceId)
        : text.noTempest;
      return `${station.name} (#${station.id}, ${detail})`;
    });
    message[language] = `${text.count(stations.length)} ${lines.join(' ; ')}. ${text.next}`;
  }
  return message;
}

// The forecast sentence of the "Forecast summary" scene action.
export const SUMMARY_TEXT = {
  en: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    range: (min, max) => `${min} to ${max} °C`,
    rain: (p) => `${p} % chance of rain`,
  },
  fr: {
    today: "Aujourd'hui",
    tomorrow: 'Demain',
    range: (min, max) => `de ${min} à ${max} °C`,
    rain: (p) => `${p} % de risque de pluie`,
  },
  de: {
    today: 'Heute',
    tomorrow: 'Morgen',
    range: (min, max) => `${min} bis ${max} °C`,
    rain: (p) => `${p} % Regenwahrscheinlichkeit`,
  },
  es: {
    today: 'Hoy',
    tomorrow: 'Mañana',
    range: (min, max) => `de ${min} a ${max} °C`,
    rain: (p) => `${p} % de probabilidad de lluvia`,
  },
};

/**
 * "Today: Partly cloudy, 4 to 12 °C, 20 % chance of rain."
 * @param {{ icon: string, temperatureMin: number|null, temperatureMax: number|null, precipitationProbability: number|null }} day
 * @param {'today'|'tomorrow'} which
 */
export function forecastSentence(day, which, language) {
  const text = pick(SUMMARY_TEXT, language);
  const parts = [pick(CONDITIONS, language)[day.icon] ?? pick(CONDITIONS, language).unknown];
  if (day.temperatureMin !== null && day.temperatureMax !== null) {
    parts.push(text.range(Math.round(day.temperatureMin), Math.round(day.temperatureMax)));
  }
  if (day.precipitationProbability !== null) {
    parts.push(text.rain(Math.round(day.precipitationProbability)));
  }
  // Only French puts a space before the colon.
  const colon = language === 'fr' ? ' :' : ':';
  return `${text[which]}${colon} ${parts.join(', ')}.`;
}
