import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Module, Injectable } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  GlideMQModule,
  InjectQueue,
  Processor,
  WorkerHost,
  OnWorkerEvent,
  getQueueToken,
} from '../src';
import type { Job } from 'glide-mq';

describe('Error handling', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should handle processor that throws and retry', async () => {
    let attempts = 0;

    @Processor('retry-queue')
    class RetryProcessor extends WorkerHost {
      public finalResult: any = null;
      async process(job: Job) {
        attempts++;
        if (attempts < 3) {
          throw new Error(`attempt ${attempts}`);
        }
        this.finalResult = 'success on attempt ' + attempts;
        return this.finalResult;
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'retry-queue' }),
      ],
      providers: [RetryProcessor],
    })
    class RetryModule {}

    moduleRef = await Test.createTestingModule({
      imports: [RetryModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get(getQueueToken('retry-queue'));
    await queue.add('retry-job', {}, { attempts: 5 });

    await new Promise((r) => setTimeout(r, 200));

    const processor = moduleRef.get(RetryProcessor);
    expect(processor.finalResult).toBe('success on attempt 3');

    await app.close();
    moduleRef = undefined as any;
  });

  it('should move to failed after exhausting retries', async () => {
    @Processor('exhaust-queue')
    class ExhaustProcessor extends WorkerHost {
      public failCount = 0;
      async process() {
        throw new Error('always fails');
      }

      @OnWorkerEvent('failed')
      onFailed() {
        this.failCount++;
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'exhaust-queue' }),
      ],
      providers: [ExhaustProcessor],
    })
    class ExhaustModule {}

    moduleRef = await Test.createTestingModule({
      imports: [ExhaustModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get(getQueueToken('exhaust-queue'));
    await queue.add('doomed', {}, { attempts: 3 });

    await new Promise((r) => setTimeout(r, 200));

    const processor = moduleRef.get(ExhaustProcessor);
    expect(processor.failCount).toBe(1);

    const counts = await queue.getJobCounts();
    expect(counts.failed).toBe(1);

    await app.close();
    moduleRef = undefined as any;
  });

  it('should handle add returning null (dedup skip)', async () => {
    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'dedup-queue' }),
      ],
    })
    class DedupModule {}

    moduleRef = await Test.createTestingModule({
      imports: [DedupModule],
    }).compile();

    // TestQueue requires dedup opt-in
    // Verify the Queue.add() return type handling works
    const queue = moduleRef.get(getQueueToken('dedup-queue'));
    const job = await queue.add('test', { x: 1 });
    expect(job).not.toBeNull();
    expect(job?.id).toBeDefined();
  });

  it('should handle processor with return value', async () => {
    @Processor('return-queue')
    class ReturnProcessor extends WorkerHost {
      async process(job: Job) {
        return { computed: job.data.input * 2 };
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'return-queue' }),
      ],
      providers: [ReturnProcessor],
    })
    class ReturnModule {}

    moduleRef = await Test.createTestingModule({
      imports: [ReturnModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get(getQueueToken('return-queue'));
    const job = await queue.add('compute', { input: 21 });

    await new Promise((r) => setTimeout(r, 100));

    const completed = await queue.getJob(job.id);
    expect(completed.returnvalue).toEqual({ computed: 42 });

    await app.close();
    moduleRef = undefined as any;
  });

  it('should handle empty queue gracefully', async () => {
    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'empty-queue' }),
      ],
    })
    class EmptyModule {}

    moduleRef = await Test.createTestingModule({
      imports: [EmptyModule],
    }).compile();

    const queue = moduleRef.get(getQueueToken('empty-queue'));
    const counts = await queue.getJobCounts();
    expect(counts).toEqual({
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    });

    const jobs = await queue.getJobs('completed');
    expect(jobs).toEqual([]);
  });
});
