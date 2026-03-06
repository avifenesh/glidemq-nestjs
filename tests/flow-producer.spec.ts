import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { GlideMQModule, InjectFlowProducer, getFlowProducerToken } from '../src';

@Injectable()
class PipelineService {
  constructor(@InjectFlowProducer('pipelines') public readonly flowProducer: any) {}
}

describe('FlowProducer registration', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should inject a mock flow producer in testing mode', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerFlowProducer({ name: 'pipelines' }),
      ],
      providers: [PipelineService],
    }).compile();

    const service = moduleRef.get(PipelineService);
    expect(service.flowProducer).toBeDefined();
    expect(typeof service.flowProducer.add).toBe('function');
    expect(typeof service.flowProducer.addBulk).toBe('function');
    expect(typeof service.flowProducer.close).toBe('function');
  });

  it('should allow calling mock flow producer methods', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerFlowProducer({ name: 'pipelines' }),
      ],
    }).compile();

    const fp = moduleRef.get(getFlowProducerToken('pipelines'));
    const result = await fp.add({
      name: 'parent',
      queueName: 'tasks',
      data: {},
      children: [],
    });
    expect(result).toEqual({ job: null, children: [] });
  });

  it('should register multiple flow producers', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({ testing: true }),
        GlideMQModule.registerFlowProducer({ name: 'flow-a' }),
        GlideMQModule.registerFlowProducer({ name: 'flow-b' }),
      ],
    }).compile();

    const fpA = moduleRef.get(getFlowProducerToken('flow-a'));
    const fpB = moduleRef.get(getFlowProducerToken('flow-b'));
    expect(fpA).toBeDefined();
    expect(fpB).toBeDefined();
    expect(fpA).not.toBe(fpB);
  });
});
