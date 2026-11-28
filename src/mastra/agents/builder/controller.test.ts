import type { ModelWithRetries } from '@mastra/core/agent';
import type { AgentController } from '@mastra/core/agent-controller';
import { Mastra } from '@mastra/core/mastra';
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { createTool, submitPlanTool } from '@mastra/core/tools';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HARNESS_APP_ID_KEY } from '../../config.js';
import type { ConversationOwner, HarnessModels, ModelCall } from '../../config.js';
import { ConexusHarness } from '../../harness.js';
import { AppSandboxes } from '../../sandboxes.js';
import { createLocalMachines } from '../../testing/local-machines.js';
import type { LocalMachines } from '../../testing/local-machines.js';
import { BUILDER_ID, createBuilder } from './controller.js';
import { createBuilderMemory } from './memory.js';
import { memoryModels } from './model.js';
import { PLAN_MODE_AVAILABLE_TOOLS } from './modes/plan.js';
import { createBuilderWorkspace } from './workspace.js';

let machines: LocalMachines;

beforeAll(async () => {
  machines = await createLocalMachines();
});

afterAll(async () => {
  await machines.dispose();
});

const hostTool = createTool({
  id: 'publish',
  description: 'Test publish',
  inputSchema: z.object({}),
  execute: async () => ({ ok: true }),
});

function build() {
  return createBuilder({
    model: { resolve: (modelId) => modelId },
    memory: createBuilderMemory(
      memoryModels({ resolve: (modelId) => modelId, memoryFor: () => ({ observer: 'host/observer', reflector: 'host/reflector' }) }),
    ),
    workspace: createBuilderWorkspace(new AppSandboxes(machines.factory)),
    tools: { publish: hostTool },
    plansDir: '.conexus/plans',
  });
}

function requestContextFor(appId: string): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set(HARNESS_APP_ID_KEY, appId);
  return requestContext;
}

function requestContextInATurn(appId: string): RequestContext {
  const requestContext = requestContextFor(appId);
  requestContext.set(MASTRA_RESOURCE_ID_KEY, 'resource');
  requestContext.set('controller', { resourceId: 'resource', sessionId: 'session', session: { modelId: 'anthropic/claude-sonnet-5-5' } });
  return requestContext;
}

function mockModel(onStream: () => void) {
  const model = createMockModel({ mockText: 'ok', version: 'v2', spyStream: onStream });
  Object.defineProperty(model, 'provider', { value: 'anthropic' });
  return model;
}

describe('createBuilder', () => {
  it('gives the agent the controller tools, the web tools, preview_url and the host tools', async () => {
    const { agent } = build();

    const tools = await agent.listTools({ requestContext: requestContextInATurn('a') });

    expect(Object.keys(tools).sort()).toEqual(
      [
        'ask_user',
        'submit_plan',
        'task_write',
        'task_update',
        'task_complete',
        'task_check',
        'web_search',
        'web_fetch',
        'preview_url',
        'publish',
      ].sort(),
    );
  });

  it('keeps submit_plan on the agent, which is what the Studio plan card route looks for', async () => {
    const { agent } = build();

    const tools = await agent.listTools({ requestContext: requestContextInATurn('a') });

    expect(Object.values(tools).some((tool) => 'id' in tool && tool.id === submitPlanTool.id)).toBe(true);
  });

  it('registers the agent and the controller under the same id', () => {
    const { agent, controller } = build();

    expect(agent.id).toBe(BUILDER_ID);
    expect(controller.id).toBe(BUILDER_ID);
  });

  it('starts in build mode and plan transitions to build without the terminal tool', () => {
    const { controller } = build();

    const modes = controller.listModes();
    const plan = modes.find((mode) => mode.id === 'plan');

    expect(modes.map((mode) => mode.id).sort()).toEqual(['build', 'plan']);
    expect(plan?.transitionsTo).toBe('build');
    expect(plan?.availableTools).not.toContain('mastra_workspace_execute_command');
  });
});

