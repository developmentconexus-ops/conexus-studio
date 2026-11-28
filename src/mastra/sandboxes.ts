import type { AppMachine, AppMachineFactory } from './config.js';

/** Uma máquina por app. Estado da instância, não do módulo: dois harness no mesmo processo não dividem máquinas. */
export class AppSandboxes {
  constructor(factory: AppMachineFactory) {
    throw new Error('not implemented');
  }

  /** A máquina do app, criada na primeira vez e reusada depois. Não liga a máquina. */
  forApp(appId: string): AppMachine {
    throw new Error('not implemented');
  }

  /** Pausa (`sandbox.stop()`) cada máquina criada e esquece todas. Idempotente. */
  async stopAll(): Promise<void> {
    throw new Error('not implemented');
  }
}

/** Lê o app do RequestContext. Sem app, lança erro: nunca divide uma máquina "sem dono". */
export function appIdFrom(requestContext: { get(key: string): unknown }): string {
  throw new Error('not implemented');
}
