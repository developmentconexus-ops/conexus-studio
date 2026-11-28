import { Mastra } from '@mastra/core/mastra';
import { E2BSandbox } from '@mastra/e2b';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { PostgresStoreVNext } from '@mastra/pg';
import { ConexusHarness, HARNESS_APP_ID_KEY } from '../src/index.js';
import { studioPublishTool } from './studio-publish.js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const harness = new ConexusHarness({
  sandbox: ({ appId }) => {
    const sandbox = new E2BSandbox({
      id: `conexus-harness-studio-${appId}`,
      template: 'conexus-harness-builder',
      timeout: 30 * 60 * 1000,
    });
    return { sandbox, filesystem: sandbox.filesystem };
  },
  model: { builder: { defaultId: 'anthropic/claude-sonnet-5-5' } },
  tools: { publish: studioPublishTool },
  // The Studio plan card route only reads plans from .mastracode/plans (@mastra/server plans-DGC1grMp.js PLANS_DIRECTORY, isPlanPath).
  plansDir: '.mastracode/plans',
});

const prepared = await harness.prepare();

export const mastra = new Mastra({
  ...prepared,
  server: {
    ...prepared.server,
    middleware: [
      {
        path: '/api/*',
        handler: async (c, next) => {
          c.get('requestContext').set(HARNESS_APP_ID_KEY, process.env.STUDIO_APP_ID ?? 'studio-app');
          await next();
        },
      },
    ],
  },
  storage: new PostgresStoreVNext({
    id: 'studio',
    connectionString: requiredEnv('DATABASE_URL'),
    observability: { connectionString: requiredEnv('OBSERVABILITY_DATABASE_URL') },
  }),
  observability: new Observability({
    configs: {
      studio: { serviceName: 'conexus-harness-studio', exporters: [new MastraStorageExporter()] },
    },
  }),
});

await harness.finalize();
