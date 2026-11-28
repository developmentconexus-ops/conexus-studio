import type { AgentControllerMode } from '@mastra/core/agent-controller';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createBuildMode } from './build.js';
import { createPlanMode } from './plan.js';

export { BUILD_MODE_ID, PLAN_MODE_ID } from './ids.js';

export function createBuilderModes({ model, plansDir }: { model: MastraModelConfig; plansDir: string }): AgentControllerMode[] {
  return [createBuildMode(model), createPlanMode({ model, plansDir })];
}
