import type { Workspace } from '@mastra/core/workspace';
import type { AppSandboxes } from '../../sandboxes.js';

/** Caminho das skills dentro da máquina. O template E2B grava a skill testar-app aqui. */
export const SKILLS_DIR = '/home/user/skills';

/** Uma Workspace só, com disco e sandbox resolvidos por app. */
export function createBuilderWorkspace(sandboxes: AppSandboxes): Workspace {
  throw new Error('not implemented');
}
