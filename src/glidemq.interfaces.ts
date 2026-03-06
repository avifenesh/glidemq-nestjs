import type { ModuleMetadata, Type } from '@nestjs/common';
import type { ConnectionOptions, WorkerOptions, JobOptions, QueueOptions } from 'glide-mq';

export interface GlideMQModuleOptions {
  connection?: ConnectionOptions;
  prefix?: string;
  testing?: boolean;
}

export interface GlideMQOptionsFactory {
  createGlideMQOptions(): GlideMQModuleOptions | Promise<GlideMQModuleOptions>;
}

export interface GlideMQModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (...args: any[]) => GlideMQModuleOptions | Promise<GlideMQModuleOptions>;
  useClass?: Type<GlideMQOptionsFactory>;
  useExisting?: Type<GlideMQOptionsFactory>;
  inject?: any[];
  isGlobal?: boolean;
}

export interface RegisterQueueOptions {
  name: string;
  /** Override root connection for this queue. */
  connection?: ConnectionOptions;
  /** Default job options applied to all jobs added to this queue. */
  defaultJobOptions?: JobOptions;
  /** Queue-level options (compression, serializer, DLQ, etc). */
  queueOpts?: Partial<Omit<QueueOptions, 'connection' | 'client' | 'prefix'>>;
}

export interface RegisterFlowProducerOptions {
  name: string;
  /** Override root connection for this flow producer. */
  connection?: ConnectionOptions;
}

export interface ProcessorOptions {
  name: string;
  concurrency?: number;
  workerOpts?: Partial<Omit<WorkerOptions, 'connection' | 'client' | 'commandClient'>>;
}
