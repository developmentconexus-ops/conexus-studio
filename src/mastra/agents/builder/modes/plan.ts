import type { AgentControllerMode } from '@mastra/core/agent-controller';
import { WORKSPACE_TOOLS } from '@mastra/core/workspace';
import type { MastraModelConfig } from '@mastra/core/llm';
import { BUILD_MODE_ID } from './build.js';

export const PLAN_MODE_ID = 'plan';

export const PLAN_MODE_AVAILABLE_TOOLS: string[] = [
  WORKSPACE_TOOLS.FILESYSTEM.READ_FILE,
  WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES,
  WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT,
  WORKSPACE_TOOLS.FILESYSTEM.GREP,
  WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE,
  WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE,
  'skill',
  'skill_read',
  'skill_search',
  'web_search',
  'web_fetch',
  'ask_user',
  'submit_plan',
  'task_write',
  'task_update',
  'task_complete',
  'task_check',
];

export function createPlanMode({ model, plansDir }: { model: MastraModelConfig; plansDir: string }): AgentControllerMode {
  return {
    id: PLAN_MODE_ID,
    name: 'Plan',
    description: 'Reads, asks questions and writes the plan. Never writes app code or runs commands.',
    defaultModelId: typeof model === 'string' ? model : undefined,
    transitionsTo: BUILD_MODE_ID,
    instructions: `You are in PLAN mode.

- You can read, search and ask the user questions. You cannot run commands. Do not write app code.
- The only files you write are markdown plan files directly inside ${plansDir}.
- Ask the user whenever a choice would change what gets built. Do not guess.
- Write the plan to ${plansDir}/<slug>.md, starting with a "# Title" heading: what the app does, the screens, the stack, the files to create and how you will prove it works.
- Then call submit_plan with that same relative path. Never paste the plan body in chat.
- If the user asks for changes, edit the same file and call submit_plan again.`,
    metadata: { default: false },
    availableTools: PLAN_MODE_AVAILABLE_TOOLS,
  };
}
