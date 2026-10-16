// -----------------------------------------------------------------------------
// Tempest REST API client (https://swd.weatherflow.com/swd/rest).
//
// The personal access token travels in the query string, as the API expects:
// a URL is therefore never logged nor put in an error message. Every error
// thrown here carries a short reason and, for an HTTP answer, its status.
//
// Quota: WeatherFlow asks to stay under 100 REST requests per minute per user
// (burst capacity aside). This integration makes, per added station, one
// forecast request every 30 minutes, and one observation request per minute
// only while the WebSocket feed is down.
// -----------------------------------------------------------------------------

export const REST_BASE_URL = 'https://swd.weatherflow.com/swd/rest';
export const REQUEST_TIMEOUT_MS = 15000;

/** An error of the Tempest API, safe to log (no URL, no token). */
export class TempestApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string }} [details]
   */
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'TempestApiError';
    this.status = status;
    // 'unauthorized' | 'not_found' | 'rate_limited' | 'http' | 'network' | 'timeout' | 'invalid'
    this.code = code;
  }

  get isAuthError() {
    return this.code === 'unauthorized';
  }
}

/**
 * @param {object} options
 * @param {string} options.token personal access token
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs]
 */
export function createTempestClient({
  token,
  fetch = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  async function get(path, query = {}) {
    const url = new URL(`${REST_BASE_URL}/${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
    url.searchParams.set('token', token);

    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new TempestApiError('the Tempest API did not answer in time', { code: 'timeout' });
      }
      // The cause of a fetch failure (DNS, TLS, refused) says what went wrong,
      // never the URL.
      const reason = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'network error';
      throw new TempestApiError(`the Tempest API is unreachable (${reason})`, { code: 'network' });
    }

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    // The API also reports errors inside a 200 or 4xx body:
    // { status: { status_code: 401, status_message: 'UNAUTHORIZED' } }.
    const apiStatus = body?.status?.status_code;
    if (response.status === 401 || response.status === 403 || apiStatus === 401) {
      throw new TempestApiError('the access token was refused', {
        status: response.status,
        code: 'unauthorized',
      });
    }
    if (response.status === 404) {
      throw new TempestApiError('not found on the Tempest API', { status: 404, code: 'not_found' });
    }
    if (response.status === 429) {
      throw new TempestApiError('too many requests to the Tempest API', {
        status: 429,
        code: 'rate_limited',
      });
    }
    if (!response.ok) {
      throw new TempestApiError(`the Tempest API answered HTTP ${response.status}`, {
        status: response.status,
        code: 'http',
      });
    }
    if (!body || typeof body !== 'object') {
      throw new TempestApiError('the Tempest API sent an unreadable answer', { code: 'invalid' });
    }
    if (apiStatus !== undefined && apiStatus !== 0) {
      const message = String(body.status?.status_message ?? '').slice(0, 80);
      throw new TempestApiError(`the Tempest API reported an error (${apiStatus} ${message})`, {
        status: response.status,
        code: 'invalid',
      });
    }
    return body;
  }

  return {
    /** The stations of the account, with their devices. */
    getStations: () => get('stations'),
    /** @param {number} stationId */
    getStationObservation: (stationId) => get(`observations/station/${stationId}`),
    /**
     * Forecast of a station, in metric units whatever the user's display
     * preferences in the Tempest app.
     * @param {number} stationId
     */
    getForecast: (stationId) =>
      get('better_forecast', {
        station_id: stationId,
        units_temp: 'c',
        units_wind: 'mps',
        units_pressure: 'mb',
        units_precip: 'mm',
        units_distance: 'km',
      }),
  };
}
