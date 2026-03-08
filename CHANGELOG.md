# Changelog

## 0.1.3

- Republish with glide-mq 0.9.0 lockfile

## 0.1.2

- Require glide-mq >=0.9.0
- Rewrite README for adoption and discoverability
- Add @glidemq/hapi to ecosystem cross-references
- Add star callout

## 0.1.1

- Add `defaultJobOptions` support per queue
- Fix `QueueEventType` export

## 0.1.0

Initial release.

- `GlideMQModule` with `forRoot()` / `forRootAsync()` configuration
- `registerQueue`, `registerFlowProducer`, `registerBroadcast`, `registerProducer`
- 9 decorators: `@Processor`, `@BroadcastProcessor`, `@InjectQueue`, `@InjectFlowProducer`, `@InjectBroadcast`, `@InjectProducer`, `@OnWorkerEvent`, `@OnQueueEvent`, `@QueueEventsListener`
- `WorkerHost` and `QueueEventsHost` base classes
- Automatic processor discovery and worker wiring
- Graceful shutdown via `OnApplicationShutdown`
- Testing mode with `testing: true` (no Valkey needed)
