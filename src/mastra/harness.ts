import type { ConexusHarnessConfig, HarnessMastraArgs } from './config.js';

export class ConexusHarness {
  constructor(config: ConexusHarnessConfig) {
    throw new Error('not implemented');
  }

  /** Monta o Construtor (agente + controller) e o auth. Uma vez só: a segunda chamada lança erro. */
  async prepare(): Promise<HarnessMastraArgs> {
    throw new Error('not implemented');
  }

  /** Depois do `new Mastra`: `controller.init()`, que herda storage, logger e observabilidade da instância. */
  async finalize(): Promise<void> {
    throw new Error('not implemented');
  }

  /** Pausa as máquinas abertas e limpa o cache da Workspace. Idempotente. O host continua dono do Mastra. */
  async shutdown(): Promise<void> {
    throw new Error('not implemented');
  }
}
