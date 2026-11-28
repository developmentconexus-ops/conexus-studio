import type { AgentControllerMode } from '@mastra/core/agent-controller';
import type { ModelId } from '../../../config.js';

export const PLANS_DIR = '.mastracode/plans';
export const PLAN_MODE_AVAILABLE_TOOLS: string[] = [];

export function createPlanMode(model: ModelId): AgentControllerMode {
  throw new Error('not implemented');
}
