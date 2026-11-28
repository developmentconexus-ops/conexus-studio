import { Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import type { AppSandboxes } from '../../sandboxes.js';
import { appIdFrom } from '../../sandboxes.js';

/** Destino do `copy('skills', ...)` em e2b/builder-template.ts. Um teste confere que os dois batem. */
export const SKILLS_DIR = '/home/user/skills';

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
