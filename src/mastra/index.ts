import { Mastra } from '@mastra/core/mastra';
import { builderAgent, builderController } from './agents/builder/index.js';
import { observability } from './observability.js';
import { storage } from './storage.js';

export const mastra = new Mastra({
  agents: { builder: builderAgent },
  agentControllers: { builder: builderController },
  storage,
  observability,
});
