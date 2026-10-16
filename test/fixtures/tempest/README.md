# Tempest API fixtures

Real answers of the Tempest API, from the test suites of
[weatherflow4py](https://github.com/jeeftor/weatherflow4py) (MIT) and of the
Home Assistant
[`weatherflow_cloud`](https://github.com/home-assistant/core/tree/dev/tests/components/weatherflow_cloud)
integration (Apache-2.0), anonymized:

- `stations.json` — `GET /stations` (Home Assistant), with a second, made-up
  station that only has AIR and SKY sensors;
- `station_observation.json` — `GET /observations/station/{id}` (Home
  Assistant);
- `forecast.json` — `GET /better_forecast` (weatherflow4py), hourly forecast
  cut to 48 hours;
- `websocket.json` — WebSocket messages (weatherflow4py), plus the `obs_st`
  example of the official Tempest WebSocket reference (`obs_st_rain`);
- `unauthorized.json` — the API answer to a refused token (weatherflow4py).

Anonymization: station ids, device ids, serial numbers, station names and
coordinates are made up. The timestamps were moved so that every file describes
the same moment (the forecast's `current_conditions.time`), and lightning
strikes were moved 30 days back; every measured value is untouched.
