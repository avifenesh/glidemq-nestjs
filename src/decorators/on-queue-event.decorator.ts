import { SetMetadata } from '@nestjs/common';
import { QUEUE_EVENT_METADATA } from '../glidemq.constants';

export type QueueEventType =
  | 'added'
  | 'completed'
  | 'failed'
  | 'active'
  | 'delayed'
  | 'progress'
  | 'stalled'
  | 'retrying'
  | 'removed'
  | 'drained';

export const OnQueueEvent = (event: QueueEventType): MethodDecorator =>
  SetMetadata(QUEUE_EVENT_METADATA, event);
