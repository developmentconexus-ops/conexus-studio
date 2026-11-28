import { Memory } from '@mastra/memory';
import type { MastraModelConfig } from '@mastra/core/llm';

export function createBuilderMemory(model: MastraModelConfig): Memory {
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
