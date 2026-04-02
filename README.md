# @glidemq/nestjs

[![npm](https://img.shields.io/npm/v/@glidemq/nestjs)](https://www.npmjs.com/package/@glidemq/nestjs)
[![license](https://img.shields.io/npm/l/@glidemq/nestjs)](https://github.com/avifenesh/glidemq-nestjs/blob/main/LICENSE)

NestJS module for [glide-mq](https://github.com/avifenesh/glide-mq) - type-safe decorators and DI for high-performance queues with AI orchestration.

## Why

- **Decorator-based processors** - `@Processor` and `@BroadcastProcessor` auto-wire workers on startup
- **Full DI integration** - `@InjectQueue`, `@InjectFlowProducer`, `@InjectBroadcast`, `@InjectProducer` work with NestJS's container
- **Zero-boilerplate shutdown** - all workers, queues, and connections close automatically via `OnApplicationShutdown`

## Install

```bash
npm install @glidemq/nestjs glide-mq @nestjs/common @nestjs/core
```

Requires **glide-mq >= 0.14.0** and **NestJS 10+**.

## Quick start

```typescript
// app.module.ts
import { Module } from "@nestjs/common";
import { GlideMQModule } from "@glidemq/nestjs";

@Module({
  imports: [
    GlideMQModule.forRoot({
      connection: { addresses: [{ host: "localhost", port: 6379 }] },
    }),
    GlideMQModule.registerQueue({ name: "emails" }),
  ],
  providers: [EmailProcessor, EmailService],
})
export class AppModule {}

// email.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from "@glidemq/nestjs";
import type { Job } from "glide-mq";

@Processor("emails")
export class EmailProcessor extends WorkerHost {
  async process(job: Job) {
    await sendEmail(job.data.to, job.data.subject);
    return { sent: true };
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} failed:`, err.message);
  }
}

// email.service.ts
import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@glidemq/nestjs";
import type { Queue } from "glide-mq";

@Injectable()
export class EmailService {
  constructor(@InjectQueue("emails") private readonly queue: Queue) {}

  async send(to: string, subject: string) {
    await this.queue.add("send", { to, subject });
  }
}
```

## AI-native features

glide-mq 0.14+ provides AI orchestration primitives - token/cost tracking, real-time streaming, human-in-the-loop suspend/signal, model failover chains, budget caps, dual-axis rate limiting, vector search, and rolling usage summaries. All are accessible through the injected Queue, Worker, FlowProducer, Broadcast, and QueueEvents instances in your NestJS services.

### Usage tracking and streaming

```typescript
// llm.processor.ts
import { Processor, WorkerHost } from "@glidemq/nestjs";
import type { Job } from "glide-mq";

@Processor("llm-tasks")
export class LlmProcessor extends WorkerHost {
  async process(job: Job) {
    const response = await callLlm(job.data.prompt);

    // Stream reasoning and content chunks back in real time
    for (const chunk of response.reasoningChunks) {
      await job.streamChunk("reasoning", chunk);
    }
    for (const chunk of response.contentChunks) {
      await job.streamChunk("content", chunk);
    }
    await job.streamChunk("done");

    // Report token usage and cost
    await job.reportUsage({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      tokens: {
        input: response.inputTokens,
        output: response.outputTokens,
        reasoning: response.reasoningTokens,
      },
      costs: { total: response.cost },
      costUnit: "usd",
    });

    return { result: response.text };
  }
}
```

### Flow-level budgets

```typescript
// orchestration.service.ts
import { Injectable } from "@nestjs/common";
import { InjectFlowProducer } from "@glidemq/nestjs";
import type { FlowProducer } from "glide-mq";

@Injectable()
export class OrchestrationService {
  constructor(
    @InjectFlowProducer("llm-flow") private readonly flow: FlowProducer,
  ) {}

  async runChain(prompt: string) {
    await this.flow.add(
      {
        name: "summarize",
        queueName: "llm-tasks",
        data: { prompt },
        children: [
          { name: "research", queueName: "llm-tasks", data: { prompt } },
          { name: "draft", queueName: "llm-tasks", data: { prompt } },
        ],
      },
      {
        budget: {
          maxTotalTokens: 10000,
          tokenWeights: { reasoning: 4, cachedInput: 0.25 },
          maxTotalCost: 0.5,
          costUnit: "usd",
          onExceeded: "fail",
        },
      },
    );
  }
}
```

The budget is enforced across all jobs in the flow. When the weighted token total or cost cap is hit, remaining jobs fail (or pause, depending on `onExceeded`). See the [glide-mq docs](https://github.com/avifenesh/glide-mq) for the full API.

### Queue-wide usage summaries

```typescript
import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@glidemq/nestjs";
import type { Queue } from "glide-mq";

@Injectable()
export class UsageService {
  constructor(@InjectQueue("llm-tasks") private readonly queue: Queue) {}

  async summary() {
    return this.queue.getUsageSummary({ windowMs: 60_000 });
  }
}
```

Use the instance method for queue-local summaries, or `Queue.getUsageSummary(...)` when you want to aggregate across multiple queues.

## Configuration

| Method | Description |
|--------|-------------|
| `GlideMQModule.forRoot(opts)` | Global module with connection config |
| `GlideMQModule.forRootAsync(opts)` | Async config via `useFactory`, `useClass`, or `useExisting` |
| `GlideMQModule.registerQueue(...opts)` | Register queues for injection |
| `GlideMQModule.registerFlowProducer(...opts)` | Register FlowProducers for DAG workflows |
| `GlideMQModule.registerBroadcast(...opts)` | Register Broadcast instances for pub/sub |
| `GlideMQModule.registerProducer(...opts)` | Register lightweight Producers (serverless) |

Decorators: `@Processor`, `@BroadcastProcessor`, `@InjectQueue`, `@InjectFlowProducer`, `@InjectBroadcast`, `@InjectProducer`, `@OnWorkerEvent`, `@QueueEventsListener`, `@OnQueueEvent`

## Testing

Pass `testing: true` to use in-memory `TestQueue`/`TestWorker` - no Valkey required:

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [
    GlideMQModule.forRoot({ testing: true }),
    GlideMQModule.registerQueue({ name: "emails" }),
  ],
  providers: [EmailProcessor, EmailService],
}).compile();
const service = moduleRef.get(EmailService);
await service.send("test@example.com", "Hello");
```

## Limitations

- Requires NestJS 10+ and Node.js 20+.
- `@BroadcastProcessor` and `@QueueEventsListener` are skipped in testing mode.
- `registerBroadcast` and `registerProducer` always require a live connection (no testing mode).

## Links

- [glide-mq](https://github.com/avifenesh/glide-mq) - core library
- [Full documentation](https://glidemq.dev/integrations/nestjs)
- [Issues](https://github.com/avifenesh/glidemq-nestjs/issues)
- [@glidemq/hono](https://github.com/avifenesh/glidemq-hono) | [@glidemq/fastify](https://github.com/avifenesh/glidemq-fastify) | [@glidemq/hapi](https://github.com/avifenesh/glidemq-hapi) | [@glidemq/dashboard](https://github.com/avifenesh/glidemq-dashboard)

## License

[Apache-2.0](./LICENSE)
