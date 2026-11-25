# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Hoymiles micro-inverters through AhoyDTU 0.8, on the local network: one
  device per inverter with AC power, production today, lifetime production,
  grid voltage, temperature, reachability, a state text, and the power and
  day production of each panel.
- Night-aware reachability: an inverter asleep at night is not a fault.
- Scene triggers "Hoymiles inverter not answering" (by day only) and
  "Hoymiles production started" (first production of the day).
- A temporary power limit (2 to 100 %), as an action and a scene action,
  behind an option that is off by default; works with the AhoyDTU admin
  password.
- The "AhoyDTU" dashboard widget: production now and today, 24-hour chart,
  state of each inverter.
- Documentation in English, French, German and Spanish.
