import { Module, type DynamicModule, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AccountDeletionService, type ErasureExecutor } from './account-deletion.service.js';
import { AccountDeletionController } from './account-deletion.controller.js';

class DeletionWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running: Promise<unknown> | null = null;
  constructor(private service: AccountDeletionService, private executor: ErasureExecutor, private restoreGate: () => Promise<void>) {}
  private sweep() {
    if (this.running) return;
    this.running = this.service.processDue(this.executor).then(result => {
      if (result.blocked) console.warn('[AccountDeletion] blocked requests:', result.blocked);
    }).catch(() => console.warn('[AccountDeletion] sweep unavailable')).finally(() => { this.running = null; });
  }
  async onModuleInit() { await this.restoreGate(); if (!this.service.capabilities().available) return; this.sweep(); this.timer = setInterval(() => this.sweep(), 60000); this.timer.unref(); }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.running; }
}

/** Explicit composition: do not enable requests from an env flag alone while
 * erasure/processor/restore adapters are absent. Not in production AppModule yet.
 */
@Module({})
export class AccountDeletionModule {
  static register(service: AccountDeletionService, executor: ErasureExecutor, restoreGate: () => Promise<void>): DynamicModule {
    if (!executor?.erase || !executor?.forgetRestoreMarker || typeof restoreGate !== 'function') throw Error('complete_erasure_executor_required');
    return {
      module: AccountDeletionModule,
      controllers: [AccountDeletionController],
      providers: [{ provide: AccountDeletionService, useValue: service }, { provide: DeletionWorker, useFactory: () => new DeletionWorker(service, executor, restoreGate) }]
    };
  }
}
