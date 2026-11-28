import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const studioPublishTool = createTool({
  id: 'publish',
  description:
    'Publish the built app. Call it only after the app runs and you have proved it. In the Studio it is a dry run that returns what it would publish.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Short name for the app, in lowercase with dashes.'),
    directory: z.string().default('/home/user/app/dist').describe('Directory with the production build to publish.'),
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
