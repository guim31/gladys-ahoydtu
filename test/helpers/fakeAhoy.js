// -----------------------------------------------------------------------------
// A fake AhoyDTU 0.8.x, faithful to src/web/RestApi.h and src/web/Protection.h
// of lumapu/ahoy (behavior reproduced, no code copied: Ahoy is CC BY-NC-SA
// 4.0, see the README credits): the same paths, the
// same JSON keys and value order, the same password logic on POST /api/ctrl
// (auth → token bound to the client IP, ERR_AUTH, ERR_PROTECTED), the same
// refusal of a command to an inverter that is OFF (ERR_LIMIT_NOT_ACCEPT).
//
// No hardware was available: the values come from the scenarios of
// test/fixtures/ahoy/*.json (an HM-800 with two panels and an HM-1500 with
// four, by day and by night), anonymized.
//
// Used by the tests through `transport` (no socket), and served for real by
// test/fake-ahoy-server.js in a `gladys-test-*` container.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const FIXTURES = new URL('../fixtures/ahoy/', import.meta.url);

export function scenario(name) {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8'));
}

// acList / dcList of RestApi.h (0.8.x), with the units of hmDefines.h.
const AC_FIELDS = [
  'U_AC',
  'I_AC',
  'P_AC',
  'F_AC',
  'PF_AC',
  'Temp',
  'YieldTotal',
  'YieldDay',
  'P_DC',
  'Efficiency',
  'Q_AC',
  'MaxPower',
  'MaxTemp',
];
const AC_UNITS = ['V', 'A', 'W', 'Hz', '', '°C', 'kWh', 'Wh', 'W', '%', 'var', 'W', '°C'];
const DC_FIELDS = ['U_DC', 'I_DC', 'P_DC', 'YieldDay', 'YieldTotal', 'Irradiation', 'MaxPower'];
const DC_UNITS = ['V', 'A', 'W', 'Wh', 'kWh', '%', 'W'];
const MAX_NUM_INVERTERS = 4; // ESP8266 build

/**
 * @param {object} state a scenario (test/fixtures/ahoy/<name>.json), mutated by the tests
 */
