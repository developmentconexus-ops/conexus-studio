import type { AgentControllerMode } from '@mastra/core/agent-controller';
import type { ModelId } from '../../../config.js';
import { createBuildMode } from './build.js';
import { createPlanMode } from './plan.js';

export { BUILD_MODE_ID, PLAN_MODE_ID } from './ids.js';

export function createBuilderModes({ model, plansDir }: { model: ModelId; plansDir: string }): AgentControllerMode[] {
  return [createBuildMode(model), createPlanMode({ model, plansDir })];
}
