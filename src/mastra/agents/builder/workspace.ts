import { Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import type { AppSandboxes } from '../../sandboxes.js';
import { appIdFrom } from '../../sandboxes.js';

/** Caminho das skills dentro da máquina. O template E2B grava a skill testar-app aqui. */
export const SKILLS_DIR = '/home/user/skills';

/** Uma Workspace só, com disco e sandbox resolvidos por app. */
export function createBuilderWorkspace(sandboxes: AppSandboxes): Workspace {
  return new Workspace({
    id: 'builder',
    filesystem: ({ requestContext }) => sandboxes.forApp(appIdFrom(requestContext)).filesystem,
    sandbox: ({ requestContext }) => sandboxes.forApp(appIdFrom(requestContext)).sandbox,
    sandboxCacheKey: ({ requestContext }) => appIdFrom(requestContext),
    skills: [SKILLS_DIR],
    tools: {
      [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { backgroundProcesses: { abortSignal: null } },
    },
  });
}
