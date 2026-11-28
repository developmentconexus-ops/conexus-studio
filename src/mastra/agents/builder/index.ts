import { AgentController } from '@mastra/core/agent-controller';
import { createCodingAgent } from '@mastra/core/coding-agent';
import { instructions } from './prompt.js';
import { memory } from './memory.js';
import { MODEL_ID, BUILD_MODE_ID, modes } from './modes.js';
import { conversationWorkspace } from './sandbox.js';
import { tools } from './tools.js';

const MAX_STEPS = 100;

export const builderAgent = createCodingAgent({
  id: 'builder',
  name: 'Builder',
  instructions,
  model: MODEL_ID,
  tools,
  memory,
  workspace: conversationWorkspace,
  defaultOptions: { maxSteps: MAX_STEPS },
});

export const builderController = new AgentController({
  id: 'builder',
  agent: builderAgent,
  modes,
  defaultModeId: BUILD_MODE_ID,
  memory,
  workspace: conversationWorkspace,
  initialState: { yolo: true },
});
