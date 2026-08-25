import http from 'http';
import { startVerificationWorker, startCandidateWorker } from './queue';
import { logger } from '../lib/logger';

logger.info('AptiHire AI Background Worker process started');

// Start BullMQ workers
const verificationWorker = startVerificationWorker();
const candidateWorker = startCandidateWorker();

// Bind a dummy HTTP server to satisfy Render's port-binding check on the Free Tier
const port = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AptiHire AI Background Worker is active\n');
});

server.listen(port, () => {
  logger.info(`Dummy HTTP server listening on port ${port} for Render health checks`);
});

// Keep process alive and handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down workers gracefully...');
  server.close();
  try {
    await verificationWorker.close();
    await candidateWorker.close();
  } catch (err) {
    logger.error('Error closing workers during SIGTERM', undefined, { error: String(err) });
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down workers gracefully...');
  server.close();
  try {
    await verificationWorker.close();
    await candidateWorker.close();
  } catch (err) {
    logger.error('Error closing workers during SIGINT', undefined, { error: String(err) });
  }
  process.exit(0);
});
