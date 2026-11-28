import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore } from '@mastra/core/storage';
import { LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import { ConexusHarness } from '@leandrotca/conexus-harness';

const root = await mkdtemp(join(tmpdir(), 'host-smoke-'));

try {
  const harness = new ConexusHarness({
    model: {
      defaultFor: () => 'anthropic/claude-sonnet-5-5',
      memoryFor: () => ({ observer: 'anthropic/claude-haiku-5-5', reflector: 'anthropic/claude-haiku-5-5' }),
    },
    sandbox: ({ appId }) => {
      const basePath = join(root, appId);
      return {
        sandbox: new LocalSandbox({ id: `sandbox-${appId}`, workingDirectory: basePath }),
        filesystem: new LocalFilesystem({ id: `fs-${appId}`, basePath }),
      };
    },
  });

  const mastra = new Mastra({ ...(await harness.prepare()), storage: new InMemoryStore() });
  await harness.finalize();

  const builder = mastra.getAgent('builder');
  assert.equal(builder.id, 'builder');
  assert.ok(mastra.getAgentController('builder'));

  await harness.shutdown();
  await harness.shutdown();
  console.log('host-smoke: ok');
} finally {
  await rm(root, { recursive: true, force: true });
}
