import { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import type { IMastraAuthProvider } from '@mastra/core/server';
import { InMemoryStore } from '@mastra/core/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HARNESS_APP_ID_KEY } from './config.js';
import type { HarnessMastraArgs } from './config.js';
import { ConexusHarness } from './harness.js';
import { createLocalMachines } from './testing/local-machines.js';
import type { LocalMachines } from './testing/local-machines.js';

let machines: LocalMachines;

beforeAll(async () => {
  machines = await createLocalMachines();
});

afterAll(async () => {
  await machines.dispose();
});

const fakeAuth: IMastraAuthProvider = {
  authenticateToken: async () => null,
  authorizeUser: () => false,
};

function newHarness(auth?: IMastraAuthProvider | null) {
  return new ConexusHarness({ sandbox: machines.factory, auth });
}

describe('ConexusHarness.prepare', () => {
  it('hands the host the Builder agent and controller and nothing that belongs to the host', async () => {
    const prepared = await newHarness().prepare();

    expect(Object.keys(prepared.agents ?? {})).toEqual(['builder']);
    expect(Object.keys(prepared.agentControllers ?? {})).toEqual(['builder']);
    for (const owned of ['storage', 'observability', 'logger']) {
      expect(prepared).not.toHaveProperty(owned);
    }
    expect(prepared.server?.middleware).toBeUndefined();
  });

  it('adds no auth when none is given', async () => {
    const prepared = await newHarness().prepare();

    expect(prepared.server?.auth).toBeUndefined();
    expect(prepared.studio?.auth).toBeUndefined();
  });

  it('puts the same auth provider in server and studio', async () => {
    const prepared = await newHarness(fakeAuth).prepare();

    expect(prepared.server?.auth).toBe(fakeAuth);
    expect(prepared.studio?.auth).toBe(fakeAuth);
  });

  it('tells the plan mode to use the plans directory from the config, with a neutral default', async () => {
    const planInstructions = async (plansDir?: string) => {
      const prepared = await new ConexusHarness({ sandbox: machines.factory, plansDir }).prepare();
      return prepared.agentControllers?.builder?.listModes().find((mode) => mode.id === 'plan')?.instructions;
    };

    expect(await planInstructions('studio/plans')).toContain('studio/plans/<slug>.md');
    expect(await planInstructions()).toContain('.conexus/plans/<slug>.md');
    expect(await planInstructions()).not.toContain('mastracode');
  });

  it('throws on the second call', async () => {
    const harness = newHarness();
    await harness.prepare();

    await expect(harness.prepare()).rejects.toThrow(/prepare\(\) runs once/);
  });
});

describe('ConexusHarness.finalize', () => {
  it('throws before prepare', async () => {
    await expect(newHarness().finalize()).rejects.toThrow(/needs prepare/);
  });

  it('passes after the new Mastra and can run twice', async () => {
    const harness = newHarness();
    const mastra = new Mastra({ ...(await harness.prepare()), storage: new InMemoryStore() });
    const controller = mastra.getAgentController('builder');
    if (!controller) throw new Error('the builder controller is not registered');
    const init = vi.spyOn(controller, 'init');

    await expect(harness.finalize()).resolves.toBeUndefined();
    await expect(harness.finalize()).resolves.toBeUndefined();

    expect(init).toHaveBeenCalled();
  });
});

describe('the Builder memory inside the host Mastra', () => {
  it('inherits the storage of the host', async () => {
    const harness = newHarness();
    const prepared: HarnessMastraArgs = await harness.prepare();
    const storage = new InMemoryStore();
    const mastra = new Mastra({ ...prepared, storage });
    await harness.finalize();

    const builder = mastra.getAgent('builder');
    const memory = await builder.getMemory();
    const thread = await memory?.createThread({ resourceId: 'r' });

    const stored = await (await storage.getStore('memory'))?.getThreadById({ threadId: thread?.id ?? '' });
    expect(thread).toBeDefined();
    expect(stored?.id).toBe(thread?.id);
  });
});

describe('ConexusHarness.shutdown', () => {
  it('stops the machines that were created, can run twice and works before prepare', async () => {
    const harness = newHarness();
    await expect(harness.shutdown()).resolves.toBeUndefined();

    const mastra = new Mastra({ ...(await harness.prepare()), storage: new InMemoryStore() });
    await harness.finalize();

    const workspace = await mastra.getAgent('builder').getWorkspace({ requestContext: new RequestContext() });
    const requestContext = new RequestContext();
    requestContext.set(HARNESS_APP_ID_KEY, 'shutdown-app');
    const sandbox = await workspace?.resolveSandbox({ requestContext });
    if (!sandbox) throw new Error('the workspace resolved no sandbox');
    const stop = vi.spyOn(sandbox, 'stop');

    await harness.shutdown();
    await expect(harness.shutdown()).resolves.toBeUndefined();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(await workspace?.resolveSandbox({ requestContext })).not.toBe(sandbox);
  });
});
