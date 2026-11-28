import type { Agent } from '@mastra/core/agent';
import type { AgentController } from '@mastra/core/agent-controller';
import type { Workspace } from '@mastra/core/workspace';
import type { ConexusHarnessConfig, HarnessMastraArgs, ModelId } from './config.js';
import { createBuilder } from './agents/builder/controller.js';
import { createBuilderMemory } from './agents/builder/memory.js';
import { createBuilderWorkspace } from './agents/builder/workspace.js';
import { AppSandboxes } from './sandboxes.js';

const DEFAULT_BUILDER_MODEL: ModelId = 'anthropic/claude-sonnet-5-5';
const DEFAULT_MEMORY_MODEL: ModelId = 'anthropic/claude-haiku-5-5';
const DEFAULT_PLANS_DIR = '.conexus/plans';

interface Prepared {
  agent: Agent;
  controller: AgentController;
  workspace: Workspace;
}

export class ConexusHarness {
  private readonly config: ConexusHarnessConfig;
  private readonly sandboxes: AppSandboxes;
  private prepared?: Prepared;

  constructor(config: ConexusHarnessConfig) {
    this.config = config;
    this.sandboxes = new AppSandboxes(config.sandbox);
  }

  /** Monta o Construtor (agente + controller) e o auth. Uma vez só: a segunda chamada lança erro. */
  async prepare(): Promise<HarnessMastraArgs> {
    if (this.prepared) throw new Error('ConexusHarness.prepare() runs once. Create a new ConexusHarness instead.');

    const { auth, model, tools, plansDir } = this.config;
    const memory = createBuilderMemory(model?.memory ?? DEFAULT_MEMORY_MODEL);
    const workspace = createBuilderWorkspace(this.sandboxes);
    const { agent, controller } = createBuilder({
      model: model?.builder ?? DEFAULT_BUILDER_MODEL,
      memory,
      workspace,
      tools,
      plansDir: plansDir ?? DEFAULT_PLANS_DIR,
    });
    this.prepared = { agent, controller, workspace };

    return {
      agents: { builder: agent },
      agentControllers: { builder: controller },
      ...(auth ? { server: { auth }, studio: { auth } } : {}),
    };
  }

  /** Depois do `new Mastra`: `controller.init()`, que herda storage, logger e observabilidade da instância. */
  async finalize(): Promise<void> {
    if (!this.prepared) throw new Error('ConexusHarness.finalize() needs prepare() and the new Mastra first.');
    await this.prepared.controller.init();
  }

  /** Pausa as máquinas abertas e limpa o cache da Workspace. Idempotente. O host continua dono do Mastra. */
  async shutdown(): Promise<void> {
    try {
      await this.sandboxes.stopAll();
    } finally {
      this.prepared?.workspace.clearSandboxCache();
    }
  }
}
