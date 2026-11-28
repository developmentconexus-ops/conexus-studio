import type { AgentControllerMode } from '@mastra/core/agent-controller';
import type { ModelId } from '../../../config.js';

export const PLAN_MODE_ID = 'plan';
export const BUILD_MODE_ID = 'build';

export function createBuilderModes(model: ModelId): AgentControllerMode[] {
  throw new Error('not implemented');
}
