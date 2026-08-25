import { startVerificationWorker, startCandidateWorker } from './queue';
import { logger } from '../lib/logger';

logger.info('AptiHire AI Background Worker process started');

// Start BullMQ workers
const verificationWorker = startVerificationWorker();
const candidateWorker = startCandidateWorker();

// Keep process alive and handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down workers gracefully...');
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
  try {
    await verificationWorker.close();
    await candidateWorker.close();
  } catch (err) {
    logger.error('Error closing workers during SIGINT', undefined, { error: String(err) });
  }
  process.exit(0);
});
