export const GLIDEMQ_MODULE_OPTIONS = 'GLIDEMQ_MODULE_OPTIONS';

export const QUEUE_TOKEN_PREFIX = 'GLIDEMQ_QUEUE_';
export const WORKER_TOKEN_PREFIX = 'GLIDEMQ_WORKER_';
export const FLOW_PRODUCER_TOKEN_PREFIX = 'GLIDEMQ_FLOW_PRODUCER_';
export const QUEUE_EVENTS_TOKEN_PREFIX = 'GLIDEMQ_QUEUE_EVENTS_';

export const PROCESSOR_METADATA = 'GLIDEMQ_PROCESSOR';
export const WORKER_EVENT_METADATA = 'GLIDEMQ_WORKER_EVENT';
export const QUEUE_EVENTS_LISTENER_METADATA = 'GLIDEMQ_QUEUE_EVENTS_LISTENER';
export const QUEUE_EVENT_METADATA = 'GLIDEMQ_QUEUE_EVENT';

export function getQueueToken(name: string): string {
  return `${QUEUE_TOKEN_PREFIX}${name}`;
}

export function getWorkerToken(name: string): string {
  return `${WORKER_TOKEN_PREFIX}${name}`;
}

export function getFlowProducerToken(name: string): string {
  return `${FLOW_PRODUCER_TOKEN_PREFIX}${name}`;
}

export function getQueueEventsToken(name: string): string {
  return `${QUEUE_EVENTS_TOKEN_PREFIX}${name}`;
}
