import { MastraStorageExporter, Observability } from '@mastra/observability';

export const observability = new Observability({
  configs: {
    studio: {
      serviceName: 'conexus-studio',
      exporters: [new MastraStorageExporter()],
    },
  },
});
