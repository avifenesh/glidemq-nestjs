import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { GlideMQModule, InjectQueue, getQueueToken, getFlowProducerToken } from '../src';

// Simple service that injects a queue
@Injectable()
class EmailService {
  constructor(@InjectQueue('emails') public readonly queue: any) {}
}

describe('GlideMQModule', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('forRoot + registerQueue', () => {
    it('should provide a TestQueue when testing: true', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlideMQModule.forRoot({ testing: true }),
          GlideMQModule.registerQueue({ name: 'emails' }),
        ],
        providers: [EmailService],
      }).compile();

      const service = moduleRef.get(EmailService);
      expect(service.queue).toBeDefined();
      expect(service.queue.name).toBe('emails');
    });

    it('should allow adding and retrieving jobs via TestQueue', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlideMQModule.forRoot({ testing: true }),
          GlideMQModule.registerQueue({ name: 'tasks' }),
        ],
      }).compile();

      const queue = moduleRef.get(getQueueToken('tasks'));
      const job = await queue.add('test-job', { foo: 'bar' });
      expect(job).not.toBeNull();
      expect(job.name).toBe('test-job');
      expect(job.data).toEqual({ foo: 'bar' });

      const counts = await queue.getJobCounts();
      expect(counts.waiting).toBe(1);
    });

    it('should register multiple queues', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlideMQModule.forRoot({ testing: true }),
          GlideMQModule.registerQueue({ name: 'queue-a' }),
          GlideMQModule.registerQueue({ name: 'queue-b' }),
        ],
      }).compile();

      const queueA = moduleRef.get(getQueueToken('queue-a'));
      const queueB = moduleRef.get(getQueueToken('queue-b'));
      expect(queueA.name).toBe('queue-a');
      expect(queueB.name).toBe('queue-b');
      expect(queueA).not.toBe(queueB);
    });
  });

  describe('forRootAsync', () => {
    it('should resolve options from a factory', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlideMQModule.forRootAsync({
            useFactory: () => ({ testing: true }),
          }),
          GlideMQModule.registerQueue({ name: 'async-queue' }),
        ],
      }).compile();

      const queue = moduleRef.get(getQueueToken('async-queue'));
      expect(queue).toBeDefined();
      expect(queue.name).toBe('async-queue');
    });

    it('should support async factory', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlideMQModule.forRootAsync({
            useFactory: async () => {
              await new Promise((r) => setTimeout(r, 10));
              return { testing: true };
            },
          }),
          GlideMQModule.registerQueue({ name: 'delayed-queue' }),
        ],
      }).compile();

      const queue = moduleRef.get(getQueueToken('delayed-queue'));
      expect(queue).toBeDefined();
      expect(queue.name).toBe('delayed-queue');
    });
  });

  describe('registerFlowProducer', () => {
    it('should provide a mock flow producer in testing mode', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlideMQModule.forRoot({ testing: true }),
          GlideMQModule.registerFlowProducer({ name: 'workflows' }),
        ],
      }).compile();

      const fp = moduleRef.get(getFlowProducerToken('workflows'));
      expect(fp).toBeDefined();
      expect(typeof fp.add).toBe('function');
      expect(typeof fp.close).toBe('function');
    });
  });

  describe('onModuleDestroy', () => {
    it('should close queues on module destroy', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          GlideMQModule.forRoot({ testing: true }),
          GlideMQModule.registerQueue({ name: 'closable' }),
        ],
      }).compile();

      const queue = moduleRef.get(getQueueToken('closable'));
      expect(queue).toBeDefined();

      // Should not throw
      await moduleRef.close();
      moduleRef = undefined as any;
    });
  });
});
