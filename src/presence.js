// -----------------------------------------------------------------------------
// Where each inverter stands, cycle after cycle: producing, awake, asleep for
// the night, or not answering when it should — and what changed.
//
// The night is not a fault. A Hoymiles inverter is powered by its panels: at
// dusk it stops answering the radio, and Ahoy marks it "not available" five
// minutes later. An inverter that stops answering is said asleep when:
// - Ahoy knows the sun times (coordinates set in its settings) and the sun is
//   down; or, without sun times,
// - its power had already fallen to 0 W before it went silent (a graceful
//   dusk), unlike an inverter cut off while producing.
// Otherwise it is "not answering", and the `inverter_unreachable` scene event
// fires — at most once per loss. An AhoyDTU that stops answering by day makes
// every inverter that was reachable fire it, with the cause "dtu".
//
// `production_started` fires when an inverter starts producing after a period
// without production, once per day (the morning wake-up, not every cloud).
// Nothing fires on the first reading after a start: nothing has changed yet.
// -----------------------------------------------------------------------------

/**
 * Is the sun up? Ahoy gives today's sunrise and sunset; only their time of
 * day is used, so yesterday's still answer when the DTU is down.
 * @returns {boolean|null} null when unknown (no coordinates in Ahoy)
 */
export function isDaylight(now, sunrise, sunset) {
  if (!sunrise || !sunset) {
    return null;
  }
  const DAY = 24 * 60 * 60 * 1000;
  const tod = (ms) => ((ms % DAY) + DAY) % DAY;
  const [t, rise, set] = [tod(now), tod(sunrise), tod(sunset)];
  // Sunrise and sunset can straddle midnight UTC (east of UTC+12, west of...).
  return rise <= set ? t >= rise && t <= set : t >= rise || t <= set;
}

/** The calendar day of an instant in a time zone, e.g. "2026-06-21". */
export function dayKey(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/**
 * @param {{ timeZone?: string }} [options]
 */
export function createPresence({ timeZone } = {}) {
  const memory = new Map(); // serial → { lastPower, lostWhileProducing, status, reachable, producing, lastDay, startedDay }
  let sun = { sunrise: null, sunset: null };

  return {
    /**
     * @param {{ inverters: object[] }} inventory
     * @param {object|null} snapshot null: the DTU did not answer
     * @param {number} now
     * @returns {{ entries: Map<string, object>, events: object[] }}
     *   entries: serial → { status, reachable, producing, reading, resetToday }
     *   events: { kind: 'unreachable'|'started', serial, cause?, power? }
     */
    update(inventory, snapshot, now) {
      if (snapshot?.sunrise && snapshot?.sunset) {
        sun = { sunrise: snapshot.sunrise, sunset: snapshot.sunset };
      }
      const daylight = isDaylight(now, sun.sunrise, sun.sunset);
      const today = dayKey(now, timeZone);
      const entries = new Map();
      const events = [];

      for (const inverter of inventory.inverters) {
        const previous = memory.get(inverter.serial);
        const state = previous ?? {
          lastPower: null,
          lostWhileProducing: false,
          reachable: null,
          producing: null,
          lastDay: null,
          startedDay: null,
        };
        const entry = snapshot?.inverters[inverter.serial];
        let status;
        let reachable = false;
        let producing = false;
        let reading = null;

        if (!inverter.enabled) {
          status = 'disabled';
        } else if (entry?.available) {
          reachable = true;
          reading = entry.reading;
          const power = reading?.acPower ?? null;
          producing = power !== null ? power > 0 : entry.producing;
          status = producing ? 'producing' : 'standby';
          if (power !== null) state.lastPower = power;
          state.lostWhileProducing = false;
          state.lastDay = today;
        } else {
          if (state.reachable) {
            // Just lost: remember how it left.
            state.lostWhileProducing = (state.lastPower ?? 0) > 0;
          }
          const night = daylight === false || (daylight === null && !state.lostWhileProducing);
          status = snapshot === null ? 'dtuUnreachable' : night ? 'sleeping' : 'unreachable';
          if (previous && state.reachable === true && !night && inverter.enabled) {
            events.push({
              kind: 'unreachable',
              serial: inverter.serial,
              cause: snapshot === null ? 'dtu' : 'inverter',
            });
          }
        }

        if (previous && state.producing === false && producing && state.startedDay !== today) {
          events.push({
            kind: 'started',
            serial: inverter.serial,
            power: reading?.acPower ?? null,
          });
        }
        if (producing) {
          // Also set on the first reading: a restart at noon does not fire a
          // "start" when the next cloud passes.
          state.startedDay = today;
        }

        state.reachable = reachable;
        state.producing = producing;
        state.status = status;
        memory.set(inverter.serial, state);
        entries.set(inverter.serial, {
          status,
          reachable,
          producing,
          reading,
          // Asleep since before midnight: its day counter is yesterday's.
          resetToday: !reachable && state.lastDay !== null && state.lastDay !== today,
        });
      }
      return { entries, events };
    },

    /** Another DTU was configured: forget everything. */
    reset() {
      memory.clear();
      sun = { sunrise: null, sunset: null };
    },
  };
}
