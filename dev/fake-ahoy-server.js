// -----------------------------------------------------------------------------
// The fake AhoyDTU over real HTTP, for the end-to-end checks in a
// `gladys-test-*` container (see CLAUDE.md, "Tests in Docker"). Not part of
// the image: started with `node dev/fake-ahoy-server.js` from the repository.
//
// AHOY_PORT (80 by default), AHOY_PASSWORD, AHOY_SCENARIO=day|night.
// -----------------------------------------------------------------------------

import http from 'node:http';
import { createFakeAhoy, scenario } from '../test/helpers/fakeAhoy.js';
import { night } from '../test/helpers/scenarios.js';

const state = scenario('day');
state.password = process.env.AHOY_PASSWORD ?? '';
if (process.env.AHOY_SCENARIO === 'night') {
  night(state);
}
const fake = createFakeAhoy(state);

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const { pathname } = new URL(request.url, 'http://ahoy');
    const answer = pathname.startsWith('/api')
      ? fake.handle(request.method, pathname, body, request.socket.remoteAddress)
      : { status: 404, body: 'Not found' };
    // Ahoy answers JSON with these headers (RestApi.h onApi).
    response.writeHead(answer.status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    response.end(answer.body);
    console.log(`${request.method} ${pathname} -> ${answer.body.slice(0, 80)}`);
  });
});
server.listen(Number(process.env.AHOY_PORT ?? 80), () => console.log('fake AhoyDTU ready'));
