import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { builderTools } from './index.js';

function fakeTool(id: string) {
  return createTool({ id, description: id, inputSchema: z.object({}), execute: async () => ({}) });
}

describe('builderTools', () => {
  it('adds the host tools given as an object', async () => {
    const publish = fakeTool('publish');

    const tools = await builderTools({ publish })({ requestContext: new RequestContext() });

    expect(tools.publish).toBe(publish);
    expect(tools.preview_url).toBeDefined();
  });

  it('resolves host tools given as a function with the request context', async () => {
    const requestContext = new RequestContext();
    requestContext.set('company', 'acme');
    const seen: unknown[] = [];

    const tools = await builderTools(({ requestContext: received }) => {
      seen.push(received.get('company'));
      return { publish: fakeTool('publish') };
    })({ requestContext });

    expect(seen).toEqual(['acme']);
    expect(Object.keys(tools)).toContain('publish');
  });

  it('works without host tools', async () => {
    const tools = await builderTools(undefined)({ requestContext: new RequestContext() });

    expect(Object.keys(tools)).toContain('submit_plan');
  });

  it('refuses a host tool that would replace one of the Builder tools', async () => {
    await expect(
      builderTools({ submit_plan: fakeTool('submit_plan') })({ requestContext: new RequestContext() }),
    ).rejects.toThrow(/submit_plan/);
  });
});
