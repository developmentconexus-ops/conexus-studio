import { Memory } from '@mastra/memory';
import { memoryModel } from './model.js';
import type { ResolvedModels } from './model.js';

export function createBuilderMemory(models: ResolvedModels): Memory {
  return new Memory({
    options: {
      observationalMemory: {
        scope: 'thread',
        temporalMarkers: true,
        observation: {
          model: memoryModel(models, 'observer'),
          messageTokens: 70_000,
          threadTitle: true,
          observeAttachments: 'auto',
        },
        reflection: {
          model: memoryModel(models, 'reflector'),
          observationTokens: 40_000,
        },
      },
    },
  });
}
