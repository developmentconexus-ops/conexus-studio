import type { ModelWithRetries } from '@mastra/core/agent';
import { RequestContext, MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import type { DynamicArgument } from '@mastra/core/types';
import { describe, expect, it } from 'vitest';
import type { HarnessModel } from '../../config.js';
import { createBuilderMemory } from './memory.js';
import { memoryModels } from './model.js';

const noModels = { resolve: (modelId: string) => modelId, memoryFor: () => ({ observer: 'o', reflector: 'r' }) };

async function ask(model: DynamicArgument<HarnessModel>, requestContext: RequestContext): Promise<HarnessModel> {
  if (typeof model !== 'function') throw new Error('expected a model function');
  return model({ requestContext });
}

function inACall(resourceId: string): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set(MASTRA_RESOURCE_ID_KEY, resourceId);
  return requestContext;
}

describe('createBuilderMemory', () => {
  it('has no storage of its own, so the Mastra instance of the host provides it', () => {
    expect(createBuilderMemory(memoryModels(noModels)).hasOwnStorage).toBe(false);
  });

  it('persists threads in a storage set after construction', async () => {
    const memory = createBuilderMemory(memoryModels(noModels));
    const storage = new InMemoryStore();
    memory.setStorage(storage);

    const thread = await memory.createThread({ resourceId: 'r' });

    const stored = await (await storage.getStore('memory'))?.getThreadById({ threadId: thread.id });
    expect(stored?.id).toBe(thread.id);
  });
});

describe('memoryModels', () => {
  it('gives each role the model the host chose for the owner, through the same resolve', async () => {
    const asked: unknown[] = [];
    const resolved: { modelId: string; resourceId: string }[] = [];
    const { observer, reflector } = memoryModels({
      memoryFor: (owner) => {
        asked.push(owner);
        return { observer: `observer-of-${owner.resourceId}`, reflector: `reflector-of-${owner.resourceId}` };
      },
      resolve: (modelId, { resourceId }) => {
        resolved.push({ modelId, resourceId });
        return `resolved:${modelId}`;
      },
    });
    const requestContext = inACall('company:c1:person:p1');

    expect(await ask(observer, requestContext)).toBe('resolved:observer-of-company:c1:person:p1');
    expect(await ask(reflector, requestContext)).toBe('resolved:reflector-of-company:c1:person:p1');
    expect(asked).toEqual([{ resourceId: 'company:c1:person:p1' }, { resourceId: 'company:c1:person:p1' }]);
    expect(resolved.map((entry) => entry.modelId)).toEqual([
      'observer-of-company:c1:person:p1',
      'reflector-of-company:c1:person:p1',
    ]);
  });

  it('hands a list of models to the observer and the reflector as the host built it', async () => {
    const accounts: ModelWithRetries[] = [
      { id: 'account-1', model: 'host/model' },
      { id: 'account-2', model: 'host/model' },
    ];
    const { observer, reflector } = memoryModels({ ...noModels, resolve: () => accounts });
    const requestContext = inACall('company:c1:person:p1');

    expect(await ask(observer, requestContext)).toBe(accounts);
    expect(await ask(reflector, requestContext)).toBe(accounts);
  });

  it('fails when the call has no owner, instead of picking a model for someone', async () => {
    const { observer } = memoryModels(noModels);

    await expect(ask(observer, new RequestContext())).rejects.toThrow(/No resourceId/);
  });
});
