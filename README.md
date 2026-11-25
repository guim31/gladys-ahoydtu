# AhoyDTU for Gladys Assistant

[Gladys Assistant](https://gladysassistant.com) external integration for
**Hoymiles micro-inverters** through [AhoyDTU](https://github.com/lumapu/ahoy)
(firmware 0.8 for ESP8266 / ESP32): live production, per-panel values, day
and lifetime energy, a night-aware reachability, scene triggers, a dashboard
widget and an optional power limit, all on the local network. **Unofficial,
not affiliated with Hoymiles nor with the AhoyDTU project.**

> **Developed without the hardware: feedback welcome.** The integration was
> written from the source code of AhoyDTU 0.8 (`src/web/RestApi.h`) and tested
> against a faithful simulation of its REST API, not against a real DTU.

Using **OpenDTU** instead? The
[gladys-hoymiles](https://github.com/LM1LC3N7/gladys-hoymiles) integration by
LM1LC3N7 reads the same inverters through OpenDTU.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## What it does

- **One device per inverter** configured in AhoyDTU (HM, HMS, HMT): AC power,
  production today, lifetime production (index), grid voltage, temperature,
  reachable (0/1), a state text, and the power and day production of each
  panel (named after the panel names of AhoyDTU).
- **The night is not a fault**: an inverter that goes silent after its power
  faded under 10 W, or near or after sunset (AhoyDTU's sun times), is asleep;
  one cut off while producing in full daylight is "not answering".
- **Scene triggers**: `inverter_unreachable` (by day only; cause `inverter`
  or `dtu`) and `production_started` (first production of the day).
- **Power limit** (action and scene action): relative, non-persistent,
  behind an option that is off by default.
- **Widget** "AhoyDTU": production now and today, 24-hour chart, one line per
  inverter.

## Requirements

- AhoyDTU 0.8 on the network of Gladys, with its inverters set up.
- Gladys 5.1 or later.

## Installation

In Gladys: **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-ahoydtu`. Then enter the IP address of the
AhoyDTU, click **Test the connection** and add the inverters from the
**Discovery** tab.

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (cycle, actions, widget)
                 ├─ src/ahoy/client.js   REST API: GET /api/..., POST /api/ctrl
                 ├─ src/ahoy/parse.js    JSON → plain objects (field order of /api/live)
                 ├─ src/ahoy/service.js  inventory (/api/inverter/list) + readings
                 ├─ src/presence.js      night or fault, scene events
                 ├─ src/devices.js       one device per inverter, its states
                 ├─ src/triggers.js      scene events → Gladys
                 └─ src/widgets.js       the "AhoyDTU" widget
```

- Every 15 s by default (10 to 60 s), the container reads `/api/index`, then
  `/api/inverter/id/<id>` for each reachable inverter: one request per cycle
  at night. `/api/inverter/list` and `/api/live` are read at the discovery
  and every 30 minutes.
- Only the changed states are published, with a 6-hour heartbeat.
- The limit is `POST /api/ctrl` `{ id, cmd: "limit_nonpersistent_relative",
val }`, with `auth` when a password is set (AhoyDTU unlocks and runs the
  command in the same request).

## Limits

- Not tested on real hardware; AhoyDTU 0.7 and older not tested.
- REST only, no MQTT. No on/off, no restart, no persistent limit.
- One AhoyDTU per integration.

## Development

Node.js 22 or later, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test                 # node --test, against the SDK's fake Gladys and a fake AhoyDTU
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store --skip-image-check .
```

`test/helpers/fakeAhoy.js` reproduces the REST API of AhoyDTU 0.8 (paths, JSON
keys, value order, password and token logic, refusal of a command to a
sleeping inverter); `dev/fake-ahoy-server.js` serves it over HTTP
(`AHOY_PORT`, `AHOY_PASSWORD`, `AHOY_SCENARIO=day|night`) for tests in
Docker. `test/gladys-rules.test.js` checks every device against the couples,
units and polling values the Gladys core accepts.

## Releasing

Releases are made from GitHub: describe the change under `## [Unreleased]` in
[`CHANGELOG.md`](CHANGELOG.md), then **Actions → Release → Run workflow**
(`patch`, `minor` or `major`). The workflow bumps the version in
`package.json` and in the manifest (`version` and `docker_image`), builds the
multi-arch image to `ghcr.io/guim31/gladys-ahoydtu`, tags and publishes the
GitHub Release.

## Credits

- [**AhoyDTU**](https://github.com/lumapu/ahoy) by lumapu and contributors
  (CC BY-NC-SA 4.0): the REST API this integration talks to. Its behavior was
  reproduced from `src/web/RestApi.h`, `src/web/Protection.h` and
  `src/hm/hmInverter.h` for the test simulation; no code was copied.
- [**gladys-hoymiles**](https://github.com/LM1LC3N7/gladys-hoymiles) by
  LM1LC3N7: the OpenDTU integration for the same inverters, a model for the
  night handling.
- The Hoymiles logo of the cover comes from hoymiles.com; Hoymiles is a
  trademark of Hoymiles Power Electronics. AhoyDTU has no logo of its own.

## License

[Apache-2.0](LICENSE)
