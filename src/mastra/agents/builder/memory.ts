import { Memory } from '@mastra/memory';
import type { ModelId } from '../../config.js';

export function createBuilderMemory(model: ModelId): Memory {
  return new Memory({
    options: {
      observationalMemory: {
        model,
        scope: 'thread',
        temporalMarkers: true,
        observation: {
          messageTokens: 70_000,
          threadTitle: true,
          observeAttachments: 'auto',
        },
        reflection: {
          observationTokens: 40_000,
        },
      },
    },
  });
}
