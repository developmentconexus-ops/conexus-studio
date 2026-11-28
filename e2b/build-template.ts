import { Template, defaultBuildLogger } from 'e2b';
import { TEMPLATE_NAME, builderTemplate } from './builder-template.ts';

const info = await Template.build(builderTemplate, TEMPLATE_NAME, {
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});

console.log(`template ${info.name} construído (templateId ${info.templateId}, buildId ${info.buildId})`);
