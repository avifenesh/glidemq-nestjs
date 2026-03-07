import { SetMetadata } from '@nestjs/common';
import { BROADCAST_PROCESSOR_METADATA } from '../glidemq.constants';
import type { BroadcastProcessorOptions } from '../glidemq.interfaces';

export function BroadcastProcessor(options: BroadcastProcessorOptions): ClassDecorator {
  return SetMetadata(BROADCAST_PROCESSOR_METADATA, options);
}
