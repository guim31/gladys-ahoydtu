// -----------------------------------------------------------------------------
// What the integration knows of an AhoyDTU: its inventory (inverters, field
// order) and the last snapshot of their values.
//
// - discover(): /api/inverter/list, /api/live (field order), /api/index;
//   the inventory is kept in /data so the devices are published again after
//   a restart, even at night or while the DTU is down.
// - refresh(): /api/index (who is reachable, sun times), then
//   /api/inverter/id/<id> for each reachable inverter only: at night, one
//   request per cycle.
// - setPowerLimit(): the id of a serial is read again first (Ahoy numbers
//   its inverters by position: deleting one shifts the others).
//
// Inverters are keyed by serial everywhere: it is the external id of their
// device, and the only identifier that never changes.
// -----------------------------------------------------------------------------

import { AhoyError } from './client.js';
import { parseFieldNames, parseIndex, parseInverter, parseInverterList } from './parse.js';

const STORE_KEY = 'inventory';

/**
 * @param {object} options
 * @param {ReturnType<import('./client.js').createClient>} options.client
 * @param {{ read: Function, write: Function }} options.store
 * @param {() => number} options.now
 */
export function createAhoyService({ client, store, now }) {
  let inventory = null;
  let snapshot = null;

  const signature = (inv) =>
    JSON.stringify(
      inv.inverters.map(({ serial, channels, enabled }) => [serial, channels, enabled]),
    );

  async function readList() {
    return parseInverterList(await client.get('inverter/list'));
  }

  return {
    get inventory() {
      return inventory;
    },
    get snapshot() {
      return snapshot;
    },

    /** The inventory of a previous run, if any. @returns {Promise<boolean>} */
    async load() {
      const saved = await store.read(STORE_KEY);
      if (saved && saved.baseUrl === client.baseUrl && Array.isArray(saved.inverters)) {
        inventory = { inverters: saved.inverters, fields: parseFieldNames(saved.fields) };
        return true;
      }
      return false;
    },

    /** Read the configuration of the DTU. @returns {Promise<{ inventory, changed: boolean, version: string }>} */
    async discover() {
      const inverters = await readList();
      // /api/live only gives the field order; an older firmware without it
      // gets the 0.8 order.
      const fields = parseFieldNames(await client.get('live').catch(() => null));
      const index = parseIndex(await client.get('index'));
      const next = { inverters, fields };
      const changed = !inventory || signature(inventory) !== signature(next);
      inventory = next;
      if (changed) {
        await store.write(STORE_KEY, { baseUrl: client.baseUrl, inverters, fields });
      }
      return { inventory, changed, version: index.version };
    },

    /**
     * Read the values of the reachable inverters.
     * @returns {Promise<object>} the snapshot: { fetchedAt, sunrise, sunset,
     *   inverters: { [serial]: { available, producing, reading } }, errors, unknownHardware }
     * @throws {AhoyError} when the DTU does not answer
     */
    async refresh() {
      const index = parseIndex(await client.get('index'));
      const known = new Set(inventory.inverters.map((inverter) => inverter.id));
      const result = {
        fetchedAt: now(),
        sunrise: index.sunrise,
        sunset: index.sunset,
        inverters: {},
        errors: [],
        unknownHardware: [...index.inverters.keys()].some((id) => !known.has(id)),
      };
      for (const inverter of inventory.inverters) {
        const live = index.inverters.get(inverter.id);
        const entry = {
          available: inverter.enabled && live?.available === true,
          producing: live?.producing === true,
          reading: null,
        };
        if (entry.available) {
          try {
            entry.reading = parseInverter(
              await client.get(`inverter/id/${inverter.id}`),
              inventory.fields,
            );
          } catch (err) {
            result.errors.push({ serial: inverter.serial, err });
            // Keep what the index says, without the values.
          }
        }
        result.inverters[inverter.serial] = entry;
      }
      snapshot = result;
      return result;
    },

    /**
     * Non-persistent relative limit (lost when the inverter restarts, every
     * morning): never written to the inverter's flash memory.
     * @param {string} serial
     * @param {number} percent 2..100
     * @param {string} password '' when none
     * @throws {AhoyError} kind "command" (code) or "unknown_inverter", or a reading error
     */
    async setPowerLimit(serial, percent, password) {
      const inverter = (await readList()).find((entry) => entry.serial === serial);
      if (!inverter) {
        throw new AhoyError('inverter not found on the DTU', {
          kind: 'command',
          code: 'ERR_INDEX',
        });
      }
      await client.control(
        { id: inverter.id, cmd: 'limit_nonpersistent_relative', val: percent },
        password,
      );
      return inverter;
    },
  };
}
