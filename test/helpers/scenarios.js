// -----------------------------------------------------------------------------
// Moments of a day, applied to a fake AhoyDTU state (test/helpers/fakeAhoy.js).
// Ahoy's own behavior: at dusk the power falls to 0, then the inverter stops
// answering the radio and is "not available" five minutes later; the values
// it last sent stay readable.
// -----------------------------------------------------------------------------

/** The inverters stop producing (dusk), still answering. */
export function dusk(state) {
  for (const iv of state.inverters) {
    iv.ac[2] = 0;
    iv.ac[1] = 0;
    for (const dc of iv.dc) {
      dc[2] = 0;
      dc[1] = 0;
    }
  }
}

/** Night: Ahoy marks every inverter not available. */
export function night(state, at = Date.parse('2026-06-21T22:30:00Z')) {
  dusk(state);
  state.now = at / 1000;
  for (const iv of state.inverters) {
    iv.available = false;
  }
}

/** Morning of the next day: awake and producing, day counters reset. */
export function morning(state, at = Date.parse('2026-06-22T05:30:00Z')) {
  state.now = at / 1000;
  state.sunrise += 86400;
  state.sunset += 86400;
  for (const iv of state.inverters) {
    iv.available = true;
    iv.ac[2] = 45.2;
    iv.ac[7] = 12;
    for (const dc of iv.dc) {
      dc[2] = 12;
      dc[3] = 3;
    }
  }
}