export function createFakeAhoy(state) {
  let apiIp = null;
  let token = null;
  let tokenCount = 0;

  const fake = {
    state,
    /** Every request: { method, path, body }. */
    requests: [],
    /** The accepted commands. */
    commands: [],
    down: null,

    count(path) {
      return fake.requests.filter((request) => request.path === path).length;
    },
    goDown(code = 'EHOSTUNREACH') {
      fake.down = code;
    },
    comeBack() {
      fake.down = null;
    },
    inverter(id) {
      return state.inverters.find((inverter) => inverter.id === id);
    },

    /**
     * One request, as the ESP web server would answer it.
     * @returns {{ status: number, body: string }}
     */
    handle(method, path, body, clientIp = '198.51.100.7') {
      fake.requests.push({ method, path, body });
      const json = (value) => ({ status: 200, body: JSON.stringify(value) });
      if (method === 'POST') {
        if (path !== '/api/ctrl') {
          return json({ success: false, error: `PATH_NOT_FOUND ${path.slice(5)}` });
        }
        let input;
        try {
          input = JSON.parse(body);
        } catch {
          return json({ error: 'DESER_FAILED' });
        }
        const out = {};
        out.success = setCtrl(input, out, clientIp);
        return json(out);
      }
      const route = path.slice(5);
      if (route === 'inverter/list') return json(getInverterList());
      if (route === 'index') return json(getIndex());
      if (route === 'live') return json(getLive());
      if (route === 'generic') return json(getGeneric());
      const match = /^inverter\/id\/(\d+)$/.exec(route);
      if (match) return json(getInverter(Number(match[1])));
      return json({ avail_endpoints: { 'inverter/list': 'http://ahoy/api/inverter/list' } });
    },

    /** The transport of src/ahoy/client.js. */
    async request(url, { method = 'GET', body } = {}) {
      if (fake.down) {
        const err = new Error(fake.down);
        err.code = fake.down;
        throw err;
      }
      return fake.handle(method, new URL(url).pathname, body);
    },
  };

  function getGeneric() {
    return {
      wifi_rssi: -61,
      ts_uptime: 86400,
      ts_now: state.now,
      version: state.version,
      modules: 'MDH-de',
      build: '5feb293',
      env: 'esp8266-de',
      host: 'AHOY-DTU',
      menu_prot: state.password !== '',
      menu_mask: 61,
      menu_protEn: state.password !== '',
      cst_lnk: '',
      cst_lnk_txt: '',
      region: 0,
      timezone: 1,
      esp_type: 'ESP8266',
    };
  }

  function slots() {
    return state.inverters.filter((inverter) => inverter.id < MAX_NUM_INVERTERS);
  }

  function getInverterList() {
    return {
      inverter: slots().map((iv) => ({
        enabled: iv.enabled,
        id: iv.id,
        name: iv.name,
        serial: iv.serial,
        channels: iv.dc.length,
        freq: 12,
        disnightcom: false,
        pa: 1,
        ch_yield_cor: iv.dc.map(() => 0),
        ch_name: iv.chName,
        ch_max_pwr: iv.chMaxPwr,
      })),
      interval: '15',
      max_num_inverters: MAX_NUM_INVERTERS,
      rstMid: false,
      rstNotAvail: false,
      rstComStop: false,
      rstComStart: false,
      strtWthtTm: false,
      rdGrid: true,
      rstMaxMid: false,
    };
  }

  // isAvailable(): a reading less than 5 minutes old (INVERTER_INACT_THRES_SEC).
  const isAvailable = (iv) => iv.enabled && iv.available;
  const isProducing = (iv) => isAvailable(iv) && iv.ac[2] > 0;

  function getIndex() {
    return {
      generic: getGeneric(),
      ts_now: state.now,
      ts_sunrise: state.sunrise,
      ts_sunset: state.sunset,
      ts_offsSr: 0,
      ts_offsSs: 0,
      inverter: slots().map((iv) => ({
        enabled: iv.enabled,
        id: iv.id,
        name: iv.name,
        cur_pwr: iv.ac[2],
        is_avail: isAvailable(iv),
        is_producing: isProducing(iv),
        ts_last_success: iv.tsLastSuccess,
      })),
      disNightComm: false,
      warnings: state.now === 0 ? ['time not set'] : [],
    };
  }

  function getLive() {
    return {
      generic: getGeneric(),
      refresh: 15,
      max_total_pwr: slots().reduce((sum, iv) => sum + iv.chMaxPwr.reduce((a, b) => a + b, 0), 0),
      ch0_fld_units: AC_UNITS,
      ch0_fld_names: AC_FIELDS,
      fld_units: DC_UNITS,
      fld_names: DC_FIELDS,
      iv: Array.from({ length: MAX_NUM_INVERTERS }, (_, i) => fake.inverter(i)?.enabled ?? false),
    };
  }

  function getInverter(id) {
    const iv = fake.inverter(id);
    if (!iv) return { error: 'inverter not found!' };
    return {
      id,
      enabled: iv.enabled,
      name: iv.name,
      serial: iv.serial,
      version: '10012',
      power_limit_read: iv.powerLimit,
      power_limit_ack: iv.powerLimitAck ?? false,
      max_pwr: iv.chMaxPwr.reduce((a, b) => a + b, 0),
      ts_last_success: iv.tsLastSuccess,
      generation: 0,
      status: !isAvailable(iv) ? 0 : isProducing(iv) ? 2 : 1,
      alarm_cnt: 2,
      rssi: -64,
      ts_max_ac_pwr: iv.tsLastSuccess,
      ts_max_temp: iv.tsLastSuccess,
      ch: [iv.ac, ...iv.dc],
      ch_name: ['AC', ...iv.chName],
      ch_max_pwr: [null, ...iv.chMaxPwr],
    };
  }

  // Protection::isProtected(clientIp, token, false)
  function isProtected(input, out, clientIp) {
    if (state.password === '') return false;
    const protectedNow = input.token === undefined || apiIp !== clientIp || input.token !== token;
    if (protectedNow) out.error = 'ERR_PROTECTED';
    return protectedNow;
  }

  // RestApi::setCtrl
  function setCtrl(input, out, clientIp) {
    if ('auth' in input) {
      if (String(input.auth) === state.password) {
        apiIp = clientIp;
        tokenCount += 1;
        token = `TOKEN${String(tokenCount).padStart(11, '0')}`;
        out.token = token;
        input.token = token;
      } else {
        out.error = 'ERR_AUTH';
        return false;
      }
      if (!('cmd' in input)) return true;
    }
    if (isProtected(input, out, clientIp)) return false;
    const iv = fake.inverter(input.id);
    if (!iv) {
      out.error = 'ERR_INDEX';
      return false;
    }
    out.id = input.id;
    const cmd = String(input.cmd);
    if (!cmd.startsWith('limit_') && !['power', 'restart'].includes(cmd)) {
      out.error = 'ERR_UNKNOWN_CMD';
      return false;
    }
    // setDevControlRequest(): refused only once the inverter status is OFF,
    // 15 minutes after its last answer (INVERTER_OFF_THRES_SEC): `off`, or
    // simply not available when a test does not say.
    if (iv.off ?? !isAvailable(iv)) {
      out.error = 'ERR_LIMIT_NOT_ACCEPT';
      return false;
    }
    if (cmd.startsWith('limit_')) {
      iv.powerLimit = Number(input.val);
    }
    fake.commands.push({ id: input.id, cmd, val: input.val });
    return true;
  }

  return fake;
}
