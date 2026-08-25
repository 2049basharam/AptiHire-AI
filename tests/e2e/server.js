const fs = require('fs');
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

global.__TEST_AI_PROVIDER__ = true;
process.env.DISABLE_RATE_LIMIT = 'true';

// Clean stale .next cache on server startup to prevent webpack chunk mismatch errors (MODULE_NOT_FOUND ./638.js)
const nextDir = path.join(__dirname, '../../.next');
if (fs.existsSync(nextDir)) {
  try {
    fs.rmSync(nextDir, { recursive: true, force: true });
  } catch (e) {
    // ignore directory lock errors
  }
}

const dev = true;
const app = next({ dev, dir: path.join(__dirname, '../../') });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(3000, (err) => {
    if (err) throw err;
    console.log('> Programmatic test server running on http://localhost:3000');
  });

  const cleanup = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
});
