import { RequestContext } from '@mastra/core/request-context';
import { LocalSandbox, Workspace } from '@mastra/core/workspace';
import type { WorkspaceSandbox } from '@mastra/core/workspace';
import { describe, expect, it } from 'vitest';
import { previewUrlTool } from './preview-url.js';

function workspaceWith(sandbox: WorkspaceSandbox): Workspace {
  return new Workspace({ id: 'preview-test', sandbox: () => sandbox });
}

async function runPreview(workspace: Workspace, port?: number) {
  const execute = previewUrlTool.execute;
  if (!execute) throw new Error('preview_url has no execute');
  return execute({ port: port ?? 5173 }, { workspace, requestContext: new RequestContext() });
}

describe('preview_url', () => {
  it('returns the public url of the port from the resolved sandbox', async () => {
    const sandbox = Object.assign(new LocalSandbox({ id: 'with-network' }), {
      networking: { getPortUrl: async (port: number) => `https://${port}-box.example.test` },
    });

    await expect(runPreview(workspaceWith(sandbox), 3000)).resolves.toEqual({ url: 'https://3000-box.example.test' });
  });

  it('fails clearly when the sandbox cannot expose ports', async () => {
    await expect(runPreview(workspaceWith(new LocalSandbox({ id: 'plain' })))).rejects.toThrow(/cannot expose ports/);
  });

  it('fails clearly when the port has no public url', async () => {
    const sandbox = Object.assign(new LocalSandbox({ id: 'not-running' }), {
      networking: { getPortUrl: async () => null },
    });

    await expect(runPreview(workspaceWith(sandbox), 4000)).rejects.toThrow(/No public URL for port 4000/);
  });
});
