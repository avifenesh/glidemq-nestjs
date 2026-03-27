# @glidemq/nestjs

[![npm](https://img.shields.io/npm/v/@glidemq/nestjs)](https://www.npmjs.com/package/@glidemq/nestjs)
[![license](https://img.shields.io/npm/l/@glidemq/nestjs)](https://github.com/avifenesh/glidemq-nestjs/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-glide--mq.dev-6366f1)](https://avifenesh.github.io/glide-mq.dev/)

NestJS module for [glide-mq](https://github.com/avifenesh/glide-mq) -- decorators, dependency injection, and lifecycle management for queues, workers, and broadcast.

Register queues and processors with decorators, inject them through the standard NestJS DI container, and let the module handle worker creation, event wiring, and graceful shutdown automatically. Pure DI module -- no HTTP routes, just decorators and providers.

> If glide-mq is useful to you, consider [giving it a star](https://github.com/avifenesh/glide-mq). It helps others discover the project.

**[Full documentation](https://avifenesh.github.io/glide-mq.dev/integrations/nestjs)** | **[Core docs](https://avifenesh.github.io/glide-mq.dev/guide/getting-started)**
## Why @glidemq/nestjs

- Use this when you want **decorator-based processors** (`@Processor`, `@BroadcastProcessor`) that auto-wire to workers on startup.
- Use this when you need to **inject queues, producers, and flow producers** into services via `@InjectQueue`, `@InjectProducer`, etc.
- Use this when your connection config lives in `ConfigService` and you need **async module configuration** with `forRootAsync`.
- Use this when you want **broadcast pub/sub with subject filtering** integrated into the NestJS lifecycle.
- Use this when you want **zero-boilerplate shutdown** -- all workers, queues, and connections close automatically via `OnApplicationShutdown`.

## Install

```bash
npm install @glidemq/nestjs glide-mq @nestjs/common @nestjs/core
```

Requires **glide-mq 0.13+** and **NestJS 10+**.

## Quick start

```typescript
// 1. AppModule -- configure connection and register a queue
import { Module } from '@nestjs/common';
import { GlideMQModule } from '@glidemq/nestjs';

@Module({
  imports: [
    GlideMQModule.forRoot({
      connection: { addresses: [{ host: 'localhost', port: 6379 }] },
    }),
    GlideMQModule.registerQueue({ name: 'emails' }),
  ],
  providers: [EmailProcessor, EmailService],
})
export class AppModule {}

// 2. EmailProcessor -- process jobs with a decorator
import { Processor, WorkerHost, OnWorkerEvent } from '@glidemq/nestjs';
import type { Job } from 'glide-mq';

@Processor('emails')
export class EmailProcessor extends WorkerHost {
  async process(job: Job) {
    await sendEmail(job.data.to, job.data.subject);
    return { sent: true };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} failed:`, err.message);
  }
}

// 3. EmailService -- inject the queue and add jobs
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@glidemq/nestjs';
import type { Queue } from 'glide-mq';

@Injectable()
export class EmailService {
  constructor(@InjectQueue('emails') private readonly queue: Queue) {}

  async send(to: string, subject: string) {
    await this.queue.add('send', { to, subject });
  }
}
```

## How it works

`GlideMQModule.forRoot()` (or `forRootAsync()`) registers a global module that holds the Valkey connection config. `registerQueue`, `registerFlowProducer`, `registerBroadcast`, and `registerProducer` each create a provider for the named resource, making it available for injection. Classes decorated with `@Processor` or `@BroadcastProcessor` are discovered at startup via NestJS's `DiscoveryService`, and the module creates the corresponding `Worker` or `BroadcastWorker` instances automatically. On application shutdown, all workers, queues, broadcast instances, and producers are closed via `Promise.allSettled`.

## Module methods

| Method | Description |
|--------|-------------|
| `GlideMQModule.forRoot(options)` | Global module with connection config. Accepts `connection`, `prefix`, and `testing`. |
| `GlideMQModule.forRootAsync(options)` | Async config via `useFactory`, `useClass`, or `useExisting`. Supports `imports` and `inject`. |
| `GlideMQModule.registerQueue(...opts)` | Register one or more queues. Accepts `name`, `connection`, `defaultJobOptions`, `queueOpts`. |
| `GlideMQModule.registerFlowProducer(...opts)` | Register one or more FlowProducers for DAG workflows. Accepts `name`, `connection`. |
| `GlideMQModule.registerBroadcast(...opts)` | Register one or more Broadcast instances. Accepts `name`, `connection`, `broadcastOpts`. |
| `GlideMQModule.registerProducer(...opts)` | Register one or more lightweight Producers (serverless-friendly). Accepts `name`, `connection`, `producerOpts`. |

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Processor(name \| options)` | Class | Mark a class as a queue processor. Extend `WorkerHost` and implement `process(job)`. |
| `@BroadcastProcessor(options)` | Class | Mark a class as a broadcast processor. Requires `name` and `subscription`. |
| `@InjectQueue(name)` | Constructor param | Inject a `Queue` instance registered with `registerQueue`. |
| `@InjectFlowProducer(name)` | Constructor param | Inject a `FlowProducer` instance registered with `registerFlowProducer`. |
| `@InjectBroadcast(name)` | Constructor param | Inject a `Broadcast` instance registered with `registerBroadcast`. |
| `@InjectProducer(name)` | Constructor param | Inject a `Producer` instance registered with `registerProducer`. |
| `@OnWorkerEvent(event)` | Method | Listen to worker lifecycle events: `completed`, `failed`, `active`, `stalled`, `error`, `drained`, `closing`, `closed`. |
| `@QueueEventsListener(name)` | Class | Mark a class as a server-side queue events listener. Extend `QueueEventsHost`. |
| `@OnQueueEvent(event)` | Method | Listen to queue events: `added`, `completed`, `failed`, `active`, `progress`, `stalled`, `retrying`, `removed`, `drained`, `promoted`. |

## Async configuration

```typescript
import { ConfigModule, ConfigService } from '@nestjs/config';

GlideMQModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    connection: {
      addresses: [{ host: config.get('VALKEY_HOST'), port: config.get('VALKEY_PORT') }],
    },
  }),
  inject: [ConfigService],
})
```

`forRootAsync` also supports `useClass` and `useExisting` -- implement the `GlideMQOptionsFactory` interface with a `createGlideMQOptions()` method.

## Broadcast

Broadcast enables pub/sub fan-out where each subscription gets its own copy of every published message. Use `subjects` for client-side filtering.

```typescript
import { BroadcastProcessor, WorkerHost } from '@glidemq/nestjs';
import type { Job } from 'glide-mq';

@BroadcastProcessor({
  name: 'events',
  subscription: 'order-handler',
  subjects: ['orders.*'],
  concurrency: 5,
})
export class OrderEventsProcessor extends WorkerHost {
  async process(job: Job) {
    console.log('Order event:', job.data);
  }
}
```

Publish via `@InjectBroadcast`:

```typescript
@Injectable()
export class EventPublisher {
  constructor(@InjectBroadcast('events') private readonly broadcast: Broadcast) {}

  async publishOrderCreated(orderId: string) {
    await this.broadcast.publish('orders.created', { orderId });
  }
}
```

## Features

- **FlowProducer and DAG workflows** -- register a FlowProducer to build directed acyclic graphs of dependent jobs across queues.
- **Default job options** -- set `defaultJobOptions` on `registerQueue` (attempts, backoff, TTL, removeOnComplete) and they apply to every `add()` and `addBulk()` call. Per-job options override.
- **Step jobs** -- use `moveToDelayed` and `moveToWaitingChildren` inside processors for multi-step workflows.
- **Broadcast with subject filtering** -- `@BroadcastProcessor` supports `subjects` globs so each subscription only processes matching messages.
- **Producer (serverless-friendly)** -- `registerProducer` provides a lightweight alternative to `Queue` with no EventEmitter overhead. Supports custom `serializer` and `compression` options.
- **Custom serializers** -- pass a `serializer` via `queueOpts` or `producerOpts` for msgpack, protobuf, or any custom encoding.
- **LIFO mode and custom job IDs** -- available through `defaultJobOptions` or per-job options on the injected Queue.
- **Graceful shutdown** -- all workers, queues, producers, broadcasts, FlowProducers, and QueueEvents are closed automatically via `OnApplicationShutdown`.

## Testing

No Valkey needed. Pass `testing: true` to use in-memory `TestQueue` and `TestWorker` from glide-mq:

```typescript
import { Test } from '@nestjs/testing';

const moduleRef = await Test.createTestingModule({
  imports: [
    GlideMQModule.forRoot({ testing: true }),
    GlideMQModule.registerQueue({ name: 'emails' }),
  ],
  providers: [EmailProcessor, EmailService],
}).compile();

const service = moduleRef.get(EmailService);
await service.send('test@example.com', 'Hello');
```

## AI-native features (glide-mq 0.13+)

glide-mq 0.13 introduces AI-native orchestration primitives. All of these are accessible through the NestJS module via injected queues and workers:

- **Token/cost tracking** -- call `reportUsage()` in processors and query `getFlowUsage()` on parent jobs for per-flow token and cost accounting
- **Real-time streaming** -- use `job.stream()` in processors and `readStream()` or SSE in controllers to stream LLM output to clients
- **Human-in-the-loop** -- `suspend()` and `signal()` for pausing jobs pending human approval
- **Model failover** -- fallback chains for ordered model/provider alternatives on failure
- **Budget caps** -- flow-level token and cost limits via budget middleware
- **Rate limiting** -- dual-axis RPM + TPM rate limiting for LLM API compliance
- **Vector search** -- `createJobIndex()` and `vectorSearch()` for semantic search over jobs

## Limitations

- Requires NestJS 10+ and Node.js 20+.
- `@BroadcastProcessor` classes are skipped in testing mode -- `BroadcastWorker` does not have a test double.
- `@QueueEventsListener` is skipped entirely in testing mode -- `QueueEvents` requires a live Valkey connection.
- `registerBroadcast` and `registerProducer` do not support `testing: true` -- they always require a connection.

## Token helpers

For advanced DI scenarios (custom providers, testing overrides), use the token functions to reference the same injection tokens the decorators use:

`getQueueToken(name)`, `getFlowProducerToken(name)`, `getBroadcastToken(name)`, `getProducerToken(name)`, `getWorkerToken(name)`, `getQueueEventsToken(name)`.

## Ecosystem

| Package | Description |
|---------|-------------|
| [glide-mq](https://github.com/avifenesh/glide-mq) | AI-native queue library -- orchestration, streaming, failover, budget caps |
| [@glidemq/hono](https://github.com/avifenesh/glidemq-hono) | Hono middleware -- REST API + SSE events |
| [@glidemq/fastify](https://github.com/avifenesh/glidemq-fastify) | Fastify plugin -- REST API + SSE events |
| [@glidemq/hapi](https://github.com/avifenesh/glidemq-hapi) | Hapi plugin -- REST API + SSE events |
| [@glidemq/dashboard](https://github.com/avifenesh/glidemq-dashboard) | Express middleware -- web UI dashboard |
| **@glidemq/nestjs** | NestJS module -- decorators, DI, lifecycle management (you are here) |
| [examples](https://github.com/avifenesh/glidemq-examples) | Framework integrations and use-case examples |

## Contributing

Issues and pull requests: [github.com/avifenesh/glidemq-nestjs](https://github.com/avifenesh/glidemq-nestjs)

## License

Apache-2.0
