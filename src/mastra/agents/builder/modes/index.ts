import type { AgentControllerMode } from '@mastra/core/agent-controller';
import { BUILD_MODE_ID, createBuildMode } from './build.js';
import { PLAN_MODE_ID, createPlanMode } from './plan.js';

export { BUILD_MODE_ID, PLAN_MODE_ID };

export function createBuilderModes({ plansDir }: { plansDir: string }): AgentControllerMode[] {
  return [createBuildMode(), createPlanMode({ plansDir })];
}
