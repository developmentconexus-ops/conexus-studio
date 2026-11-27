import { Memory } from '@mastra/memory';

export const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'anthropic/claude-haiku-5-5',
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
