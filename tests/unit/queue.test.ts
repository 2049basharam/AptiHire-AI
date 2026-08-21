import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ and IORedis
vi.mock('bullmq', () => {
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
  };
  const mockWorkerInstance = {
    on: vi.fn(),
  };
  const mockWorker = vi.fn().mockImplementation(() => mockWorkerInstance);
  const mockQueueEvents = vi.fn();
  return {
    Queue: vi.fn().mockImplementation(() => mockQueue),
    Worker: mockWorker,
    QueueEvents: mockQueueEvents,
  };
});

vi.mock('ioredis', () => {
  const mockRedis = {
    on: vi.fn(),
  };
  return {
    default: vi.fn().mockImplementation(() => mockRedis),
  };
});

describe('Unit Tests: Queue Infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register verification queue and add jobs', async () => {
    const { addVerificationJob, verificationQueue } = await import('../../src/services/queue');
    
    const job = await addVerificationJob('hello world', false);
    
    expect(job.id).toBe('job-123');
    expect(verificationQueue.add).toHaveBeenCalledWith('verify-infra', {
      message: 'hello world',
      shouldFail: false,
    });
  });

  it('should register worker when startVerificationWorker is called', async () => {
    const { startVerificationWorker } = await import('../../src/services/queue');
    const { Worker } = await import('bullmq');
    
    startVerificationWorker();
    
    expect(Worker).toHaveBeenCalled();
  });
});
