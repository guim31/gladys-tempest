# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the Tempest personal access token, stored by Gladys in the
  integration configuration. The integration sends it only to the Tempest
  cloud (`swd.weatherflow.com` over HTTPS, `ws.weatherflow.com` over WSS), in
  the query string as the API requires. It never writes it to `/data` nor to
  the logs; the URLs that carry it are never logged.
- **`/data`**: nothing is stored there. Everything is read again from the
  Tempest cloud after a restart.
- **Network**: outgoing HTTPS and WSS to the Tempest cloud only. No port is
  opened, no local network access is needed.
- **Writes**: none. The integration only reads the Tempest account; the Gladys
  devices it creates are read-only.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the Tempest cloud and stations (report those to WeatherFlow-Tempest).