const harnesses: ConexusHarness[] = [];

async function bootHarness(model: HarnessModels = {}) {
  const harness = new ConexusHarness({ sandbox: machines.factory, tools: { publish: hostTool }, model });
  harnesses.push(harness);
  const prepared = await harness.prepare();
  new Mastra({ ...prepared, storage: new InMemoryStore() });
  await harness.finalize();
  const controller = prepared.agentControllers?.builder;
  if (!controller) throw new Error('the harness did not provide the builder controller');
  return controller;
}

afterAll(async () => {
  await Promise.all(harnesses.map((harness) => harness.shutdown()));
});

describe('createBuilder in a controller session', () => {
  async function streamOptionsSeenByTheModel(modeId: string) {
    let streamOptions: { tools?: { name: string }[]; providerOptions?: Record<string, unknown> } | undefined;
    const model = createMockModel({
      mockText: 'ok',
      version: 'v2',
      spyStream: (options) => {
        streamOptions = options;
      },
    });
    Object.defineProperty(model, 'provider', { value: 'anthropic' });
    const controller = await bootHarness({ defaultFor: () => 'test/model', resolve: () => model });
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    await session.mode.switch({ modeId });

    await session.sendMessage({ content: 'hello', requestContext });

    return streamOptions;
  }

  async function toolsSeenByTheModel(modeId: string): Promise<string[]> {
    return ((await streamOptionsSeenByTheModel(modeId))?.tools ?? []).map((tool) => tool.name);
  }

  it.each(['plan', 'build'])('asks Anthropic to drop thinking blocks bound to another tools list in %s mode', async (modeId) => {
    const options = await streamOptionsSeenByTheModel(modeId);

    expect(options?.providerOptions).toMatchObject({
      anthropic: { thinking: { type: 'adaptive', blockBinding: { prefixMismatchBehavior: 'drop_block' } } },
    });
  });

  it('shows the model each tool once in build mode, with the workspace, skill and host tools', async () => {
    const names = await toolsSeenByTheModel('build');

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'ask_user',
        'submit_plan',
        'task_write',
        'web_fetch',
        'preview_url',
        'publish',
        'skill',
        'mastra_workspace_write_file',
        'mastra_workspace_execute_command',
      ]),
    );
  });

  it('shows the model only the plan tools in plan mode, without the terminal', async () => {
    const names = await toolsSeenByTheModel('plan');

    expect(names).toContain('submit_plan');
    expect(names).toContain('mastra_workspace_write_file');
    expect(names).not.toContain('mastra_workspace_execute_command');
    expect(names).not.toContain('preview_url');
    expect(names).not.toContain('publish');
    expect(names.every((name) => PLAN_MODE_AVAILABLE_TOOLS.includes(name))).toBe(true);
  });
});

