import type { MastraModelConfig } from '@mastra/core/llm';
import type { DynamicArgument } from '@mastra/core/types';
import { Memory } from '@mastra/memory';

export function createBuilderMemory(models: {
  observer: DynamicArgument<MastraModelConfig>;
  reflector: DynamicArgument<MastraModelConfig>;
}): Memory {
  return new Memory({
    options: {
      observationalMemory: {
        scope: 'thread',
        temporalMarkers: true,
        observation: {
          model: models.observer,
          messageTokens: 70_000,
          threadTitle: true,
          observeAttachments: 'auto',
        },
        reflection: {
          model: models.reflector,
          observationTokens: 40_000,
        },
      },
    },
  });
}
