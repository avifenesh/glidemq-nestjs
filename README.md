# @glidemq/nestjs

NestJS module for [glide-mq](https://github.com/avifenesh/glide-mq) - decorators, dependency injection, and lifecycle management for queues and workers.

```bash
npm install @glidemq/nestjs glide-mq
```

## Quick Start

### 1. Import the module

```typescript
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
```

### 2. Create a processor

```typescript
import { Processor, WorkerHost, OnWorkerEvent } from '@glidemq/nestjs';
import type { Job } from 'glide-mq';

@Processor('emails')
export class EmailProcessor extends WorkerHost {
  async process(job: Job) {
    console.log(`Sending email to ${job.data.to}`);
    return { sent: true };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} failed:`, err.message);
  }
}
```

### 3. Inject and use queues

```typescript
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

## API

### Module methods

| Method | Description |
|--------|-------------|
| `GlideMQModule.forRoot(options)` | Global module with connection config |
| `GlideMQModule.forRootAsync(options)` | Async config (e.g., from ConfigService) |
| `GlideMQModule.registerQueue({ name })` | Register a queue for injection |
| `GlideMQModule.registerFlowProducer({ name })` | Register a FlowProducer for injection |

### Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@InjectQueue(name)` | Parameter | Inject a Queue instance |
| `@InjectFlowProducer(name)` | Parameter | Inject a FlowProducer instance |
| `@Processor(name)` | Class | Mark a class as a queue processor |
| `@OnWorkerEvent(event)` | Method | Listen to worker events (completed, failed, etc.) |
| `@QueueEventsListener(name)` | Class | Mark a class as a QueueEvents listener |
| `@OnQueueEvent(event)` | Method | Listen to queue events |

### Async configuration

```typescript
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

### FlowProducer

```typescript
import { InjectFlowProducer } from '@glidemq/nestjs';
import type { FlowProducer } from 'glide-mq';

@Injectable()
export class PipelineService {
  constructor(@InjectFlowProducer('workflows') private readonly flow: FlowProducer) {}
}
```

### Testing

No Valkey needed - uses in-memory TestQueue/TestWorker from glide-mq:

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [
    GlideMQModule.forRoot({ testing: true }),
    GlideMQModule.registerQueue({ name: 'emails' }),
  ],
  providers: [EmailProcessor, EmailService],
}).compile();
```

## Ecosystem

| Package | Description |
|---------|-------------|
| [glide-mq](https://github.com/avifenesh/glide-mq) | Core queue library |
| [@glidemq/hono](https://github.com/avifenesh/glidemq-hono) | Hono middleware - REST API + SSE events |
| [@glidemq/dashboard](https://github.com/avifenesh/glidemq-dashboard) | Express middleware - web UI dashboard |
| [@glidemq/nestjs](https://github.com/avifenesh/glidemq-nestjs) | NestJS module (you are here) |
| [@glidemq/speedkey](https://github.com/avifenesh/speedkey) | Valkey GLIDE client with native NAPI bindings |
| [examples](https://github.com/avifenesh/glidemq-examples) | Framework integrations and use-case examples |

## Requirements

- Node.js 20+
- NestJS 10+
- Valkey 7.0+ or Redis 7.0+ (except when using `testing: true`)

## License

Apache-2.0
