import { Inject } from '@nestjs/common';
import { getQueueToken } from '../glidemq.constants';

export const InjectQueue = (name: string): ParameterDecorator => Inject(getQueueToken(name));
