import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Module, Injectable, Inject } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  GlideMQModule,
  InjectQueue,
  Processor,
  WorkerHost,
  OnWorkerEvent,
  getQueueToken,
} from '../src';
import type { Job } from 'glide-mq';

// --- Email feature ---

@Processor('emails')
class EmailProcessor extends WorkerHost {
  public sent: string[] = [];
  async process(job: Job) {
    this.sent.push(job.data.to);
    return { delivered: true };
  }
}

@Injectable()
class EmailService {
  constructor(@InjectQueue('emails') private readonly queue: any) {}
  async send(to: string) {
    return this.queue.add('send', { to });
  }
}

@Module({
  imports: [GlideMQModule.registerQueue({ name: 'emails' })],
  providers: [EmailProcessor, EmailService],
  exports: [EmailService],
})
class EmailModule {}

// --- Notification feature ---

@Processor('notifications')
class NotificationProcessor extends WorkerHost {
  public pushed: string[] = [];
  async process(job: Job) {
    this.pushed.push(job.data.message);
    return { notified: true };
  }
}

@Injectable()
class NotificationService {
  constructor(@InjectQueue('notifications') private readonly queue: any) {}
  async push(message: string) {
    return this.queue.add('push', { message });
  }
}

@Module({
  imports: [GlideMQModule.registerQueue({ name: 'notifications' })],
  providers: [NotificationProcessor, NotificationService],
  exports: [NotificationService],
})
class NotificationModule {}

// --- Orchestrator that uses both ---

@Injectable()
class OrchestratorService {
  constructor(
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(NotificationService) private readonly notificationService: NotificationService,
  ) {}

  async onboardUser(email: string) {
    await this.emailService.send(email);
    await this.notificationService.push(`New user: ${email}`);
  }
}

@Module({
  imports: [
    GlideMQModule.forRoot({ testing: true }),
    EmailModule,
    NotificationModule,
  ],
  providers: [OrchestratorService],
})
class AppModule {}

describe('Feature modules pattern', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('should support multiple feature modules with separate queues and processors', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const orchestrator = moduleRef.get(OrchestratorService);
    await orchestrator.onboardUser('alice@example.com');

    await new Promise((r) => setTimeout(r, 100));

    const emailProc = moduleRef.get(EmailProcessor);
    const notifProc = moduleRef.get(NotificationProcessor);

    expect(emailProc.sent).toEqual(['alice@example.com']);
    expect(notifProc.pushed).toEqual(['New user: alice@example.com']);
  });

  it('should keep queues isolated between feature modules', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const emailQueue = moduleRef.get(getQueueToken('emails'));
    const notifQueue = moduleRef.get(getQueueToken('notifications'));

    expect(emailQueue.name).toBe('emails');
    expect(notifQueue.name).toBe('notifications');
    expect(emailQueue).not.toBe(notifQueue);

    await emailQueue.add('test', { to: 'bob@test.com' });
    await new Promise((r) => setTimeout(r, 100));

    // Only email processor should have processed it
    const emailProc = moduleRef.get(EmailProcessor);
    const notifProc = moduleRef.get(NotificationProcessor);
    expect(emailProc.sent).toEqual(['bob@test.com']);
    expect(notifProc.pushed).toEqual([]);
  });
});
