import { SetMetadata } from '@nestjs/common';
import { WORKER_EVENT_METADATA } from '../glidemq.constants';

export type WorkerEvent =
  | 'completed'
  | 'failed'
  | 'error'
  | 'stalled'
  | 'closing'
  | 'closed'
  | 'active'
  | 'drained';

export const OnWorkerEvent = (event: WorkerEvent): MethodDecorator =>
  SetMetadata(WORKER_EVENT_METADATA, event);
