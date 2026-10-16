# Tempest for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
**WeatherFlow Tempest** weather stations, through the official Tempest cloud
API (personal access token, WebSocket live feed, REST fallback).

> **Developed without the hardware: feedback welcome.** The integration
> follows the official Tempest API documentation and real API answers
> published by other projects (see Credits), but it has not been run against a
> real station or account yet. Please open an issue with what you see.

## Features

- **One device per station** of your Tempest account: temperature, feels like,
  dew point, humidity, station and sea-level pressure, average wind, gusts,
  direction, instant wind every 3 seconds, rain intensity, rain today,
  "raining", precipitation type, lightning count (last hour) and last strike
  distance, UV index, solar radiation, illuminance, battery voltage.
- **Station forecast** (`better_forecast`): conditions, minimum, maximum and
  chance of rain for today and tomorrow as features, the next days and hours
  in the widget.
- **Real time**: one WebSocket connection for the account (`listen_start`,
  `listen_rapid_start`), with reconnection and a silence watchdog; the REST
  observation takes over while the feed is down.
- **Scene triggers**: "it starts raining" (once per rain episode, from the
  station's rain-start event) and "lightning nearby" (within 5 to 40 km, once
  per storm and distance).
- **Scene action**: "forecast summary", a ready-made sentence plus its numbers.
- **Dashboard widget**: live tiles, status list (wind, pressure trend, last
  lightning, UV) and the forecast of the next days or hours.
- Four languages: English, French, German, Spanish. Read-only: nothing is ever
  written to the Tempest account.

## Requirements

- Gladys 5.1.0 or later.
- A Tempest station (`ST` device). The older AIR and SKY sensors are not
  supported.
- A Tempest **personal access token**: tempestwx.com → Settings → Data
  Authorizations → Create Token.
- Internet access from Gladys. The Tempest local UDP broadcast cannot reach
  the integration container (bridge network, no broadcast), so this
  integration is cloud only.

## Installation

In Gladys: **Integrations → Install from GitHub**, with this repository's URL
(or from the store once published). Then paste the token in the Configuration
tab, click **List my stations**, and add the station from the Discovery tab.
The user documentation is in [`docs/`](docs/en.md) (English, French, German,
Spanish).

## Limitations

- Developed without the hardware or an account (see above).
- Cloud only; no local UDP data.
- Tempest stations only (no AIR/SKY).
- Feature names are frozen when the station is added in Gladys.
- Scene filters only test equality: the lightning trigger offers fixed
  distances (5, 10, 15, 20, 30, 40 km).
- Tempest data is for the station owner's personal use (Tempest remote data
  access policy). The API asks to stay under 100 REST requests per minute per
  user; this integration makes about 3 per minute per station at most, and
  none for observations while the live feed works.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js);
the WebSocket client is the one built into Node.

```bash
npm install
npm test              # node --test, on the SDK's fake Gladys and a fake Tempest cloud
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
npm run probe         # probes the REAL Tempest API, read-only (see below)
```

```
index.js                  SDK wiring (src/app.js registers the handlers)
src/app.js                handlers: discovery, poll fallback, action, scene action, widget
src/hub.js                stations, live feed messages, REST fallback, states, scene events
src/poller.js             the container's own refresh timer (Gladys#3198)
src/devices.js            station -> Gladys device, features and states
src/triggers.js           rain episodes and lightning thresholds
src/scenes.js             "forecast summary" scene action
src/widgets.js            "Tempest station" dashboard widget
src/i18n.js               every text, in en/fr/de/es
src/tempest/client.js     REST client (token in the query, never logged)
src/tempest/socket.js     WebSocket feed with reconnection and watchdog
src/tempest/model.js      payloads -> readings, forecast, sea-level pressure
scripts/probe.mjs         read-only probe of the real API
test/                     node --test; fixtures in test/fixtures/tempest/
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

`scripts/probe.mjs` runs the real clients against the Tempest cloud: without a
token, it shows how a made-up token is refused (REST status, WebSocket close);
with `TEMPEST_TOKEN=…`, the shape of the answers. It never prints the token, a
URL, a location, a name or a serial number.

To run the integration outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="tempest" \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. A hand-pushed `vX.Y.Z` tag also builds the image and the
GitHub Release, but then `version` in `package.json` and in the manifest (with
the `docker_image` tag) must be bumped and committed before tagging. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [weatherflow4py](https://github.com/jeeftor/weatherflow4py) by Jeff Stein
  (MIT): the API client the Home Assistant integration uses; its test fixtures
  (forecast, WebSocket messages) are the base of `test/fixtures/tempest/`
  (anonymized).
- Home Assistant's
  [`weatherflow_cloud`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/weatherflow_cloud)
  integration (Apache-2.0): the sensors offered, the forecast icon mapping,
  the station and observation fixtures (anonymized). Its local
  [`weatherflow`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/weatherflow)
  integration listens to the UDP broadcast, not reachable here.
- The [Tempest API documentation](https://weatherflow.github.io/Tempest/api/)
  by WeatherFlow-Tempest: message layouts, derived-metric formulas, data
  access policy.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by
WeatherFlow-Tempest, Inc. "Tempest" and "WeatherFlow" are the names of their
owners' products. Data shown comes from WeatherFlow-Tempest.

## License

[Apache-2.0](LICENSE)
