import { InMemoryStore } from '@mastra/core/storage';
import { describe, expect, it } from 'vitest';
import { createBuilderMemory } from './memory.js';

describe('createBuilderMemory', () => {
  it('has no storage of its own, so the Mastra instance of the host provides it', () => {
    const memory = createBuilderMemory('anthropic/claude-haiku-5-5');

    expect(memory.hasOwnStorage).toBe(false);
  });

  it('uses the model it receives for observational memory', () => {
    const memory = createBuilderMemory('openai/gpt-test');

    const observational = memory.getMergedThreadConfig().observationalMemory;

    expect(observational).toMatchObject({ model: 'openai/gpt-test', scope: 'thread' });
  });

  it('persists threads in a storage set after construction', async () => {
    const memory = createBuilderMemory('anthropic/claude-haiku-5-5');
    const storage = new InMemoryStore();
    memory.setStorage(storage);

    const thread = await memory.createThread({ resourceId: 'r' });

    const stored = await (await storage.getStore('memory'))?.getThreadById({ threadId: thread.id });
    expect(stored?.id).toBe(thread.id);
  });
});
