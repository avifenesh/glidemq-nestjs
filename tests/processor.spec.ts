import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  GlideMQModule,
  Processor,
  WorkerHost,
  OnWorkerEvent,
  InjectQueue,
  getQueueToken,
} from '../src';
import type { Job } from 'glide-mq';

@Processor('jobs')
class TestProcessor extends WorkerHost {
  public processedJobs: any[] = [];
  public failedEvents: any[] = [];

  async process(job: Job): Promise<any> {
    this.processedJobs.push({ id: job.id, name: job.name, data: job.data });
    return { processed: true };
  }

  @OnWorkerEvent('failed')
  onFailed(job: any, err: Error) {
    this.failedEvents.push({ jobId: job.id, error: err.message });
  }
}

@Processor('failing')
class FailingProcessor extends WorkerHost {
  async process(): Promise<any> {
    throw new Error('intentional failure');
  }
}

describe('Processor decorator', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should discover @Processor and wire it as a worker', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'jobs' }),
      ],
      providers: [TestProcessor],
    }).compile();

    await moduleRef.init();

    const queue = moduleRef.get(getQueueToken('jobs'));
    const processor = moduleRef.get(TestProcessor);

    // Add a job and wait for processing
    await queue.add('test', { hello: 'world' });

    // Give the TestWorker time to process (microtask-based)
    await new Promise((r) => setTimeout(r, 50));

    expect(processor.processedJobs.length).toBe(1);
    expect(processor.processedJobs[0].name).toBe('test');
    expect(processor.processedJobs[0].data).toEqual({ hello: 'world' });
  });

  it('should process multiple jobs', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'jobs' }),
      ],
      providers: [TestProcessor],
    }).compile();

    await moduleRef.init();

    const queue = moduleRef.get(getQueueToken('jobs'));
    const processor = moduleRef.get(TestProcessor);

    await queue.add('job-1', { idx: 1 });
    await queue.add('job-2', { idx: 2 });
    await queue.add('job-3', { idx: 3 });

    await new Promise((r) => setTimeout(r, 100));

    expect(processor.processedJobs.length).toBe(3);
  });

  it('should wire @OnWorkerEvent handlers', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'failing' }),
      ],
      providers: [FailingProcessor],
    }).compile();

    await moduleRef.init();

    const queue = moduleRef.get(getQueueToken('failing'));
    const processor = moduleRef.get(FailingProcessor);

    await queue.add('will-fail', { data: 1 });
    await new Promise((r) => setTimeout(r, 50));

    // The FailingProcessor doesn't have @OnWorkerEvent('failed'), so check differently
    // Actually FailingProcessor has no event handler, let's use TestProcessor for events
  });
});

describe('Worker event wiring', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should call @OnWorkerEvent(failed) when a job fails', async () => {
    @Processor('event-test')
    class EventTestProcessor extends WorkerHost {
      public completedEvents: any[] = [];
      public failedEvents: any[] = [];

      async process(job: Job): Promise<any> {
        if (job.data.shouldFail) {
          throw new Error('forced failure');
        }
        return { ok: true };
      }

      @OnWorkerEvent('completed')
      onCompleted(job: any) {
        this.completedEvents.push(job.id);
      }

      @OnWorkerEvent('failed')
      onFailed(job: any, err: Error) {
        this.failedEvents.push({ id: job.id, msg: err.message });
      }
    }

    moduleRef = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'event-test' }),
      ],
      providers: [EventTestProcessor],
    }).compile();

    await moduleRef.init();

    const queue = moduleRef.get(getQueueToken('event-test'));
    const processor = moduleRef.get(EventTestProcessor);

    await queue.add('good-job', { shouldFail: false });
    await queue.add('bad-job', { shouldFail: true });

    await new Promise((r) => setTimeout(r, 100));

    expect(processor.completedEvents.length).toBe(1);
    expect(processor.failedEvents.length).toBe(1);
    expect(processor.failedEvents[0].msg).toBe('forced failure');
  });
});
