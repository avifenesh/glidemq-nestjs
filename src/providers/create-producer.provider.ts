import type { Provider } from '@nestjs/common';
import {
  GLIDEMQ_MODULE_OPTIONS,
  getProducerToken,
} from '../glidemq.constants';
import type { GlideMQModuleOptions, RegisterProducerOptions } from '../glidemq.interfaces';
import { GLIDEMQ_CLOSABLES } from '../glidemq.module';

interface Closable {
  close(): Promise<void>;
}

export function createProducerProviders(options: RegisterProducerOptions[]): {
  providers: Provider[];
  exports: string[];
} {
  const providers: Provider[] = [];
  const exports: string[] = [];

  for (const opts of options) {
    const token = getProducerToken(opts.name);

    providers.push({
      provide: token,
      useFactory: (moduleOptions: GlideMQModuleOptions, closables: Closable[]) => {
        const connection = opts.connection ?? moduleOptions.connection;
        if (!connection) {
          throw new Error(
            `GlideMQ: connection is required for Producer "${opts.name}" when not in testing mode`,
          );
        }

        const { Producer } = require('glide-mq');
        const producer = new Producer(opts.name, {
          connection,
          prefix: moduleOptions.prefix,
          ...opts.producerOpts,
        });
        closables.push(producer);
        return producer;
      },
      inject: [GLIDEMQ_MODULE_OPTIONS, GLIDEMQ_CLOSABLES],
    });

    exports.push(token);
  }

  return { providers, exports };
}
