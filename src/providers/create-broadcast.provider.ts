import type { Provider } from '@nestjs/common';
import { GLIDEMQ_MODULE_OPTIONS, GLIDEMQ_CLOSABLES, getBroadcastToken } from '../glidemq.constants';
import type { GlideMQModuleOptions, RegisterBroadcastOptions } from '../glidemq.interfaces';

interface Closable {
  close(): Promise<void>;
}

export function createBroadcastProviders(
  options: RegisterBroadcastOptions[],
): { providers: Provider[]; exports: string[] } {
  const providers: Provider[] = [];
  const exports: string[] = [];

  for (const opts of options) {
    const token = getBroadcastToken(opts.name);

    providers.push({
      provide: token,
      useFactory: (moduleOptions: GlideMQModuleOptions, closables: Closable[]) => {
        const connection = opts.connection ?? moduleOptions.connection;
        if (!connection) {
          throw new Error(
            `GlideMQ: connection is required for Broadcast "${opts.name}" when not in testing mode`,
          );
        }

        const { Broadcast } = require('glide-mq');
        const broadcast = new Broadcast(opts.name, {
          connection,
          prefix: moduleOptions.prefix,
          ...opts.broadcastOpts,
        });
        closables.push(broadcast);
        return broadcast;
      },
      inject: [GLIDEMQ_MODULE_OPTIONS, GLIDEMQ_CLOSABLES],
    });

    exports.push(token);
  }

  return { providers, exports };
}
