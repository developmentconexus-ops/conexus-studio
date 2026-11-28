import { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { createTool, submitPlanTool } from '@mastra/core/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HARNESS_APP_ID_KEY } from '../../config.js';
import { AppSandboxes } from '../../sandboxes.js';
import { createLocalMachines } from '../../testing/local-machines.js';
import type { LocalMachines } from '../../testing/local-machines.js';
import { BUILDER_ID, createBuilder } from './controller.js';
import { createBuilderMemory } from './memory.js';
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

function build(model: MastraModelConfig = 'anthropic/claude-sonnet-5-5') {
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
  async function toolsSeenByTheModel(modeId: string): Promise<string[]> {
    let streamOptions: { tools?: { name: string }[] } | undefined;
    const model = createMockModel({
      mockText: 'ok',
      version: 'v2',
      spyStream: (options) => {
        streamOptions = options;
      },
    });
    Object.defineProperty(model, 'provider', { value: 'anthropic' });
    const { agent, controller } = build(model);
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

    return (streamOptions?.tools ?? []).map((tool) => tool.name);
  }

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