describe('model per conversation', () => {
  interface Seen {
    resolved: { modelId: string; call: ModelCall }[];
    calls: string[];
    defaults: ConversationOwner[];
  }

  class ModelNotAllowed extends Error {}

  async function bootBuilder(options: Pick<HarnessModels, 'defaultFor' | 'resolve'> = {}) {
    const seen: Seen = { resolved: [], calls: [], defaults: [] };
    const models = new Map<string, MastraModelConfig>();
    const modelFor = (modelId: string) => {
      let model = models.get(modelId);
      if (!model) {
        model = mockModel(() => seen.calls.push(modelId));
        models.set(modelId, model);
      }
      return model;
    };
    const controller = await bootHarness({
      defaultFor:
        options.defaultFor ??
        ((owner) => {
          seen.defaults.push(owner);
          return 'host/default';
        }),
      resolve:
        options.resolve ??
        ((modelId, call) => {
          seen.resolved.push({ modelId, call });
          return modelFor(modelId);
        }),
    });
    return { controller, seen, modelFor };
  }

  type Session = Awaited<ReturnType<AgentController['createSession']>>;

  async function talk(session: Session, requestContext: RequestContext) {
    await session.sendMessage({ content: 'hello', requestContext });
  }

  it('starts a new conversation on the default of its owner, and the turn runs there', async () => {
    const { controller, seen } = await bootBuilder({ defaultFor: ({ resourceId }) => `host/default-of-${resourceId}` });
    const sessions: Session[] = [];
    for (const appId of ['a', 'b']) {
      const requestContext = requestContextFor(appId);
      const session = await controller.createSession({ requestContext, id: `session-${appId}`, resourceId: `company:c1:person:${appId}` });
      sessions.push(session);
      await talk(session, requestContext);
    }

    expect(sessions.map((session) => session.model.get())).toEqual([
      'host/default-of-company:c1:person:a',
      'host/default-of-company:c1:person:b',
    ]);
    expect(seen.calls).toEqual(['host/default-of-company:c1:person:a', 'host/default-of-company:c1:person:b']);
  });

  it('asks the default with the resource and the session of the conversation', async () => {
    const { controller, seen } = await bootBuilder();

    await controller.createSession({ requestContext: requestContextFor('a'), id: 'session-1', resourceId: 'company:c1:person:p1' });

    expect(seen.defaults).toEqual([{ resourceId: 'company:c1:person:p1', sessionId: 'session-1' }]);
  });

  it('runs the next turn on the model the session switched to', async () => {
    const { controller, seen } = await bootBuilder();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    await talk(session, requestContext);

    await session.model.switch('host/chosen');
    await talk(session, requestContext);

    expect(seen.calls).toEqual(['host/default', 'host/chosen']);
  });

  it('keeps the chosen model when the conversation is resumed, without asking the default again', async () => {
    const { controller, seen } = await bootBuilder();
    const requestContext = requestContextFor('a');
    const first = await controller.createSession({ requestContext, id: 'first' });
    await first.model.switch('host/chosen');
    const threadId = first.thread.getId();
    await controller.deleteSession({ sessionId: 'first' });

    const second = await controller.createSession({ requestContext, id: 'second', threadId: threadId ?? undefined });
    await talk(second, requestContext);

    expect(seen.calls).toEqual(['host/chosen']);
    expect(seen.defaults).toHaveLength(1);
  });

  it('does not change a conversation when the default of its owner changes later', async () => {
    let current = 'host/default-a';
    const { controller, seen } = await bootBuilder({ defaultFor: () => current });
    const requestContext = requestContextFor('a');
    const first = await controller.createSession({ requestContext, id: 'first' });
    const threadId = first.thread.getId();
    await controller.deleteSession({ sessionId: 'first' });
    current = 'host/default-b';

    const second = await controller.createSession({ requestContext, id: 'second', threadId: threadId ?? undefined });
    await talk(second, requestContext);

    expect(seen.calls).toEqual(['host/default-a']);
  });

  it('starts a new thread of the same session on the default again', async () => {
    const { controller, seen } = await bootBuilder();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    await session.model.switch('host/chosen');

    await session.thread.create({ requestContext });
    await talk(session, requestContext);

    expect(seen.calls).toEqual(['host/default']);
  });

  it('refuses to run a model that resolve rejects, with the error resolve threw', async () => {
    const refused = new ModelNotAllowed('not allowed');
    let allowed = true;
    const calls: string[] = [];
    const { controller } = await bootBuilder({
      resolve: (modelId) => {
        if (!allowed) throw refused;
        return mockModel(() => calls.push(modelId));
      },
    });
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    await talk(session, requestContext);
    allowed = false;

    await expect(talk(session, requestContext)).rejects.toBe(refused);
    expect(calls).toEqual(['host/default']);
  });

  it('runs nothing when the default could not seed the conversation', async () => {
    const { controller, seen } = await bootBuilder({
      defaultFor: () => {
        throw new Error('no account serves a model');
      },
    });
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });

    expect(session.model.hasSelection()).toBe(false);
    await expect(talk(session, requestContext)).rejects.toThrow(/no model/);
    expect(seen.calls).toEqual([]);
  });

  it('hands resolve the id and the owner of the conversation', async () => {
    const { controller, seen } = await bootBuilder();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext, id: 'session-1', resourceId: 'company:c1:person:p1' });
    await session.model.switch('host/chosen');

    await talk(session, requestContext);

    expect(seen.resolved.length).toBeGreaterThan(0);
    for (const { modelId, call } of seen.resolved) {
      expect(modelId).toBe('host/chosen');
      expect(call.resourceId).toBe('company:c1:person:p1');
      expect(call.requestContext.get(HARNESS_APP_ID_KEY)).toBe('a');
    }
  });

  describe('rotating accounts with a list of models', () => {
    class RateLimited extends Error {
      readonly statusCode = 429;
      readonly isRetryable = true;
    }

    function account(id: string, behavior: 'serves' | 'rate-limited', calls: string[]): ModelWithRetries {
      const model = createMockModel({ mockText: `served by ${id}`, version: 'v2', spyStream: () => calls.push(id) });
      Object.defineProperty(model, 'provider', { value: 'anthropic' });
      if (behavior === 'rate-limited') {
        model.doStream = async () => {
          calls.push(id);
          throw new RateLimited('429 too many requests');
        };
      }
      return { id, model, maxRetries: 0 };
    }

    async function turnOn(accounts: ModelWithRetries[]): Promise<string> {
      const controller = await bootHarness({ defaultFor: () => 'host/default', resolve: () => accounts });
      const requestContext = requestContextFor('a');
      const session = await controller.createSession({ requestContext });
      const updates: string[] = [];
      session.subscribe((event) => {
        if (event.type === 'message_update') updates.push(JSON.stringify(event));
      });
      await session.sendMessage({ content: 'hello', requestContext });
      return updates.join('\n');
    }

    it('serves the turn from the next account when the first answers 429, and leaves the third alone', async () => {
      const calls: string[] = [];

      const transcript = await turnOn([
        account('account-1', 'rate-limited', calls),
        account('account-2', 'serves', calls),
        account('account-3', 'serves', calls),
      ]);

      expect(transcript).toContain('served by account-2');
      expect(calls).toContain('account-1');
      expect(calls).not.toContain('account-3');
    }, 30_000);

    it('does not touch the next account while the first one serves', async () => {
      const calls: string[] = [];

      await turnOn([account('account-1', 'serves', calls), account('account-2', 'serves', calls)]);

      expect(calls).toEqual(['account-1']);
    });
  });

  it('starts on Sonnet 5.5 when the host gives no model config', async () => {
    const controller = await bootHarness();

    const session = await controller.createSession({ requestContext: requestContextFor('a') });

    expect(session.model.get()).toBe('anthropic/claude-sonnet-5-5');
  });

  it('asks the host for the memory models of the owner when observation runs, and resolves them', async () => {
    const asked: unknown[] = [];
    const resolvedMemory: { modelId: string; call: ModelCall }[] = [];
    const controller = await bootHarness({
      defaultFor: () => 'host/default',
      memoryFor: (owner) => {
        asked.push(owner);
        return { observer: 'host/observer', reflector: 'host/reflector' };
      },
      resolve: (modelId, call) => {
        if (modelId === 'host/observer' || modelId === 'host/reflector') resolvedMemory.push({ modelId, call });
        return mockModel(() => {});
      },
    });
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext, resourceId: 'company:c1:person:p1' });

    await session.sendMessage({ content: 'lorem ipsum '.repeat(40_000), requestContext });

    await vi.waitFor(() => expect(resolvedMemory.length).toBeGreaterThan(0));
    expect(asked[0]).toEqual({ resourceId: 'company:c1:person:p1' });
    expect(resolvedMemory[0]?.modelId).toBe('host/observer');
    expect(resolvedMemory[0]?.call.resourceId).toBe('company:c1:person:p1');
  }, 30_000);
});
