import { createTool } from '@mastra/core/tools';
import { supportsNetworking } from '@mastra/core/workspace';
import { z } from 'zod';
import { APP_DIR } from './modes.js';

export const COMPANY_KEY = 'company';

export const publishTool = createTool({
  id: 'publish',
  description:
    'Publish the built app. Call it only after the app runs and you have proved it. Without a company in the request context it is a dry run that returns what it would publish.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Short name for the app, in lowercase with dashes.'),
    directory: z
      .string()
      .default(`${APP_DIR}/dist`)
      .describe('Directory with the production build to publish.'),
  }),
  outputSchema: z.object({
    published: z.boolean(),
    dryRun: z.boolean(),
    name: z.string(),
    directory: z.string(),
    files: z.array(z.string()),
    message: z.string(),
  }),
  execute: async ({ name, directory }, context) => {
    const company = context.requestContext?.get(COMPANY_KEY);
    if (company) {
      throw new Error('Real publishing is not wired yet.');
    }
    const entries = (await context.workspace?.filesystem?.readdir(directory)) ?? [];
    return {
      published: false,
      dryRun: true,
      name,
      directory,
      files: entries.map((entry) => (entry.type === 'directory' ? `${entry.name}/` : entry.name)),
      message: 'Dry run: nothing was published.',
    };
  },
});

const PREVIEW_PROBE_TIMEOUT_MS = 10_000;

export const previewTool = createTool({
  id: 'preview_url',
  description:
    'Get the public link to a web server running in the sandbox and check that it answers. Call it after you start the dev server in the background, and give the returned url to the user.',
  inputSchema: z.object({
    port: z.number().int().min(1).max(65535).default(5173).describe('Port the dev server listens on inside the sandbox.'),
  }),
  outputSchema: z.object({
    url: z.string(),
    reachable: z.boolean(),
    status: z.number().nullable(),
    message: z.string(),
  }),
  execute: async ({ port }, context) => {
    const sandbox = context.workspace?.sandbox;
    if (!sandbox || !supportsNetworking(sandbox)) {
      throw new Error('This sandbox cannot expose ports.');
    }
    const url = await sandbox.networking.getPortUrl(port);
    if (!url) {
      throw new Error(`No public URL for port ${port}. Is the sandbox running?`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(PREVIEW_PROBE_TIMEOUT_MS) });
      return {
        url,
        reachable: response.ok,
        status: response.status,
        message: response.ok
          ? 'The app answers at this URL.'
          : `The URL answered ${response.status}. The server is probably not running on port ${port} or is not listening on 0.0.0.0.`,
      };
    } catch (error) {
      return {
        url,
        reachable: false,
        status: null,
        message: `The URL did not answer: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const tools = { preview_url: previewTool, publish: publishTool };
