import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';
import type { AppMachine } from '../config.js';

export interface LocalMachines {
  root: string;
  created: string[];
  factory: (ctx: { appId: string }) => AppMachine;
  dispose: () => Promise<void>;
}

/** Um disco local que trata "/x" como "<basePath>/x", como o disco da E2B trata caminhos absolutos a partir da raiz da máquina. */
function rootedAt(basePath: string): WorkspaceFilesystem {
  const filesystem = new LocalFilesystem({ id: `fs-${basePath}`, basePath });
  return new Proxy(filesystem, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (first: unknown, ...rest: unknown[]) =>
        value.call(target, typeof first === 'string' && first.startsWith('/') ? first.slice(1) : first, ...rest);
    },
  });
}

/** Máquinas de teste sem custo: LocalSandbox e LocalFilesystem numa pasta temporária, uma subpasta por app. */
export async function createLocalMachines(): Promise<LocalMachines> {
  const root = await mkdtemp(join(tmpdir(), 'harness-machines-'));
  const created: string[] = [];
  return {
    root,
    created,
    factory: ({ appId }) => {
      created.push(appId);
      const basePath = join(root, appId);
      return {
        sandbox: new LocalSandbox({ id: `sandbox-${appId}`, workingDirectory: basePath }),
        filesystem: rootedAt(basePath),
      };
    },
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
