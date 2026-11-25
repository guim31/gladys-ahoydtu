# AhoyDTU

Follow your **Hoymiles micro-inverters** in Gladys through
[AhoyDTU](https://github.com/lumapu/ahoy), the free firmware for ESP8266 and
ESP32 boards that talks to the inverters by radio. Everything stays on your
local network: no Hoymiles cloud, no account.

> **Developed without the hardware: feedback welcome.** This integration was
> built from the source code of AhoyDTU 0.8 and tested against a faithful
> simulation of its API, not against a real DTU. If something looks wrong,
> please say so on the Gladys forum or in a GitHub issue.

## Overview

- One Gladys device per inverter configured in AhoyDTU (HM, HMS, HMT series).
- Live AC power, production of the day, total production, grid voltage and
  temperature, plus the power and the production of the day of each panel.
- A "Reachable" feature and a "State" text that tell the night (the inverter
  sleeps, which is normal) from a real loss.
- Two scene triggers: an inverter that stops answering by day, and the first
  production of the day.
- A temporary power limit, as an action and as a scene action, **off by
  default**.
- An "AhoyDTU" dashboard widget.

Using OpenDTU instead of AhoyDTU? Install the **Hoymiles (OpenDTU)**
integration from the store instead: it reads the same inverters through
OpenDTU.

## Requirements

- An AhoyDTU running firmware **0.8** (tested against 0.8.155), on the same
  network as Gladys, with its inverters already set up (Settings > Inverter).
- Its IP address: shown on its display if it has one, in your router, or in
  the System page of AhoyDTU. A fixed address (DHCP reservation) is
  recommended.
- Gladys 5.1 or later.

For the night detection to be exact, set the coordinates of your installation
in AhoyDTU (Settings > Sunrise & Sunset): AhoyDTU then gives the sunrise and
sunset times. Without them, the integration still works and relies on how the
inverter went silent (see "Night and day").

## Configuration

- **IP address**: the address of your AhoyDTU, e.g. `192.168.1.50`. A host
  name works too.
- **Admin password**: only if AhoyDTU has one (System > Protection) and you
  want to use the power limit. Reading the values needs no password.
- **Refresh interval**: 10, 15 (default), 30 or 60 seconds. AhoyDTU itself
  asks the inverters every 15 seconds by default: reading it faster gives
  nothing more.
- **Allow the power limit**: off by default. As long as it is off, nothing is
  ever sent to the inverters.
- **Language of the texts**: names given to new devices and features, state
  texts and action messages. French by default.

Then click **Test the connection**, open the **Discovery** tab and add your
inverters.

## Devices

Each inverter becomes a device named as in AhoyDTU (or "Inverter" and its
serial number when it has no name). Its features:

| Feature                    | Unit | Notes                                            |
| -------------------------- | ---- | ------------------------------------------------ |
| Power                      | W    | AC power fed to the house                        |
| Production today           | kWh  | back to 0 after midnight                         |
| Total production           | kWh  | lifetime index, never reset                      |
| Grid voltage               | V    |                                                  |
| Temperature                | °C   | of the inverter                                  |
| Reachable                  | 0/1  | 1 when the inverter answers the radio            |
| State                      | text | producing, awake, asleep (night), not answering… |
| Panel N power              | W    | one per DC input, with the panel name of AhoyDTU |
| Panel N production (today) | kWh  | one per DC input                                 |

Names are fixed when the device is created: rename them in Gladys if you
like.

## Night and day

A Hoymiles inverter is powered by its panels: at dusk it stops answering, and
AhoyDTU marks it unavailable five minutes later. The integration does not
treat that as a fault:

- an inverter whose power had already faded under 10 W before it went silent
  is **asleep**, whatever the time (winter, shade, panels facing east);
- with the sunrise and sunset times of AhoyDTU, an inverter lost at night or
  within 90 minutes of sunrise or sunset is asleep too;
- only an inverter cut off while producing, in full daylight, is **not
  answering**.

At night the power is 0 W, the State says "Asleep (night)" and the total
production keeps its value. The production of the day goes back to 0 after
midnight, even if the inverter is still asleep. At night, the integration
reads AhoyDTU once per interval, without asking for the values of the
sleeping inverters.

## Widget

The **AhoyDTU** widget shows the production now and today, a 24-hour chart
and the state of each inverter (with its power limit when one is set). With a
single inverter added to Gladys, the tiles follow its features live; with
several, they show the sums. The chart and the inverter lines can be hidden
in the widget settings.

## Scene triggers

- **Hoymiles inverter not answering**: an inverter stopped answering by day,
  or the AhoyDTU itself stopped answering (variable `cause`: `inverter` or
  `dtu`). Never at night. At most one event every 10 minutes per inverter.
- **Hoymiles production started**: an inverter produces for the first time of
  the day (the morning wake-up), once a day. Useful to start a washing
  machine on solar power.

Both can be limited to one inverter, and give its name (`inverter`) to the
scene. For "power above X W", use the standard device trigger on the Power
feature: it has the threshold and the duration.

## Power limit

Available as an integration action (**Set the power limit**) and as a scene
action, once **Allow the power limit** is on. Choose the inverter and a limit
from 2 to 100 % of its rated power; 100 % removes the limit.

The limit is sent **non-persistent**: it is not written to the inverter's
memory and is lost when the inverter restarts, which happens every morning.
It is meant for scenes (zero export when the price is negative, for
instance), not as a permanent setting. The integration refuses it as soon as
AhoyDTU says the inverter is not available (at night, for instance).

## Scene examples

- When "Hoymiles inverter not answering" fires with the cause `inverter`,
  send a message: a breaker may have tripped.
- When "Hoymiles production started", start the dishwasher.
- When the grid price becomes negative, set the power limit to 2 %; set it
  back to 100 % when the price is positive again.

## Troubleshooting

- **"AhoyDTU does not answer"**: check the address, that the board is powered
  and on the same network. The message gives the network error.
- **No device in Discovery**: the inverters must be set up in AhoyDTU
  (Settings > Inverter). Click **Test the connection**: it says how many
  inverters AhoyDTU has.
- **"Not answering" while it is dark**: set the coordinates in AhoyDTU so
  it knows the sun times, and tell us on the forum (with the power before the
  loss).
- **"AhoyDTU refused the password"** / **"protected by a password"**: enter
  the admin password of AhoyDTU in the configuration.
- **The limit is refused at night**: normal, the inverter is asleep.
- Set the log level to debug in Gladys to see every request.

## Limits

- Developed without the hardware, against a simulation of the AhoyDTU 0.8
  API: feedback welcome.
- AhoyDTU 0.7 and older are not tested. MQTT is not used: only the REST API.
- Only the relative, non-persistent limit is offered; no on/off, no restart,
  no persistent limit (they wear the inverter's memory).
- No frequency, current or efficiency features.
- The production values are those of the inverter: they can differ slightly
  from a meter's.

## Data and network

- The integration only talks to the address you entered, over plain HTTP (the
  only protocol of AhoyDTU), on your local network. Nothing leaves your home.
- It stores in its `/data` volume the list of inverters (serials, names,
  panel names), so they are known again after a restart. The password stays
  in the Gladys configuration and is never written in a log.
- Not affiliated with Hoymiles nor with the AhoyDTU project.
