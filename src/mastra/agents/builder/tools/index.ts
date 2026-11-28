import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import {
  askUserTool,
  submitPlanTool,
  taskCheckTool,
  taskCompleteTool,
  taskUpdateTool,
  taskWriteTool,
  webFetchTool,
  webSearchTool,
} from '@mastra/core/tools';
import type { HarnessTools } from '../../../config.js';
import { previewUrlTool } from './preview-url.js';

export const CONTROLLER_BUILTIN_TOOL_IDS = [
  'ask_user',
  'submit_plan',
  'task_write',
  'task_update',
  'task_complete',
  'task_check',
] as const;

const ownTools: ToolsInput = {
  ask_user: askUserTool,
  submit_plan: submitPlanTool,
  task_write: taskWriteTool,
  task_update: taskUpdateTool,
  task_complete: taskCompleteTool,
  task_check: taskCheckTool,
  web_search: webSearchTool,
  web_fetch: webFetchTool,
  preview_url: previewUrlTool,
};

export function builderTools(
  hostTools: HarnessTools | undefined,
): (args: { requestContext: RequestContext }) => Promise<ToolsInput> {
  return async ({ requestContext }) => {
    const host = typeof hostTools === 'function' ? await hostTools({ requestContext }) : (hostTools ?? {});
    const tools: ToolsInput = { ...ownTools };
    for (const [name, tool] of Object.entries(host)) {
      if (name in tools) throw new Error(`The host tool "${name}" would replace a tool the Builder already has.`);
      tools[name] = tool;
    }
    return tools;
  };
}
