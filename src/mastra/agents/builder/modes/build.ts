import type { AgentControllerMode } from '@mastra/core/agent-controller';
import type { MastraModelConfig } from '@mastra/core/llm';

export const BUILD_MODE_ID = 'build';
export const APP_DIR = '/home/user/app';

export function createBuildMode(model: MastraModelConfig): AgentControllerMode {
  return {
    id: BUILD_MODE_ID,
    name: 'Build',
    description: 'Writes the app in the sandbox, runs it and proves it works.',
    defaultModelId: typeof model === 'string' ? model : undefined,
    instructions: `You are in BUILD mode. You can read, write and run commands in the sandbox.

- Build the app in ${APP_DIR}. If an approved plan exists, follow it step by step.
- Work in small steps and run each one before moving on.`,
    metadata: { default: true },
  };
}
