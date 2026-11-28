import type { AgentController } from '@mastra/core/agent-controller';
import { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { createTool, submitPlanTool } from '@mastra/core/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HARNESS_APP_ID_KEY } from '../../config.js';
import type { BuilderModelConfig } from '../../config.js';
import { AppSandboxes } from '../../sandboxes.js';
import { createLocalMachines } from '../../testing/local-machines.js';
import type { LocalMachines } from '../../testing/local-machines.js';
import { BUILDER_ID, createBuilder } from './controller.js';
import { createBuilderMemory } from './memory.js';
import { createBuilderModel } from './model.js';
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

function build(model: BuilderModelConfig = { defaultId: 'anthropic/claude-sonnet-5-5' }) {
  return createBuilder({
    model,
    memory: createBuilderMemory('anthropic/claude-haiku-5-5'),
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

describe('createBuilder', () => {
  it('gives the agent the controller tools, the web tools, preview_url and the host tools', async () => {
    const { agent } = build();

    const tools = await agent.listTools({ requestContext: requestContextFor('a') });

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

    const tools = await agent.listTools({ requestContext: requestContextFor('a') });

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
    const { agent, controller } = build({ defaultId: 'test/model', resolve: () => model });
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
    resolved: { modelId: string; requestContext: RequestContext }[];
    calls: string[];
  }

  function bootBuilder(options: { defaultId?: BuilderModelConfig['defaultId'] } = {}) {
    const seen: Seen = { resolved: [], calls: [] };
    const models = new Map<string, MastraModelConfig>();
    const modelFor = (modelId: string) => {
      let model = models.get(modelId);
      if (!model) {
        model = createMockModel({ mockText: 'ok', version: 'v2', spyStream: () => seen.calls.push(modelId) });
        Object.defineProperty(model, 'provider', { value: 'anthropic' });
        models.set(modelId, model);
      }
      return model;
    };
    const { agent, controller } = build({
      defaultId: options.defaultId ?? 'host/default',
      resolve: (modelId, { requestContext }) => {
        seen.resolved.push({ modelId, requestContext });
        return modelFor(modelId);
      },
    });
    new Mastra({ agents: { builder: agent }, agentControllers: { builder: controller }, storage: new InMemoryStore() });
    return { controller, seen };
  }

  async function talk(session: Awaited<ReturnType<AgentController['createSession']>>, requestContext: RequestContext) {
    await session.sendMessage({ content: 'hello', requestContext });
  }

  it('runs a new conversation on the host default', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });

    await talk(session, requestContext);

    expect(seen.calls).toEqual(['host/default']);
  });

  it('asks the host default per request, so each company or person can have its own', async () => {
    const asked: string[] = [];
    const { controller, seen } = bootBuilder({
      defaultId: ({ requestContext }) => {
        const appId = String(requestContext.get(HARNESS_APP_ID_KEY));
        asked.push(appId);
        return `host/default-of-${appId}`;
      },
    });
    await controller.init();
    for (const appId of ['a', 'b']) {
      const requestContext = requestContextFor(appId);
      const session = await controller.createSession({ requestContext, id: `session-${appId}`, resourceId: `resource-${appId}` });
      await talk(session, requestContext);
    }

    expect(seen.calls).toEqual(['host/default-of-a', 'host/default-of-b']);
    expect([...new Set(asked)]).toEqual(['a', 'b']);
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

  it('keeps the chosen model when the conversation is resumed in a new session', async () => {
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
  });

  it('starts a new conversation on the host default after another one switched models', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext });
    await session.model.switch('host/chosen');

    await session.thread.create({ requestContext });
    await talk(session, requestContext);

    expect(seen.calls).toEqual(['host/default']);
  });

  it('hands resolve the id, the request context of the turn and the session id', async () => {
    const { controller, seen } = bootBuilder();
    await controller.init();
    const requestContext = requestContextFor('a');
    const session = await controller.createSession({ requestContext, id: 'session-1' });
    await session.model.switch('host/chosen');

    await talk(session, requestContext);

    expect(seen.resolved.length).toBeGreaterThan(0);
    for (const { modelId, requestContext: received } of seen.resolved) {
      expect(modelId).toBe('host/chosen');
      expect(received.get(HARNESS_APP_ID_KEY)).toBe('a');
      expect(received.get('controller')).toMatchObject({ sessionId: 'session-1' });
    }
  });

  it('sends the id straight to the router when the host gives no resolve', async () => {
    const { model } = createBuilderModel({ defaultId: 'anthropic/claude-sonnet-5-5' });

    expect(await model({ requestContext: requestContextFor('a') })).toBe('anthropic/claude-sonnet-5-5');
  });

  it('resolves subagent models through the same resolve', () => {
    const requestContext = requestContextFor('a');
    const resolved: string[] = [];
    const { resolveSubagentModel } = createBuilderModel({
      defaultId: 'host/default',
      resolve: (modelId, args) => {
        resolved.push(`${modelId}:${args.requestContext.get(HARNESS_APP_ID_KEY)}`);
        return modelId;
      },
    });

    resolveSubagentModel('host/subagent', { requestContext });

    expect(resolved).toEqual(['host/subagent:a']);
  });
});
