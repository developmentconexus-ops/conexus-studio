import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RequestContext } from '@mastra/core/request-context';
import { LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HARNESS_APP_ID_KEY } from './config.js';
import type { AppMachine } from './config.js';
import { AppSandboxes, appIdFrom } from './sandboxes.js';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-sandboxes-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function localFactory() {
  const created: string[] = [];
  const factory = ({ appId }: { appId: string }): AppMachine => {
    created.push(appId);
    const basePath = join(root, appId);
    return {
      sandbox: new LocalSandbox({ id: `sandbox-${appId}`, workingDirectory: basePath }),
      filesystem: new LocalFilesystem({ id: `fs-${appId}`, basePath }),
    };
  };
  return { factory, created };
}

describe('AppSandboxes', () => {
  it('calls the factory once and returns the same machine for the same app', () => {
    const { factory, created } = localFactory();
    const sandboxes = new AppSandboxes(factory);

    const first = sandboxes.forApp('a');
    const second = sandboxes.forApp('a');

    expect(second).toBe(first);
    expect(created).toEqual(['a']);
  });

  it('calls the factory once per app', () => {
    const { factory, created } = localFactory();
    const sandboxes = new AppSandboxes(factory);

    const a = sandboxes.forApp('a');
    const b = sandboxes.forApp('b');

    expect(b).not.toBe(a);
    expect(created).toEqual(['a', 'b']);
  });

  it('does not share machines between instances', () => {
    const { factory, created } = localFactory();
    const one = new AppSandboxes(factory);
    const other = new AppSandboxes(factory);

    expect(one.forApp('a')).not.toBe(other.forApp('a'));
    expect(created).toEqual(['a', 'a']);
  });

  it('stops every created machine, can run twice, and recreates machines afterwards', async () => {
    const { factory, created } = localFactory();
    const sandboxes = new AppSandboxes(factory);
    const a = sandboxes.forApp('a');
    const b = sandboxes.forApp('b');
    const stopA = vi.spyOn(a.sandbox, 'stop');
    const stopB = vi.spyOn(b.sandbox, 'stop');

    await sandboxes.stopAll();
    await expect(sandboxes.stopAll()).resolves.toBeUndefined();

    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
    expect(sandboxes.forApp('a')).not.toBe(a);
    expect(created).toEqual(['a', 'b', 'a']);
  });

  it('stops the remaining machines and reports the failure when one stop rejects', async () => {
    const { factory } = localFactory();
    const sandboxes = new AppSandboxes(factory);
    const a = sandboxes.forApp('a');
    const b = sandboxes.forApp('b');
    vi.spyOn(a.sandbox, 'stop').mockRejectedValue(new Error('boom'));
    const stopB = vi.spyOn(b.sandbox, 'stop');

    await expect(sandboxes.stopAll()).rejects.toBeInstanceOf(AggregateError);
    expect(stopB).toHaveBeenCalledTimes(1);
  });
});

describe('appIdFrom', () => {
  it('reads the app id from the request context', () => {
    const requestContext = new RequestContext();
    requestContext.set(HARNESS_APP_ID_KEY, 'app-1');

    expect(appIdFrom(requestContext)).toBe('app-1');
  });

  it('throws on an empty request context', () => {
    expect(() => appIdFrom(new RequestContext())).toThrow(/app id/);
  });

  it('throws when the app id is not a non-empty string', () => {
    const requestContext = new RequestContext();
    requestContext.set(HARNESS_APP_ID_KEY, 42);
    expect(() => appIdFrom(requestContext)).toThrow(/app id/);

    requestContext.set(HARNESS_APP_ID_KEY, '');
    expect(() => appIdFrom(requestContext)).toThrow(/app id/);
  });
});
