# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- WeatherFlow Tempest stations in Gladys, through the Tempest cloud with a
  personal access token: one device per station of the account.
- Temperature, feels like, dew point, humidity, station and sea-level
  pressure, average wind, gusts, direction, instant wind every 3 seconds, rain
  intensity, rain today, raining, precipitation type, lightning count and last
  strike distance, UV index, solar radiation, illuminance, battery voltage.
- Today's and tomorrow's forecast of the station: conditions, minimum,
  maximum, chance of rain.
- Real time through the Tempest live feed, with the REST API as a fallback.
- "List my stations" button in the Configuration screen, to check the token.
- Scene triggers "it starts raining" and "lightning nearby" (5 to 40 km).
- Scene action "forecast summary": a ready-made forecast sentence and its
  values.
- "Tempest station" dashboard widget: live values, wind, pressure trend, last
  lightning and the forecast of the next days or hours.
- English, French, German and Spanish, for the feature names, texts and
  documentation.
