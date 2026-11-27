import type { AgentControllerMode } from '@mastra/core/agent-controller';
import { WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { posix } from 'node:path';

export const MODEL_ID = 'anthropic/claude-sonnet-5-5';

export const SANDBOX_HOME = '/home/user';
export const APP_DIR = `${SANDBOX_HOME}/app`;
export const PLANS_DIR = `${SANDBOX_HOME}/plans`;

export const PLAN_MODE_ID = 'plan';
export const BUILD_MODE_ID = 'build';

export function isPlanFilePath(path: string): boolean {
  const absolute = posix.resolve(SANDBOX_HOME, path);
  return posix.extname(absolute).toLowerCase() === '.md' && posix.dirname(absolute) === PLANS_DIR;
}

export const PLAN_MODE_WORKSPACE_TOOLS: ReadonlySet<string> = new Set([
  WORKSPACE_TOOLS.FILESYSTEM.READ_FILE,
  WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES,
  WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT,
  WORKSPACE_TOOLS.FILESYSTEM.GREP,
  WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE,
  WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE,
]);

const planMode: AgentControllerMode = {
  id: PLAN_MODE_ID,
  name: 'Plan',
  description: 'Reads, asks questions and writes the plan. Never writes app code or runs commands.',
  defaultModelId: MODEL_ID,
  transitionsTo: BUILD_MODE_ID,
  instructions: `You are in PLAN mode.

- You can read, search and ask the user questions. You cannot run commands and you cannot write app code.
- The only files you may write are markdown files directly inside ${PLANS_DIR}.
- Ask the user whenever a choice would change what gets built. Do not guess.
- Write the plan to ${PLANS_DIR}/<slug>.md, starting with a "# Title" heading: what the app does, the screens, the stack, the files to create and how you will prove it works.
- Then call submit_plan with that path. Never paste the plan body in chat.
- If the user asks for changes, edit the same file and call submit_plan again.`,
  metadata: { default: false },
};

const buildMode: AgentControllerMode = {
  id: BUILD_MODE_ID,
  name: 'Build',
  description: 'Writes the app in the sandbox, runs it and proves it works.',
  defaultModelId: MODEL_ID,
  instructions: `You are in BUILD mode. You can read, write and run commands in the sandbox.

- Build the app in ${APP_DIR}. If an approved plan exists, follow it step by step.
- Work in small steps and run each one before moving on.`,
  metadata: { default: true },
};

export const modes: AgentControllerMode[] = [buildMode, planMode];
