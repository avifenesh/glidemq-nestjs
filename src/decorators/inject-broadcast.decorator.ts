import { Inject } from '@nestjs/common';
import { getBroadcastToken } from '../glidemq.constants';

export const InjectBroadcast = (name: string): ParameterDecorator =>
  Inject(getBroadcastToken(name));
