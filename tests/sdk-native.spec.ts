import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { Queue } from 'glide-mq';
import { GlideMQModule, getQueueToken } from '../src';

describe('GlideMQ 0.20 native SDK compatibility', () => {
  it('injects a production Queue with bounded scheduler inventory', async () => {
    const name = `nestjs-native-compat-${process.pid}`;
    const module = await Test.createTestingModule({
      imports: [
        GlideMQModule.forRoot({
          connection: {
            addresses: [{
              host: process.env.VALKEY_HOST ?? '127.0.0.1',
              port: Number(process.env.VALKEY_PORT ?? 6379),
            }],
          },
        }),
        GlideMQModule.registerQueue({ name }),
      ],
    }).compile();
    const queue = module.get<Queue>(getQueueToken(name));
    try {
      expect(queue).toBeInstanceOf(Queue);
      await queue.upsertJobScheduler('one', { every: 60_000 });
      await queue.upsertJobScheduler('two', { every: 120_000 });
      expect(await queue.getRepeatableJobsBounded(2)).toHaveLength(2);
      await expect(queue.getRepeatableJobsBounded(1)).rejects.toThrow();
      await expect(queue.getRepeatableJobsBounded(0)).rejects.toThrow();
      expect(await queue.getRepeatableJobs()).toHaveLength(2);
    } finally {
      try {
        await queue.obliterate({ force: true });
      } finally {
        await module.close();
      }
    }
  });
});
