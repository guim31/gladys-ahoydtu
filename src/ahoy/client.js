// -----------------------------------------------------------------------------
// HTTP client of the AhoyDTU REST API (local, JSON), as served by
// src/web/RestApi.h of lumapu/ahoy 0.8.x.
//
// - Reads (`GET /api/...`) need no password: Ahoy only protects its web pages
//   and the POST commands.
// - Commands go to `POST /api/ctrl`. When an admin password is set, the body
//   carries `auth`: Ahoy checks it, unlocks the API for this client and runs
//   the command in the same request (setCtrl). The answer is always HTTP 200,
//   `{ success, error? }`: ERR_AUTH (wrong password), ERR_PROTECTED (password
//   needed), ERR_LIMIT_NOT_ACCEPT (inverter not reachable by radio),
//   ERR_INDEX (no such inverter).
// - One request at a time: an ESP8266 serves one client poorly, several worse.
// -----------------------------------------------------------------------------

import http from 'node:http';

export class AhoyError extends Error {
  /**
   * @param {string} message never carries the password
   * @param {{ kind: 'network'|'timeout'|'http'|'format'|'command', code?: string, status?: number }} details
   */
  constructor(message, { kind, code, status }) {
    super(message);
    this.name = 'AhoyError';
    this.kind = kind;
    this.code = code;
    this.status = status;
  }
}

const MAX_BODY_BYTES = 256 * 1024;

/**
 * One HTTP request with node:http: `{ status, body }`. Injected in the tests
 * (the fake AhoyDTU answers without any socket).
 * @param {string} url
 * @param {{ method?: string, body?: string, timeoutMs: number }} options
 */
export function httpRequest(url, { method = 'GET', body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const headers = { accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
    }
    const request = http.request(url, { method, timeout: timeoutMs, headers }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          request.destroy(new AhoyError('response too large', { kind: 'format' }));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () =>
        resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
      );
      response.on('error', reject);
    });
    request.on('timeout', () =>
      request.destroy(new AhoyError(`no answer within ${timeoutMs} ms`, { kind: 'timeout' })),
    );
    request.on('error', reject);
    if (body !== undefined) {
      request.write(body);
    }
    request.end();
  });
}

/**
 * @param {object} options
 * @param {string} options.baseUrl e.g. http://192.0.2.20 (no trailing slash)
 * @param {number} [options.timeoutMs]
 * @param {typeof httpRequest} [options.request] the transport
 */
export function createClient({ baseUrl, timeoutMs = 10000, request = httpRequest }) {
  let queue = Promise.resolve();

  async function send(path, options) {
    let response;
    try {
      response = await request(`${baseUrl}${path}`, { ...options, timeoutMs });
    } catch (err) {
      if (err instanceof AhoyError) {
        throw err;
      }
      throw new AhoyError(err.code ? `${err.code}` : err.message, { kind: 'network' });
    }
    if (response.status !== 200) {
      throw new AhoyError(`HTTP ${response.status}`, { kind: 'http', status: response.status });
    }
    let json;
    try {
      json = JSON.parse(response.body);
    } catch {
      throw new AhoyError('the answer is not JSON: is this an AhoyDTU?', { kind: 'format' });
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
      throw new AhoyError('unexpected answer: is this an AhoyDTU?', { kind: 'format' });
    }
    return json;
  }

  function queued(run) {
    const result = queue.then(run);
    queue = result.catch(() => {});
    return result;
  }

  return {
    baseUrl,

    /**
     * GET /api/<path>.
     * @param {string} path e.g. "index", "inverter/id/0"
     */
    get(path) {
      return queued(() => send(`/api/${path}`, { method: 'GET' }));
    },

    /**
     * POST /api/ctrl, with the password when one is set.
     * @param {{ id: number, cmd: string, val?: number }} command
     * @param {string} [password]
     * @throws {AhoyError} kind "command" with the Ahoy error code
     */
    control(command, password = '') {
      const body = JSON.stringify(password ? { ...command, auth: password } : command);
      return queued(async () => {
        const json = await send('/api/ctrl', { method: 'POST', body });
        if (json.success !== true) {
          const code = typeof json.error === 'string' ? json.error : 'ERR_UNKNOWN';
          throw new AhoyError(`command refused (${code})`, { kind: 'command', code });
        }
        return json;
      });
    },
  };
}
