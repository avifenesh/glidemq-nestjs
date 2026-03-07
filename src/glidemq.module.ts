import {
  Module,
  DynamicModule,
  OnApplicationShutdown,
  Inject,
  Optional,
  type Provider,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import {
  GLIDEMQ_MODULE_OPTIONS,
  GLIDEMQ_CLOSABLES,
  getQueueToken,
  getFlowProducerToken,
} from './glidemq.constants';
import type {
  GlideMQModuleOptions,
  GlideMQModuleAsyncOptions,
  GlideMQOptionsFactory,
  RegisterQueueOptions,
  RegisterFlowProducerOptions,
  RegisterBroadcastOptions,
  RegisterProducerOptions,
} from './glidemq.interfaces';
import { createBroadcastProviders } from './providers/create-broadcast.provider';
import { createProducerProviders } from './providers/create-producer.provider';
import { GlideMQExplorer } from './glidemq.explorer';

interface Closable {
  close(): Promise<void>;
}

@Module({})
export class GlideMQModule implements OnApplicationShutdown {
  constructor(
    @Optional() @Inject(GLIDEMQ_CLOSABLES) private readonly closables: Closable[] | null,
    @Optional() @Inject(GlideMQExplorer) private readonly explorer: GlideMQExplorer | null,
  ) {}

  static forRoot(options: GlideMQModuleOptions): DynamicModule {
    return {
      module: GlideMQModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [
        { provide: GLIDEMQ_MODULE_OPTIONS, useValue: options },
        { provide: GLIDEMQ_CLOSABLES, useValue: [] },
        GlideMQExplorer,
      ],
      exports: [GLIDEMQ_MODULE_OPTIONS, GLIDEMQ_CLOSABLES],
    };
  }

  static forRootAsync(options: GlideMQModuleAsyncOptions): DynamicModule {
    const providers = GlideMQModule.createAsyncProviders(options);

    return {
      module: GlideMQModule,
      global: options.isGlobal !== false,
      imports: [...(options.imports ?? []), DiscoveryModule],
      providers: [
        ...providers,
        { provide: GLIDEMQ_CLOSABLES, useValue: [] },
        GlideMQExplorer,
      ],
      exports: [GLIDEMQ_MODULE_OPTIONS, GLIDEMQ_CLOSABLES],
    };
  }

  private static createAsyncProviders(options: GlideMQModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: GLIDEMQ_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
      ];
    }

    if (options.useClass) {
      return [
        {
          provide: options.useClass,
          useClass: options.useClass,
        },
        {
          provide: GLIDEMQ_MODULE_OPTIONS,
          useFactory: (factory: GlideMQOptionsFactory) => factory.createGlideMQOptions(),
          inject: [options.useClass],
        },
      ];
    }

    if (options.useExisting) {
      return [
        {
          provide: GLIDEMQ_MODULE_OPTIONS,
          useFactory: (factory: GlideMQOptionsFactory) => factory.createGlideMQOptions(),
          inject: [options.useExisting],
        },
      ];
    }

    throw new Error('GlideMQ: forRootAsync requires useFactory, useClass, or useExisting');
  }

  static registerQueue(...options: RegisterQueueOptions[]): DynamicModule {
    const providers: Provider[] = [];
    const exports: string[] = [];

    for (const opts of options) {
      const queueToken = getQueueToken(opts.name);

      providers.push({
        provide: queueToken,
        useFactory: (moduleOptions: GlideMQModuleOptions, closables: Closable[]) => {
          let queue: any;

          if (moduleOptions.testing) {
            const { TestQueue } = require('glide-mq/testing');
            queue = new TestQueue(opts.name);
          } else {
            const connection = opts.connection ?? moduleOptions.connection;
            if (!connection) {
              throw new Error(
                `GlideMQ: connection is required for queue "${opts.name}" when not in testing mode`,
              );
            }
            const { Queue } = require('glide-mq');
            queue = new Queue(opts.name, {
              connection,
              prefix: moduleOptions.prefix,
              ...opts.queueOpts,
            });
          }

          if (opts.defaultJobOptions) {
            const defaults = opts.defaultJobOptions;
            const origAdd = queue.add.bind(queue);
            const origAddBulk = queue.addBulk.bind(queue);
            queue.add = (name: string, data: any, jobOpts?: any) =>
              origAdd(name, data, { ...defaults, ...jobOpts });
            queue.addBulk = (jobs: any[]) =>
              origAddBulk(jobs.map((j: any) => ({ ...j, opts: { ...defaults, ...j.opts } })));
          }

          closables.push(queue);
          return queue;
        },
        inject: [GLIDEMQ_MODULE_OPTIONS, GLIDEMQ_CLOSABLES],
      });

      exports.push(queueToken);
    }

    return {
      module: GlideMQModule,
      providers,
      exports,
    };
  }

  static registerFlowProducer(...options: RegisterFlowProducerOptions[]): DynamicModule {
    const providers: Provider[] = [];
    const exports: string[] = [];

    for (const opts of options) {
      const token = getFlowProducerToken(opts.name);

      providers.push({
        provide: token,
        useFactory: (moduleOptions: GlideMQModuleOptions, closables: Closable[]) => {
          if (moduleOptions.testing) {
            return {
              add: async () => ({ job: null, children: [] }),
              addBulk: async () => [],
              close: async () => {},
            };
          }

          const connection = opts.connection ?? moduleOptions.connection;
          if (!connection) {
            throw new Error(
              `GlideMQ: connection is required for FlowProducer "${opts.name}" when not in testing mode`,
            );
          }

          const { FlowProducer } = require('glide-mq');
          const fp = new FlowProducer({
            connection,
            prefix: moduleOptions.prefix,
          });
          closables.push(fp);
          return fp;
        },
        inject: [GLIDEMQ_MODULE_OPTIONS, GLIDEMQ_CLOSABLES],
      });

      exports.push(token);
    }

    return {
      module: GlideMQModule,
      providers,
      exports,
    };
  }

  static registerBroadcast(...options: RegisterBroadcastOptions[]): DynamicModule {
    const { providers, exports } = createBroadcastProviders(options);

    return {
      module: GlideMQModule,
      providers,
      exports,
    };
  }

  static registerProducer(...options: RegisterProducerOptions[]): DynamicModule {
    const { providers, exports } = createProducerProviders(options);

    return {
      module: GlideMQModule,
      providers,
      exports,
    };
  }


  async onApplicationShutdown(): Promise<void> {
    if (this.explorer) {
      await this.explorer.closeAll();
    }

    if (this.closables) {
      const ops = this.closables.map((c) => c.close());
      await Promise.allSettled(ops);
      this.closables.length = 0;
    }
  }
}
