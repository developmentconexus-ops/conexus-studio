import type { DynamicArgument } from '@mastra/core/types';
import { Memory } from '@mastra/memory';
import type { HarnessModel } from '../../config.js';

export function createBuilderMemory(models: {
  observer: DynamicArgument<HarnessModel>;
  reflector: DynamicArgument<HarnessModel>;
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
