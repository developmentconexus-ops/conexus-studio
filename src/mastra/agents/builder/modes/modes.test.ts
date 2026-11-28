import { WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { describe, expect, it } from 'vitest';
import { APP_DIR } from './build.js';
import { BUILD_MODE_ID, PLAN_MODE_ID, createBuilderModes } from './index.js';
import { PLAN_MODE_AVAILABLE_TOOLS } from './plan.js';

const modes = createBuilderModes({ model: 'anthropic/claude-sonnet-5-5', plansDir: '.conexus/plans' });
const plan = modes.find((mode) => mode.id === PLAN_MODE_ID);
const build = modes.find((mode) => mode.id === BUILD_MODE_ID);

describe('builder modes', () => {
  it('has a plan mode and a build mode, and build is the default', () => {
    expect(modes.map((mode) => mode.id).sort()).toEqual(['build', 'plan']);
    expect(build?.metadata).toMatchObject({ default: true });
    expect(plan?.metadata).toMatchObject({ default: false });
  });

  it('transitions from plan to build on approval', () => {
    expect(plan?.transitionsTo).toBe(BUILD_MODE_ID);
  });

  it('gives the plan mode no way to run commands or delete files', () => {
    expect(plan?.availableTools).toEqual(PLAN_MODE_AVAILABLE_TOOLS);
    expect(PLAN_MODE_AVAILABLE_TOOLS).not.toContain(WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND);
    expect(PLAN_MODE_AVAILABLE_TOOLS).not.toContain(WORKSPACE_TOOLS.FILESYSTEM.DELETE);
    expect(PLAN_MODE_AVAILABLE_TOOLS).toContain('submit_plan');
  });

  it('leaves the build mode unrestricted', () => {
    expect(build?.availableTools).toBeUndefined();
  });

  it('tells the model to write the plan in the plans directory it is given', () => {
    expect(plan?.instructions).toContain('.conexus/plans/<slug>.md');
    const custom = createBuilderModes({ model: 'anthropic/claude-sonnet-5-5', plansDir: 'custom/plans' }).find(
      (mode) => mode.id === PLAN_MODE_ID,
    );
    expect(custom?.instructions).toContain('custom/plans/<slug>.md');
    expect(custom?.instructions).not.toContain('.conexus/plans');
  });

  it('builds in the app directory', () => {
    expect(build?.instructions).toContain(APP_DIR);
  });

  it('seeds both modes with the model it receives', () => {
    expect(modes.map((mode) => mode.defaultModelId)).toEqual(['anthropic/claude-sonnet-5-5', 'anthropic/claude-sonnet-5-5']);
  });
});
