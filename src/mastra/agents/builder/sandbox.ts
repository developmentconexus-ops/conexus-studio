import { E2BSandbox } from '@mastra/e2b';
import { Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import type { WorkspaceToolHookContext } from '@mastra/core/workspace';
import { z } from 'zod';
import { PLAN_MODE_ID, PLANS_DIR, isPlanFilePath } from './modes.js';

const STUDIO_TEST_CONVERSATION = 'studio-test';
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;

const controllerContextSchema = z.object({
  threadId: z.string().nullable(),
  session: z.object({ modeId: z.string() }),
});

type RequestContextReader = { get: (key: string) => unknown };

function isRequestContextReader(value: unknown): value is RequestContextReader {
  return typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function';
}

function readController(requestContext: unknown) {
  if (!isRequestContextReader(requestContext)) return undefined;
  const parsed = controllerContextSchema.safeParse(requestContext.get('controller'));
  return parsed.success ? parsed.data : undefined;
}

export function planFileWriteGuard({ workspaceToolName, input, context }: WorkspaceToolHookContext) {
  const isWrite =
    workspaceToolName === WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE ||
    workspaceToolName === WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE;
  if (!isWrite) return;

  const requestContext = typeof context === 'object' && context !== null && 'requestContext' in context ? context.requestContext : undefined;
  if (readController(requestContext)?.session.modeId !== PLAN_MODE_ID) return;

  const parsedInput = z.object({ path: z.string() }).safeParse(input);
  if (parsedInput.success && isPlanFilePath(parsedInput.data.path)) return;

  return {
    proceed: false as const,
    output: `Plan mode can only write markdown files directly inside ${PLANS_DIR}.`,
  };
}

const workspaces = new Map<string, Workspace>();

function createConversationWorkspace(conversationId: string): Workspace {
  const sandbox = new E2BSandbox({
    id: `conexus-studio-${conversationId}`,
    timeout: SANDBOX_TIMEOUT_MS,
  });
  return new Workspace({
    id: `conexus-studio-${conversationId}`,
    filesystem: sandbox.filesystem,
    sandbox,
    tools: {
      hooks: { beforeToolCall: planFileWriteGuard },
      [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { backgroundProcesses: { abortSignal: null } },
    },
  });
}

export function conversationWorkspace({ requestContext }: { requestContext: unknown }): Workspace {
  const conversationId = readController(requestContext)?.threadId ?? STUDIO_TEST_CONVERSATION;
  const existing = workspaces.get(conversationId);
  if (existing) return existing;
  const created = createConversationWorkspace(conversationId);
  workspaces.set(conversationId, created);
  return created;
}
