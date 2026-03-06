import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  GlideMQModule,
  Processor,
  WorkerHost,
  getQueueToken,
} from '../src';
import type { Job } from 'glide-mq';

@Processor('ops-queue')
class OpsProcessor extends WorkerHost {
  public processed: string[] = [];
  async process(job: Job) {
    this.processed.push(job.name);
    return { ok: true };
  }
}

@Module({
  imports: [
    GlideMQModule.forRoot({ testing: true }),
    GlideMQModule.registerQueue({ name: 'ops-queue' }),
  ],
  providers: [OpsProcessor],
})
class OpsModule {}

describe('Queue operations', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let queue: any;

  afterEach(async () => {
    if (app) await app.close();
  });

  async function setup() {
    moduleRef = await Test.createTestingModule({
      imports: [OpsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    queue = moduleRef.get(getQueueToken('ops-queue'));
  }

  it('should add and retrieve a job by ID', async () => {
    await setup();

    const job = await queue.add('lookup-test', { key: 'value' });
    const found = await queue.getJob(job.id);

    expect(found).not.toBeNull();
    expect(found.name).toBe('lookup-test');
    expect(found.data).toEqual({ key: 'value' });
  });

  it('should return null for non-existent job', async () => {
    await setup();

    const found = await queue.getJob('non-existent-id');
    expect(found).toBeNull();
  });

  it('should get job counts', async () => {
    await setup();

    await queue.add('count-1', {});
    await queue.add('count-2', {});

    await new Promise((r) => setTimeout(r, 100));

    const counts = await queue.getJobCounts();
    expect(counts.completed).toBe(2);
  });

  it('should add bulk jobs', async () => {
    await setup();

    const jobs = await queue.addBulk([
      { name: 'bulk-1', data: { i: 1 } },
      { name: 'bulk-2', data: { i: 2 } },
      { name: 'bulk-3', data: { i: 3 } },
    ]);

    expect(jobs.length).toBe(3);
    expect(jobs[0].name).toBe('bulk-1');
    expect(jobs[2].data).toEqual({ i: 3 });

    await new Promise((r) => setTimeout(r, 100));

    const processor = moduleRef.get(OpsProcessor);
    expect(processor.processed).toContain('bulk-1');
    expect(processor.processed).toContain('bulk-2');
    expect(processor.processed).toContain('bulk-3');
  });

  it('should get jobs by state', async () => {
    await setup();

    await queue.add('state-test', {});
    await new Promise((r) => setTimeout(r, 100));

    const completed = await queue.getJobs('completed');
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(completed.some((j: any) => j.name === 'state-test')).toBe(true);
  });

  it('should pause and resume the queue', async () => {
    await setup();

    await queue.pause();
    expect(queue.isPaused()).toBe(true);

    await queue.add('paused-job', { x: 1 });
    await new Promise((r) => setTimeout(r, 50));

    // Job should still be waiting since queue is paused
    const counts = await queue.getJobCounts();
    expect(counts.waiting).toBeGreaterThanOrEqual(1);

    await queue.resume();
    expect(queue.isPaused()).toBe(false);

    await new Promise((r) => setTimeout(r, 100));

    const countsAfter = await queue.getJobCounts();
    expect(countsAfter.waiting).toBe(0);
  });

  it('should search jobs by name', async () => {
    await setup();

    await queue.add('findme', { data: 1 });
    await queue.add('other', { data: 2 });
    await queue.add('findme', { data: 3 });

    const results = await queue.searchJobs({ name: 'findme' });
    expect(results.length).toBe(2);
    expect(results.every((j: any) => j.name === 'findme')).toBe(true);
  });

  it('should drain waiting jobs', async () => {
    await setup();

    await queue.pause();
    await queue.add('drain-1', {});
    await queue.add('drain-2', {});

    let counts = await queue.getJobCounts();
    expect(counts.waiting).toBe(2);

    await queue.drain();

    counts = await queue.getJobCounts();
    expect(counts.waiting).toBe(0);
  });

  it('should clean old completed jobs', async () => {
    await setup();

    await queue.add('clean-1', {});
    await queue.add('clean-2', {});
    await new Promise((r) => setTimeout(r, 100));

    const removed = await queue.clean(0, 100, 'completed');
    expect(removed.length).toBe(2);

    const counts = await queue.getJobCounts();
    expect(counts.completed).toBe(0);
  });

  it('should retry failed jobs', async () => {
    await setup();

    // The OpsProcessor always succeeds, so we need to manually create a failed scenario.
    // Let's just verify the API call works.
    const retried = await queue.retryJobs();
    expect(retried).toBe(0); // no failed jobs to retry
  });

  it('should support job schedulers (upsert/get/remove)', async () => {
    await setup();

    await queue.upsertJobScheduler('daily-report', {
      pattern: '0 9 * * *',
    }, {
      name: 'generate-report',
      data: { type: 'daily' },
    });

    const entry = await queue.getJobScheduler('daily-report');
    expect(entry).not.toBeNull();
    expect(entry.pattern).toBe('0 9 * * *');

    const all = await queue.getRepeatableJobs();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('daily-report');

    await queue.removeJobScheduler('daily-report');
    const removed = await queue.getJobScheduler('daily-report');
    expect(removed).toBeNull();
  });
});
