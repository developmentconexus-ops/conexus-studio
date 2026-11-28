import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RequestContext } from '@mastra/core/request-context';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HARNESS_APP_ID_KEY } from '../../config.js';
import { AppSandboxes } from '../../sandboxes.js';
import { createLocalMachines } from '../../testing/local-machines.js';
import type { LocalMachines } from '../../testing/local-machines.js';
import { SKILLS_DIR, createBuilderWorkspace } from './workspace.js';

let machines: LocalMachines;

beforeAll(async () => {
  machines = await createLocalMachines();
});

afterAll(async () => {
  await machines.dispose();
});

function contextFor(appId: string): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set(HARNESS_APP_ID_KEY, appId);
  return requestContext;
}

describe('createBuilderWorkspace', () => {
  it('resolves the same sandbox for the same app and another for a different app', async () => {
    const workspace = createBuilderWorkspace(new AppSandboxes(machines.factory));

    const first = await workspace.resolveSandbox({ requestContext: contextFor('a') });
    const again = await workspace.resolveSandbox({ requestContext: contextFor('a') });
    const other = await workspace.resolveSandbox({ requestContext: contextFor('b') });

    expect(first).toBeDefined();
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it('resolves the filesystem of the app machine', async () => {
    const sandboxes = new AppSandboxes(machines.factory);
    const workspace = createBuilderWorkspace(sandboxes);

    const filesystem = await workspace.resolveFilesystem({ requestContext: contextFor('fs-app') });

    expect(filesystem).toBe(sandboxes.forApp('fs-app').filesystem);
  });

  it('fails a request without an app instead of sharing a machine', async () => {
    const workspace = createBuilderWorkspace(new AppSandboxes(machines.factory));

    await expect(workspace.resolveSandbox({ requestContext: new RequestContext() })).rejects.toThrow(/app id/);
  });

  it('discovers the skills on the disk of the resolved app machine', async () => {
    const workspace = createBuilderWorkspace(new AppSandboxes(machines.factory));
    const skillDir = join(machines.root, 'skill-app', SKILLS_DIR, 'demo-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: demo-skill\ndescription: A skill used only by the test.\n---\n\nDo the demo.\n',
    );

    const scoped = await workspace.skills?.getScoped?.({ requestContext: contextFor('skill-app') });
    const names = (await scoped?.list())?.map((skill) => skill.name);

    expect(names).toEqual(['demo-skill']);
  });

  it('does not show the skills of one app to another', async () => {
    const workspace = createBuilderWorkspace(new AppSandboxes(machines.factory));
    const skillDir = join(machines.root, 'owner', SKILLS_DIR, 'private-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: private-skill\ndescription: Only the owner machine has it.\n---\n\nSecret.\n',
    );

    const scoped = await workspace.skills?.getScoped?.({ requestContext: contextFor('stranger') });

    expect(await scoped?.list()).toEqual([]);
  });
});
