import type { AgentControllerMode } from '@mastra/core/agent-controller';
import type { ModelId } from '../../../config.js';

export const APP_DIR = '/home/user/app';

export function createBuildMode(model: ModelId): AgentControllerMode {
  throw new Error('not implemented');
}
