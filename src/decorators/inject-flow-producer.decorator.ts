import { Inject } from '@nestjs/common';
import { getFlowProducerToken } from '../glidemq.constants';

export const InjectFlowProducer = (name: string): ParameterDecorator =>
  Inject(getFlowProducerToken(name));
