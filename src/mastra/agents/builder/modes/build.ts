import type { AgentControllerMode } from '@mastra/core/agent-controller';
import type { ModelId } from '../../../config.js';
import { BUILD_MODE_ID } from './ids.js';

export const APP_DIR = '/home/user/app';

export function createBuildMode(model: ModelId): AgentControllerMode {
  return {
    id: BUILD_MODE_ID,
    name: 'Build',
    description: 'Writes the app in the sandbox, runs it and proves it works.',
    defaultModelId: model,
    instructions: `You are in BUILD mode. You can read, write and run commands in the sandbox.

- Build the app in ${APP_DIR}. If an approved plan exists, follow it step by step.
- Work in small steps and run each one before moving on.`,
    metadata: { default: true },
  };
}
