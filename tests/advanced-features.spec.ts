import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Module, Injectable, Inject } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  GlideMQModule,
  InjectQueue,
  InjectFlowProducer,
  Processor,
  WorkerHost,
  getQueueToken,
  getFlowProducerToken,
} from '../src';
import type { GlideMQModuleOptions, GlideMQOptionsFactory } from '../src';
import type { Job } from 'glide-mq';

describe('Advanced features', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  // --- useClass / useExisting ---

  it('should support forRootAsync with useClass', async () => {
    @Injectable()
    class GlideMQConfigService implements GlideMQOptionsFactory {
      createGlideMQOptions(): GlideMQModuleOptions {
        return { testing: true };
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRootAsync({ useClass: GlideMQConfigService }),
        GlideMQModule.registerQueue({ name: 'useclass-queue' }),
      ],
    })
    class UseClassModule {}

    moduleRef = await Test.createTestingModule({
      imports: [UseClassModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get(getQueueToken('useclass-queue'));
    expect(queue).toBeDefined();
    expect(queue.name).toBe('useclass-queue');

    const job = await queue.add('test', { x: 1 });
    expect(job).not.toBeNull();

    await app.close();
    moduleRef = undefined as any;
  });

  it('should support forRootAsync with useExisting', async () => {
    @Injectable()
    class SharedConfigService implements GlideMQOptionsFactory {
      createGlideMQOptions(): GlideMQModuleOptions {
        return { testing: true };
      }
    }

    @Module({
      providers: [SharedConfigService],
      exports: [SharedConfigService],
    })
    class SharedConfigModule {}

    @Module({
      imports: [
        SharedConfigModule,
        GlideMQModule.forRootAsync({
          imports: [SharedConfigModule],
          useExisting: SharedConfigService,
        }),
        GlideMQModule.registerQueue({ name: 'useexisting-queue' }),
      ],
    })
    class UseExistingModule {}

    moduleRef = await Test.createTestingModule({
      imports: [UseExistingModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get(getQueueToken('useexisting-queue'));
    expect(queue).toBeDefined();
    const job = await queue.add('test', { data: 42 });
    expect(job?.data).toEqual({ data: 42 });

    await app.close();
    moduleRef = undefined as any;
  });

  it('should throw if forRootAsync has no config method', () => {
    expect(() => {
      GlideMQModule.forRootAsync({} as any);
    }).toThrow('GlideMQ: forRootAsync requires useFactory, useClass, or useExisting');
  });

  // --- Variadic registerQueue ---

  it('should register multiple queues in a single call', async () => {
    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue(
          { name: 'queue-a' },
          { name: 'queue-b' },
          { name: 'queue-c' },
        ),
      ],
    })
    class MultiQueueModule {}

    moduleRef = await Test.createTestingModule({
      imports: [MultiQueueModule],
    }).compile();

    const queueA = moduleRef.get(getQueueToken('queue-a'));
    const queueB = moduleRef.get(getQueueToken('queue-b'));
    const queueC = moduleRef.get(getQueueToken('queue-c'));

    expect(queueA.name).toBe('queue-a');
    expect(queueB.name).toBe('queue-b');
    expect(queueC.name).toBe('queue-c');

    // Queues are independent
    await queueA.add('job', { from: 'a' });
    await queueB.add('job', { from: 'b' });

    const countsA = await queueA.getJobCounts();
    const countsB = await queueB.getJobCounts();
    expect(countsA.waiting).toBe(1);
    expect(countsB.waiting).toBe(1);
  });

  // --- Variadic registerFlowProducer ---

  it('should register multiple flow producers in a single call', async () => {
    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerFlowProducer(
          { name: 'flow-x' },
          { name: 'flow-y' },
        ),
      ],
    })
    class MultiFlowModule {}

    moduleRef = await Test.createTestingModule({
      imports: [MultiFlowModule],
    }).compile();

    const flowX = moduleRef.get(getFlowProducerToken('flow-x'));
    const flowY = moduleRef.get(getFlowProducerToken('flow-y'));

    expect(flowX).toBeDefined();
    expect(flowY).toBeDefined();
    expect(flowX).not.toBe(flowY);

    // Both should have mock methods in testing mode
    const result = await flowX.add({ name: 'test', queueName: 'q', data: {} });
    expect(result).toEqual({ job: null, children: [] });
  });

  // --- Processors with variadic queues ---

  it('should wire processors to variadic-registered queues', async () => {
    @Processor('var-queue-1')
    class Processor1 extends WorkerHost {
      public jobs: string[] = [];
      async process(job: Job) {
        this.jobs.push(job.name);
      }
    }

    @Processor('var-queue-2')
    class Processor2 extends WorkerHost {
      public jobs: string[] = [];
      async process(job: Job) {
        this.jobs.push(job.name);
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue(
          { name: 'var-queue-1' },
          { name: 'var-queue-2' },
        ),
      ],
      providers: [Processor1, Processor2],
    })
    class VarProcessorModule {}

    moduleRef = await Test.createTestingModule({
      imports: [VarProcessorModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const q1 = moduleRef.get(getQueueToken('var-queue-1'));
    const q2 = moduleRef.get(getQueueToken('var-queue-2'));

    await q1.add('job-for-1', {});
    await q2.add('job-for-2', {});
    await new Promise((r) => setTimeout(r, 100));

    const p1 = moduleRef.get(Processor1);
    const p2 = moduleRef.get(Processor2);

    expect(p1.jobs).toEqual(['job-for-1']);
    expect(p2.jobs).toEqual(['job-for-2']);

    await app.close();
    moduleRef = undefined as any;
  });

  // --- isGlobal option ---

  it('should default isGlobal to true in forRootAsync', async () => {
    // When isGlobal defaults to true, registerQueue in a sibling import can resolve options
    @Module({
      imports: [
        GlideMQModule.forRootAsync({
          useFactory: () => ({ testing: true }),
        }),
        GlideMQModule.registerQueue({ name: 'global-default-queue' }),
      ],
    })
    class GlobalDefaultModule {}

    moduleRef = await Test.createTestingModule({
      imports: [GlobalDefaultModule],
    }).compile();

    const queue = moduleRef.get(getQueueToken('global-default-queue'));
    expect(queue).toBeDefined();
    expect(queue.name).toBe('global-default-queue');
  });

  // --- OnApplicationShutdown ---

  it('should close all resources on application shutdown', async () => {
    @Processor('shutdown-queue')
    class ShutdownProcessor extends WorkerHost {
      async process(job: Job) {
        return { done: true };
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue({ name: 'shutdown-queue' }),
      ],
      providers: [ShutdownProcessor],
    })
    class ShutdownModule {}

    moduleRef = await Test.createTestingModule({
      imports: [ShutdownModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get(getQueueToken('shutdown-queue'));
    await queue.add('before-shutdown', {});
    await new Promise((r) => setTimeout(r, 50));

    // Shutdown should not throw
    await expect(app.close()).resolves.not.toThrow();
    moduleRef = undefined as any;
  });

  // --- Injection in services with variadic queues ---

  it('should allow @InjectQueue for variadic-registered queues', async () => {
    @Injectable()
    class ServiceA {
      constructor(@InjectQueue('inj-queue-a') private readonly queue: any) {}
      async addJob(data: any) {
        return this.queue.add('from-a', data);
      }
    }

    @Injectable()
    class ServiceB {
      constructor(@InjectQueue('inj-queue-b') private readonly queue: any) {}
      async addJob(data: any) {
        return this.queue.add('from-b', data);
      }
    }

    @Module({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerQueue(
          { name: 'inj-queue-a' },
          { name: 'inj-queue-b' },
        ),
      ],
      providers: [ServiceA, ServiceB],
    })
    class InjectionModule {}

    moduleRef = await Test.createTestingModule({
      imports: [InjectionModule],
    }).compile();

    const serviceA = moduleRef.get(ServiceA);
    const serviceB = moduleRef.get(ServiceB);

    const jobA = await serviceA.addJob({ x: 1 });
    const jobB = await serviceB.addJob({ y: 2 });

    expect(jobA.name).toBe('from-a');
    expect(jobA.data).toEqual({ x: 1 });
    expect(jobB.name).toBe('from-b');
    expect(jobB.data).toEqual({ y: 2 });
  });
});
