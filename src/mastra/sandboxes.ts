import { HARNESS_APP_ID_KEY } from './config.js';
import type { AppMachine, AppMachineFactory } from './config.js';

/** Uma máquina por app. Estado da instância, não do módulo: dois harness no mesmo processo não dividem máquinas. */
export class AppSandboxes {
  private readonly factory: AppMachineFactory;
  private readonly machines = new Map<string, AppMachine>();

  constructor(factory: AppMachineFactory) {
    this.factory = factory;
  }

  /** A máquina do app, criada na primeira vez e reusada depois. Não liga a máquina. */
  forApp(appId: string): AppMachine {
    const existing = this.machines.get(appId);
    if (existing) return existing;
    const created = this.factory({ appId });
    this.machines.set(appId, created);
    return created;
  }

  /** Pausa (`sandbox.stop()`) cada máquina criada e esquece todas. Idempotente. */
  async stopAll(): Promise<void> {
    const open = [...this.machines.values()];
    this.machines.clear();
    const results = await Promise.allSettled(open.map(({ sandbox }) => sandbox.stop?.()));
    const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (failures.length > 0) throw new AggregateError(failures, 'Failed to stop some app sandboxes');
  }
}

/** Lê o app do RequestContext. Sem app, lança erro: nunca divide uma máquina "sem dono". */
export function appIdFrom(requestContext: { get(key: string): unknown }): string {
  const appId = requestContext.get(HARNESS_APP_ID_KEY);
  if (typeof appId !== 'string' || appId === '') {
    throw new Error(
      `A request without an app id fails instead of sharing a sandbox: set "${HARNESS_APP_ID_KEY}" in the request context.`,
    );
  }
  return appId;
}
