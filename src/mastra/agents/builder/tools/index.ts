import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { HarnessTools } from '../../../config.js';

/** Ferramentas que o controller injeta nas sessões dele e que o chat do Studio também precisa. */
export const CONTROLLER_BUILTIN_TOOL_IDS = [
  'ask_user',
  'submit_plan',
  'task_write',
  'task_update',
  'task_complete',
  'task_check',
] as const;

/** As ferramentas do agente: nativas + preview_url + as do host. */
export function builderTools(
  hostTools: HarnessTools | undefined,
): (args: { requestContext: RequestContext }) => Promise<ToolsInput> {
  throw new Error('not implemented');
}
