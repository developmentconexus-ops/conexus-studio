import type { Agent } from '@mastra/core/agent';
import { AgentController } from '@mastra/core/agent-controller';
import { createCodingAgent } from '@mastra/core/coding-agent';
import type { Workspace } from '@mastra/core/workspace';
import type { Memory } from '@mastra/memory';
import type { HarnessModels, HarnessTools } from '../../config.js';
import { BUILD_MODE_ID, createBuilderModes } from './modes/index.js';
import { builderModel } from './model.js';
import { instructions } from './prompt.js';
import { CONTROLLER_BUILTIN_TOOL_IDS, builderTools } from './tools/index.js';

export const BUILDER_ID = 'builder';

const MAX_STEPS = 1_000;

export interface BuilderDeps {
  model: Pick<Required<HarnessModels>, 'resolve'>;
  memory: Memory;
  workspace: Workspace;
  tools?: HarnessTools;
  plansDir: string;
}

export function createBuilder(deps: BuilderDeps): { agent: Agent; controller: AgentController } {
  const agent = createCodingAgent({
    id: BUILDER_ID,
    name: 'Builder',
    instructions,
    model: builderModel(deps.model),
    tools: builderTools(deps.tools),
    memory: deps.memory,
    workspace: deps.workspace,
    defaultOptions: {
      maxSteps: MAX_STEPS,
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral', ttl: '1h' },
          thinking: { type: 'adaptive', blockBinding: { prefixMismatchBehavior: 'drop_block' } },
        },
      },
    },
  });
  const controller = new AgentController({
    id: BUILDER_ID,
    agent,
    modes: createBuilderModes({ plansDir: deps.plansDir }),
    defaultModeId: BUILD_MODE_ID,
    memory: deps.memory,
    workspace: deps.workspace,
    initialState: { yolo: true },
    disableBuiltinTools: [...CONTROLLER_BUILTIN_TOOL_IDS],
  });
  return { agent, controller };
}
