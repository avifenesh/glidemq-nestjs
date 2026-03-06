import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  Module,
  Injectable,
  Controller,
  Get,
  Post,
  Body,
  Inject,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  GlideMQModule,
  InjectQueue,
  InjectFlowProducer,
  Processor,
  WorkerHost,
  OnWorkerEvent,
  getQueueToken,
  getFlowProducerToken,
} from '../src';
import type { Job } from 'glide-mq';

// --- Processor ---

@Processor('tasks')
class TaskProcessor extends WorkerHost {
  public processed: { id: string; name: string; data: any }[] = [];
  public completedIds: string[] = [];
  public failedIds: string[] = [];

  async process(job: Job): Promise<any> {
    if (job.data.shouldFail) {
      throw new Error('intentional failure');
    }
    this.processed.push({ id: job.id, name: job.name, data: job.data });
    return { result: 'done', input: job.data };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.completedIds.push(job.id);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, _err: Error) {
    this.failedIds.push(job.id);
  }
}

// --- Service (explicit @Inject for esbuild compat) ---

@Injectable()
class TaskService {
  constructor(@InjectQueue('tasks') private readonly queue: any) {}

  async addTask(name: string, data: any) {
    const job = await this.queue.add(name, data);
    return { jobId: job?.id ?? null };
  }

  async getStatus() {
    return this.queue.getJobCounts();
  }

  async getJob(id: string) {
    const job = await this.queue.getJob(id);
    if (!job) return null;
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
    };
  }
}

// --- Controller (explicit @Inject for esbuild compat) ---

@Controller('tasks')
class TaskController {
  constructor(@Inject(TaskService) private readonly taskService: TaskService) {}

  @Post()
  async create(@Body() body: { name: string; data: any }) {
    return this.taskService.addTask(body.name, body.data);
  }

  @Get('status')
  async status() {
    return this.taskService.getStatus();
  }
}

// --- Module ---

@Module({
  imports: [
    GlideMQModule.forRoot({ testing: true }),
    GlideMQModule.registerQueue({ name: 'tasks' }),
  ],
  controllers: [TaskController],
  providers: [TaskProcessor, TaskService],
})
class AppModule {}

// --- Tests ---

describe('Integration: full NestJS app', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createApp() {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('should boot the app, add a job via HTTP, and process it', async () => {
    await createApp();

    const processor = moduleRef.get(TaskProcessor);

    // Add a job via HTTP
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .send({ name: 'email', data: { to: 'user@example.com' } })
      .expect(201);

    expect(res.body.jobId).toBeDefined();

    // Wait for processing
    await new Promise((r) => setTimeout(r, 100));

    expect(processor.processed.length).toBe(1);
    expect(processor.processed[0].name).toBe('email');
    expect(processor.processed[0].data).toEqual({ to: 'user@example.com' });
    expect(processor.completedIds.length).toBe(1);
  });

  it('should handle failed jobs and fire @OnWorkerEvent(failed)', async () => {
    await createApp();

    const processor = moduleRef.get(TaskProcessor);

    await request(app.getHttpServer())
      .post('/tasks')
      .send({ name: 'bad-task', data: { shouldFail: true } })
      .expect(201);

    await new Promise((r) => setTimeout(r, 100));

    expect(processor.failedIds.length).toBe(1);
    expect(processor.processed.length).toBe(0);
  });

  it('should return queue status via HTTP', async () => {
    await createApp();

    // Add a few jobs
    await request(app.getHttpServer())
      .post('/tasks')
      .send({ name: 'job-1', data: { x: 1 } })
      .expect(201);

    await request(app.getHttpServer())
      .post('/tasks')
      .send({ name: 'job-2', data: { x: 2 } })
      .expect(201);

    await new Promise((r) => setTimeout(r, 100));

    const res = await request(app.getHttpServer())
      .get('/tasks/status')
      .expect(200);

    // After processing, jobs should be completed
    expect(res.body.completed).toBe(2);
    expect(res.body.waiting).toBe(0);
  });

  it('should process multiple jobs concurrently', async () => {
    await createApp();

    const processor = moduleRef.get(TaskProcessor);

    // Add 5 jobs rapidly
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        request(app.getHttpServer())
          .post('/tasks')
          .send({ name: `batch-${i}`, data: { idx: i } }),
      );
    }
    await Promise.all(promises);

    await new Promise((r) => setTimeout(r, 200));

    expect(processor.processed.length).toBe(5);
    expect(processor.completedIds.length).toBe(5);
  });

  it('should inject queue directly and operate on it', async () => {
    await createApp();

    const queue = moduleRef.get(getQueueToken('tasks'));

    // Use the queue directly
    const job = await queue.add('direct-add', { source: 'test' });
    expect(job).not.toBeNull();
    expect(job.name).toBe('direct-add');

    await new Promise((r) => setTimeout(r, 100));

    // The processor should have picked it up
    const processor = moduleRef.get(TaskProcessor);
    const directJob = processor.processed.find((j: any) => j.name === 'direct-add');
    expect(directJob).toBeDefined();
    expect(directJob!.data).toEqual({ source: 'test' });
  });

  it('should shut down gracefully', async () => {
    await createApp();

    // Add a job to make sure there's activity
    await request(app.getHttpServer())
      .post('/tasks')
      .send({ name: 'pre-shutdown', data: {} })
      .expect(201);

    await new Promise((r) => setTimeout(r, 50));

    // Close should not throw
    await app.close();
    app = undefined as any;
  });
});

describe('Integration: forRootAsync with factory', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should boot with async config and process jobs', async () => {
    @Processor('async-queue')
    class AsyncProcessor extends WorkerHost {
      public jobs: any[] = [];
      async process(job: Job) {
        this.jobs.push(job.data);
        return { ok: true };
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRootAsync({
          useFactory: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return { testing: true };
          },
        }),
        GlideMQModule.registerQueue({ name: 'async-queue' }),
      ],
      providers: [AsyncProcessor],
    })
    class AsyncAppModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [AsyncAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get(getQueueToken('async-queue'));
    await queue.add('test', { value: 42 });

    await new Promise((r) => setTimeout(r, 100));

    const processor = moduleRef.get(AsyncProcessor);
    expect(processor.jobs.length).toBe(1);
    expect(processor.jobs[0]).toEqual({ value: 42 });
  });
});

describe('Integration: FlowProducer', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should inject and use a mock FlowProducer', async () => {
    @Injectable()
    class PipelineService {
      constructor(@InjectFlowProducer('pipeline') private readonly flow: any) {}

      async run() {
        return this.flow.add({
          name: 'parent',
          queueName: 'tasks',
          data: {},
          children: [],
        });
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerFlowProducer({ name: 'pipeline' }),
      ],
      providers: [PipelineService],
    })
    class FlowModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [FlowModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const service = moduleRef.get(PipelineService);
    const result = await service.run();
    expect(result).toEqual({ job: null, children: [] });
  });
});
