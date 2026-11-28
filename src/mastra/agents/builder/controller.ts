import type { Agent } from '@mastra/core/agent';
import type { AgentController } from '@mastra/core/agent-controller';
import type { Workspace } from '@mastra/core/workspace';
import type { Memory } from '@mastra/memory';
import type { HarnessTools, ModelId } from '../../config.js';

export const BUILDER_ID = 'builder';

export interface BuilderDeps {
  model: ModelId;
  memory: Memory;
  workspace: Workspace;
  tools?: HarnessTools;
}

/** Monta o Construtor. Nada é criado no import. */
export function createBuilder(deps: BuilderDeps): { agent: Agent; controller: AgentController } {
  throw new Error('not implemented');
}
