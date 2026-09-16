import { createServer } from 'node:http';
import { createApi } from './api.mjs';
import { createDatabase, productionEnvironment } from './db.mjs';
import { seedDemo } from './seed.mjs';

const db = await createDatabase();
if (process.env.CROPS_SEED_DEMO === 'true') {
  if (productionEnvironment()) throw new Error('Demo seeding is disabled in production.');
  await seedDemo(db);
}
const handleRequest = createApi({ db });
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const server = createServer(async (incoming, outgoing) => {
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 65536) {
        outgoing.writeHead(413, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ error: 'Request body is too large.', code: 'payload_too_large' }));
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method || 'GET';
    const request = new Request(`http://${incoming.headers.host || `localhost:${port}`}${incoming.url}`, { method, headers, ...(!['GET', 'HEAD'].includes(method) ? { body: Buffer.concat(chunks) } : {}) });
    const response = await handleRequest(request, { ip: incoming.socket.remoteAddress });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('HTTP request failed:', error.code || error.name);
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify({ error: 'Request failed.', code: 'server_error' }));
  }
});
server.listen(port, host, () => console.log(`Crops API ready at http://${host}:${port} (${db.kind})`));
async function shutdown() {
  server.close(async () => { await db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
