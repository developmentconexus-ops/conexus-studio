import type { AgentController } from '@mastra/core/agent-controller';
import { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { createTool, submitPlanTool } from '@mastra/core/tools';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HARNESS_APP_ID_KEY } from '../../config.js';
import type { ConversationOwner, HarnessModels, ModelCall } from '../../config.js';
import { ModelNotAllowedError, ModelNotSeededError } from '../../models.js';
import { AppSandboxes } from '../../sandboxes.js';
import { createLocalMachines } from '../../testing/local-machines.js';
import type { LocalMachines } from '../../testing/local-machines.js';
import { BUILDER_ID, createBuilder } from './controller.js';
import { createBuilderMemory } from './memory.js';
import { builderModel, withModelDefaults } from './model.js';
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

function build(model: HarnessModels = {}) {
  const models = withModelDefaults(model);
  return createBuilder({
    models,
    memory: createBuilderMemory(models),
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
    const { agent, controller } = build({ defaultFor: () => 'test/model', resolve: () => model });
    new Mastra({
      agents: { builder: agent },
      agentControllers: { builder: controller },
      storage: new InMemoryStore(),
    });
    await controller.init();
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

describe('createBuilder model per conversation', () => {
  interface Seen {
    resolved: { modelId: string; call: ModelCall }[];
    calls: string[];
    defaults: ConversationOwner[];
  }

  function bootBuilder(options: Pick<HarnessModels, 'defaultFor' | 'resolve'> = {}) {
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
    const { agent, controller } = build({
      defaultFor: options.defaultFor ?? ((owner) => (seen.defaults.push(owner), 'host/default')),
      resolve:
        options.resolve ??
        ((modelId, call) => {
          seen.resolved.push({ modelId, call });
          return modelFor(modelId);
        }),
    });
    new Mastra({ agents: { builder: agent }, agentControllers: { builder: controller }, storage: new InMemoryStore() });
    return { controller, seen };
  }

  type Session = Awaited<ReturnType<AgentController['createSession']>>;

  async function talk(session: Session, requestContext: RequestContext) {
    await session.sendMessage({ content: 'hello', requestContext });
  }

  it('shows a new conversation on the host default as soon as the session exists, and runs it there', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');

    const session = await controller.createSession({ requestContext });
    expect(session.model.get()).toBe('host/default');
    await talk(session, requestContext);

    expect(seen.calls).toEqual(['host/default']);
  });

  it('asks the host default once per conversation, with the owner the session has', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext, id: 'session-1', resourceId: 'company:c:person:p' });

    await talk(session, requestContext);
    await talk(session, requestContext);

    expect(seen.defaults).toEqual([{ resourceId: 'company:c:person:p', sessionId: 'session-1' }]);
  });

  it('lets each company or person have its own default', async () => {
    const { controller, seen } = bootBuilder({ defaultFor: ({ resourceId }) => `host/default-of-${resourceId}` });
    await controller.init();
    for (const appId of ['a', 'b']) {
      const requestContext = requestContextFor(appId);
      const session = await controller.createSession({ requestContext, id: `session-${appId}`, resourceId: `resource-${appId}` });
      await talk(session, requestContext);
    }

    expect(seen.calls).toEqual(['host/default-of-resource-a', 'host/default-of-resource-b']);
  });

  it('runs the next turn on the model the session switched to', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    await talk(session, requestContext);

    await session.model.switch('host/chosen');
    await talk(session, requestContext);

    expect(seen.calls).toEqual(['host/default', 'host/chosen']);
  });

  it('keeps the chosen model when the conversation is resumed, without asking the host default again', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
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

  it('starts a new thread of the same session on the host default after the conversation switched models', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    await session.model.switch('host/chosen');

    await session.thread.create({ requestContext });
    await vi.waitFor(() => expect(session.model.get()).toBe('host/default'));
    await talk(session, requestContext);

    expect(seen.calls).toEqual(['host/default']);
  });

  it('does not overwrite a model the person picked while the host default was still being decided', async () => {
    let release: (modelId: string) => void = () => {};
    let slow = false;
    const { controller } = bootBuilder({
      defaultFor: () => (slow ? new Promise<string>((resolve) => (release = resolve)) : 'host/default'),
    });
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    slow = true;

    await session.thread.create({ requestContext });
    await session.model.switch('host/chosen');
    release('host/late-default');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(session.model.get()).toBe('host/chosen');
  });

  it('hands resolve the id, the owner and the request context of the turn', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext, id: 'session-1', resourceId: 'resource-1' });
    await session.model.switch('host/chosen');

    await talk(session, requestContext);

    expect(seen.resolved.length).toBeGreaterThan(0);
    for (const { modelId, call } of seen.resolved) {
      expect(modelId).toBe('host/chosen');
      expect(call).toMatchObject({ sessionId: 'session-1', resourceId: 'resource-1' });
      expect(call.requestContext.get(HARNESS_APP_ID_KEY)).toBe('a');
    }
  });

  it('fails the first turn closed when the host default failed, instead of running some other model', async () => {
    const { controller, seen } = bootBuilder({
      defaultFor: () => {
        throw new Error('no account serves a model');
      },
    });
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });

    await expect(talk(session, requestContext)).rejects.toBeInstanceOf(ModelNotSeededError);
    expect(seen.calls).toEqual([]);
  });

  it('fails the turn with the typed error when the stored model is no longer allowed, and never falls back', async () => {
    let allowed = true;
    const { controller, seen } = bootBuilder({
      resolve: (modelId, call) => {
        if (!allowed) throw new ModelNotAllowedError(modelId, call);
        return mockModel(() => seen.calls.push(modelId));
      },
    });
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext, id: 'session-1' });
    await talk(session, requestContext);

    allowed = false;

    await expect(talk(session, requestContext)).rejects.toBeInstanceOf(ModelNotAllowedError);
    expect(seen.calls).toEqual(['host/default']);
  });

  it('sends the id straight to the router when the host gives no resolve', async () => {
    const model = builderModel(withModelDefaults());
    const requestContext = requestContextFor('a');
    requestContext.set('controller', { resourceId: 'r', sessionId: 's', session: { modelId: 'anthropic/claude-sonnet-5-5' } });

    expect(await model({ requestContext })).toBe('anthropic/claude-sonnet-5-5');
  });
});

describe('createBuilder memory in a real turn', () => {
  it('asks the host for the memory models of the session owner when observation runs, and resolves them', async () => {
    const asked: ConversationOwner[] = [];
    const resolvedMemory: { modelId: string; call: ModelCall }[] = [];
    const { agent, controller } = build({
      memoryFor: (owner) => (asked.push(owner), { observer: 'host/observer', reflector: 'host/reflector' }),
      resolve: (modelId, call) => {
        if (modelId === 'host/observer' || modelId === 'host/reflector') resolvedMemory.push({ modelId, call });
        return mockModel(() => {});
      },
    });
    new Mastra({ agents: { builder: agent }, agentControllers: { builder: controller }, storage: new InMemoryStore() });
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext, id: 'session-1', resourceId: 'company:c:person:p' });

    await session.sendMessage({ content: 'lorem ipsum '.repeat(40_000), requestContext });

    await vi.waitFor(() => expect(resolvedMemory.length).toBeGreaterThan(0));
    expect(asked[0]).toEqual({ resourceId: 'company:c:person:p', sessionId: 'session-1' });
    expect(resolvedMemory[0]?.modelId).toBe('host/observer');
    expect(resolvedMemory[0]?.call).toMatchObject({ resourceId: 'company:c:person:p', sessionId: 'session-1' });
  }, 30_000);
});
