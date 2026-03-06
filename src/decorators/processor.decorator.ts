import { SetMetadata } from '@nestjs/common';
import { PROCESSOR_METADATA } from '../glidemq.constants';
import type { ProcessorOptions } from '../glidemq.interfaces';

export function Processor(name: string): ClassDecorator;
export function Processor(options: ProcessorOptions): ClassDecorator;
export function Processor(nameOrOptions: string | ProcessorOptions): ClassDecorator {
  const options: ProcessorOptions =
    typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;
  return SetMetadata(PROCESSOR_METADATA, options);
}
