import type { Job } from 'glide-mq';

export abstract class WorkerHost {
  abstract process(job: Job): Promise<any>;
}
