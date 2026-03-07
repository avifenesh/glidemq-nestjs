import { Inject } from '@nestjs/common';
import { getProducerToken } from '../glidemq.constants';

export const InjectProducer = (name: string): ParameterDecorator =>
  Inject(getProducerToken(name));
