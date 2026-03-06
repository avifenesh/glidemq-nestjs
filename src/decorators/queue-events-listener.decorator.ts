import { SetMetadata } from '@nestjs/common';
import { QUEUE_EVENTS_LISTENER_METADATA } from '../glidemq.constants';

export const QueueEventsListener = (name: string): ClassDecorator =>
  SetMetadata(QUEUE_EVENTS_LISTENER_METADATA, name);
