import { RequestContext } from '@mastra/core/request-context';
import { supportsNetworking } from '@mastra/core/workspace';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const previewUrlTool = createTool({
  id: 'preview_url',
  description:
    'Get the public link to a web server running in the sandbox. Call it after you start the dev server in the background, check the link with web_fetch, and then give it to the user.',
  inputSchema: z.object({
    port: z.number().int().min(1).max(65535).default(5173).describe('Port the dev server listens on inside the sandbox.'),
  }),
  outputSchema: z.object({
    url: z.string(),
  }),
  execute: async ({ port }, context) => {
    const sandbox = await context.workspace?.resolveSandbox({
      requestContext: context.requestContext ?? new RequestContext(),
    });
    if (!sandbox || !supportsNetworking(sandbox)) {
      throw new Error('This sandbox cannot expose ports.');
    }
    const url = await sandbox.networking.getPortUrl(port);
    if (!url) {
      throw new Error(`No public URL for port ${port}. Is the sandbox running?`);
    }
    return { url };
  },
});
