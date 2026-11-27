import { Mastra } from '@mastra/core/mastra';
import { builderAgent, builderController } from './agents/builder/index.js';
import { storage } from './storage.js';

export const mastra = new Mastra({
  agents: { builder: builderAgent },
  agentControllers: { builder: builderController },
  storage,
});
