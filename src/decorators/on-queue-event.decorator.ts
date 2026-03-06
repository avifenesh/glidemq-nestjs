import { SetMetadata } from '@nestjs/common';
import { QUEUE_EVENT_METADATA } from '../glidemq.constants';

export type QueueEventType =
  | 'completed'
  | 'failed'
  | 'active'
  | 'delayed'
  | 'waiting'
  | 'progress'
  | 'stalled';

export const OnQueueEvent = (event: QueueEventType): MethodDecorator =>
  SetMetadata(QUEUE_EVENT_METADATA, event);
