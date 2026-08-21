const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Explicitly inject the test AI provider flag into the global runtime context.
// This is used by the getAIProvider factory to safely enable TestAIProvider
// in E2E tests, without using environment variable workarounds.
global.__TEST_AI_PROVIDER__ = true;

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(3000, (err) => {
    if (err) throw err;
    console.log('> Programmatic test server running on http://localhost:3000');
  });
});
