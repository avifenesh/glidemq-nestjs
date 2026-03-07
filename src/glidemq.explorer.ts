import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, ModuleRef, Reflector } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type { Worker, BroadcastWorker, QueueEvents } from 'glide-mq';
import {
  GLIDEMQ_MODULE_OPTIONS,
  PROCESSOR_METADATA,
  BROADCAST_PROCESSOR_METADATA,
  WORKER_EVENT_METADATA,
  QUEUE_EVENTS_LISTENER_METADATA,
  QUEUE_EVENT_METADATA,
  getQueueToken,
} from './glidemq.constants';
import type {
  GlideMQModuleOptions,
  ProcessorOptions,
  BroadcastProcessorOptions,
} from './glidemq.interfaces';
import type { WorkerHost } from './hosts/worker-host';

@Injectable()
export class GlideMQExplorer implements OnModuleInit {
  private readonly logger = new Logger(GlideMQExplorer.name);
  private readonly workers: Worker[] = [];
  private readonly broadcastWorkers: BroadcastWorker[] = [];
  private readonly queueEventsInstances: QueueEvents[] = [];

  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(GLIDEMQ_MODULE_OPTIONS) private readonly options: GlideMQModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    this.exploreProcessors();
    this.exploreBroadcastProcessors();
    this.exploreQueueEventsListeners();
  }

  private exploreProcessors(): void {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || !wrapper.metatype) continue;

      const processorOpts = this.reflector.get<ProcessorOptions>(
        PROCESSOR_METADATA,
        wrapper.metatype,
      );
      if (!processorOpts) continue;

      const host = instance as WorkerHost;
      if (typeof host.process !== 'function') {
        this.logger.warn(
          `@Processor('${processorOpts.name}') class ${wrapper.metatype.name} does not implement process() - skipping`,
        );
        continue;
      }

      this.createWorker(processorOpts, host, wrapper);
    }
  }

  private createWorker(
    opts: ProcessorOptions,
    host: WorkerHost,
    wrapper: InstanceWrapper,
  ): void {
    const queueName = opts.name;
    const processor = (job: any) => host.process(job);

    let worker: Worker;

    if (this.options.testing) {
      const { TestQueue, TestWorker } = require('glide-mq/testing');
      let queue: any;
      try {
        queue = this.moduleRef.get(getQueueToken(queueName), { strict: false });
      } catch {
        queue = new TestQueue(queueName);
      }
      worker = new TestWorker(queue, processor, {
        concurrency: opts.concurrency ?? 1,
      }) as any;
    } else {
      const { Worker: WorkerClass } = require('glide-mq');
      if (!this.options.connection) {
        throw new Error(
          `GlideMQ: connection is required for @Processor('${queueName}') when not in testing mode`,
        );
      }
      worker = new WorkerClass(queueName, processor, {
        connection: this.options.connection,
        prefix: this.options.prefix,
        concurrency: opts.concurrency ?? 1,
        ...opts.workerOpts,
      });
    }

    // Wire @OnWorkerEvent methods
    if (wrapper.metatype) {
      const prototype = wrapper.metatype.prototype;
      const methodNames = this.scanner.getAllMethodNames(prototype);
      for (const methodName of methodNames) {
        const event = this.reflector.get<string>(WORKER_EVENT_METADATA, prototype[methodName]);
        if (event) {
          (worker as any).on(event, (...args: any[]) => {
            (host as any)[methodName](...args);
          });
        }
      }
    }

    this.workers.push(worker);
    this.logger.log(`Registered worker for queue "${queueName}"`);
  }

  private exploreBroadcastProcessors(): void {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || !wrapper.metatype) continue;

      const broadcastOpts = this.reflector.get<BroadcastProcessorOptions>(
        BROADCAST_PROCESSOR_METADATA,
        wrapper.metatype,
      );
      if (!broadcastOpts) continue;

      const host = instance as WorkerHost;
      if (typeof host.process !== 'function') {
        this.logger.warn(
          `@BroadcastProcessor('${broadcastOpts.name}') class ${wrapper.metatype.name} does not implement process() - skipping`,
        );
        continue;
      }

      this.createBroadcastWorker(broadcastOpts, host, wrapper);
    }
  }

  private createBroadcastWorker(
    opts: BroadcastProcessorOptions,
    host: WorkerHost,
    wrapper: InstanceWrapper,
  ): void {
    const broadcastName = opts.name;
    const processor = (job: any) => host.process(job);

    if (this.options.testing) {
      this.logger.warn(
        `@BroadcastProcessor('${broadcastName}') skipped in testing mode - BroadcastWorker has no test double`,
      );
      return;
    }

    if (!this.options.connection) {
      throw new Error(
        `GlideMQ: connection is required for @BroadcastProcessor('${broadcastName}') when not in testing mode`,
      );
    }

    const { BroadcastWorker: BroadcastWorkerClass } = require('glide-mq');
    const broadcastWorker: BroadcastWorker = new BroadcastWorkerClass(
      broadcastName,
      opts.subscription,
      processor,
      {
        connection: this.options.connection,
        prefix: this.options.prefix,
        concurrency: opts.concurrency ?? 1,
        subjects: opts.subjects,
        ...opts.workerOpts,
      },
    );

    // Wire @OnWorkerEvent methods
    if (wrapper.metatype) {
      const prototype = wrapper.metatype.prototype;
      const methodNames = this.scanner.getAllMethodNames(prototype);
      for (const methodName of methodNames) {
        const event = this.reflector.get<string>(WORKER_EVENT_METADATA, prototype[methodName]);
        if (event) {
          (broadcastWorker as any).on(event, (...args: any[]) => {
            (host as any)[methodName](...args);
          });
        }
      }
    }

    this.broadcastWorkers.push(broadcastWorker);
    this.logger.log(
      `Registered BroadcastWorker for "${broadcastName}" subscription "${opts.subscription}"`,
    );
  }


  private exploreQueueEventsListeners(): void {
    if (this.options.testing) return;

    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || !wrapper.metatype) continue;

      const queueName = this.reflector.get<string>(
        QUEUE_EVENTS_LISTENER_METADATA,
        wrapper.metatype,
      );
      if (!queueName) continue;

      if (!this.options.connection) {
        throw new Error(
          `GlideMQ: connection is required for @QueueEventsListener('${queueName}')`,
        );
      }

      const { QueueEvents: QueueEventsClass } = require('glide-mq');
      const queueEvents: QueueEvents = new QueueEventsClass(queueName, {
        connection: this.options.connection,
        prefix: this.options.prefix,
      });

      const prototype = wrapper.metatype.prototype;
      const methodNames = this.scanner.getAllMethodNames(prototype);
      for (const methodName of methodNames) {
        const event = this.reflector.get<string>(QUEUE_EVENT_METADATA, prototype[methodName]);
        if (event) {
          queueEvents.on(event, (...args: any[]) => {
            (instance as any)[methodName](...args);
          });
        }
      }

      this.queueEventsInstances.push(queueEvents);
      this.logger.log(`Registered QueueEvents listener for queue "${queueName}"`);
    }
  }

  async closeAll(): Promise<void> {
    const ops: Promise<void>[] = [];
    for (const worker of this.workers) {
      ops.push(worker.close());
    }
    for (const bw of this.broadcastWorkers) {
      ops.push(bw.close());
    }
    for (const qe of this.queueEventsInstances) {
      ops.push(qe.close());
    }
    await Promise.allSettled(ops);
    this.workers.length = 0;
    this.broadcastWorkers.length = 0;
    this.queueEventsInstances.length = 0;
  }
}
