import { RequestContext, MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import { describe, expect, it } from 'vitest';
import type { HarnessModels } from '../../config.js';
import { createBuilderMemory } from './memory.js';
import { withModelDefaults } from './model.js';

type ModelFunction = (args: { requestContext: RequestContext }) => Promise<unknown>;

function memoryModelsOf(models: HarnessModels = {}) {
  const config = createBuilderMemory(withModelDefaults(models)).getMergedThreadConfig().observationalMemory;
  if (typeof config !== 'object') throw new Error('observational memory is off');
  return { observer: config.observation?.model as ModelFunction, reflector: config.reflection?.model as ModelFunction };
}

function inATurn(resourceId: string, sessionId = 'session-1'): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set('controller', { resourceId, sessionId, session: { modelId: 'host/chosen' } });
  return requestContext;
}

describe('createBuilderMemory', () => {
  it('has no storage of its own, so the Mastra instance of the host provides it', () => {
    expect(createBuilderMemory(withModelDefaults()).hasOwnStorage).toBe(false);
  });

  it('observes and reflects on Haiku 5.5 when the host does not say otherwise', async () => {
    const { observer, reflector } = memoryModelsOf();

    expect(await observer({ requestContext: inATurn('r') })).toBe('anthropic/claude-haiku-5-5');
    expect(await reflector({ requestContext: inATurn('r') })).toBe('anthropic/claude-haiku-5-5');
  });

  it('asks the host for the models of the conversation owner and resolves each role through resolve', async () => {
    const asked: unknown[] = [];
    const resolved: { modelId: string; resourceId: string; sessionId: string }[] = [];
    const { observer, reflector } = memoryModelsOf({
      memoryFor: (owner) => {
        asked.push(owner);
        return { observer: 'host/observer', reflector: 'host/reflector' };
      },
      resolve: (modelId, { resourceId, sessionId }) => {
        resolved.push({ modelId, resourceId, sessionId });
        return `resolved:${modelId}`;
      },
    });

    expect(await observer({ requestContext: inATurn('company:c:person:p') })).toBe('resolved:host/observer');
    expect(await reflector({ requestContext: inATurn('company:c:person:p') })).toBe('resolved:host/reflector');

    expect(asked).toEqual([
      { resourceId: 'company:c:person:p', sessionId: 'session-1' },
      { resourceId: 'company:c:person:p', sessionId: 'session-1' },
    ]);
    expect(resolved).toEqual([
      { modelId: 'host/observer', resourceId: 'company:c:person:p', sessionId: 'session-1' },
      { modelId: 'host/reflector', resourceId: 'company:c:person:p', sessionId: 'session-1' },
    ]);
  });

  it('follows the company when it changes the memory models, without waiting for a new conversation', async () => {
    let observerId = 'host/observer-1';
    const { observer } = memoryModelsOf({ memoryFor: () => ({ observer: observerId, reflector: 'host/reflector' }) });

    expect(await observer({ requestContext: inATurn('r') })).toBe('host/observer-1');
    observerId = 'host/observer-2';
    expect(await observer({ requestContext: inATurn('r') })).toBe('host/observer-2');
  });

  it('finds the owner by the resource id of the turn when the call has no controller entry', async () => {
    const owners: unknown[] = [];
    const { observer } = memoryModelsOf({
      memoryFor: (owner) => (owners.push(owner), { observer: 'host/observer', reflector: 'host/reflector' }),
    });
    const requestContext = new RequestContext();
    requestContext.set(MASTRA_RESOURCE_ID_KEY, 'company:c:person:p');

    await observer({ requestContext });

    expect(owners).toMatchObject([{ resourceId: 'company:c:person:p' }]);
  });

  it('fails when the call has no owner at all, instead of picking a default for someone', async () => {
    const { observer } = memoryModelsOf();

    await expect(observer({ requestContext: new RequestContext() })).rejects.toThrow(/without a conversation owner/);
  });

  it('persists threads in a storage set after construction', async () => {
    const memory = createBuilderMemory(withModelDefaults());
    const storage = new InMemoryStore();
    memory.setStorage(storage);

    const thread = await memory.createThread({ resourceId: 'r' });

    const stored = await (await storage.getStore('memory'))?.getThreadById({ threadId: thread.id });
    expect(stored?.id).toBe(thread.id);
  });
});
