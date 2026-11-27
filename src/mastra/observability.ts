import { MastraStorageExporter, Observability, SensitiveDataFilter } from '@mastra/observability';

export const observability = new Observability({
  configs: {
    studio: {
      serviceName: 'conexus-studio',
      exporters: [new MastraStorageExporter()],
      spanOutputProcessors: [new SensitiveDataFilter()],
    },
  },
});
