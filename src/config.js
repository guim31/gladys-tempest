// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with blanks, strings or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  token: '',
  language: 'fr',
  rapid_wind: true,
};

/**
 * @param {object} [raw] the values received from Gladys
 * @returns {{ token: string, language: string, rapid_wind: boolean }}
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  // A personal access token is a UUID: users paste it with spaces or quotes
  // around it, never inside it.
  const token = typeof source.token === 'string' ? source.token.trim().replace(/^"|"$/g, '') : '';
  const language = LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language;
  const rapidWind =
    typeof source.rapid_wind === 'boolean'
      ? source.rapid_wind
      : source.rapid_wind === 'false'
        ? false
        : source.rapid_wind === 'true'
          ? true
          : DEFAULT_CONFIG.rapid_wind;
  return { token, language, rapid_wind: rapidWind };
}

/** @param {{ token: string }} config */
export const isConfigured = (config) => config.token !== '';
