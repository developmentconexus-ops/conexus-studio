import { WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { describe, expect, it } from 'vitest';
import { APP_DIR } from './build.js';
import { BUILD_MODE_ID, PLAN_MODE_ID, createBuilderModes } from './index.js';
import { PLANS_DIR, PLAN_MODE_AVAILABLE_TOOLS } from './plan.js';

const modes = createBuilderModes('anthropic/claude-sonnet-5-5');
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

  it('keeps the plan where the Studio plan card reads it', () => {
    expect(PLANS_DIR).toBe('.mastracode/plans');
    expect(plan?.instructions).toContain(`${PLANS_DIR}/<slug>.md`);
    expect(build?.instructions).toContain(APP_DIR);
  });

  it('seeds both modes with the model it receives', () => {
    expect(modes.map((mode) => mode.defaultModelId)).toEqual(['anthropic/claude-sonnet-5-5', 'anthropic/claude-sonnet-5-5']);
  });
});
