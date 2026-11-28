import { Template } from 'e2b';

export const TEMPLATE_NAME = 'conexus-harness-builder';
export const AGENT_BROWSER_VERSION = '0.45.0';

export const builderTemplate = Template({ fileContextPath: import.meta.dirname })
  .fromNodeImage('24')
  .npmInstall([`agent-browser@${AGENT_BROWSER_VERSION}`], { g: true })
  .runCmd('agent-browser install --with-deps', { user: 'root' })
  .runCmd('agent-browser install')
  .copy('skills', '/home/user/skills')
  .makeDir('/.mastracode/plans', { user: 'root' })
  .runCmd('chown -R user:user /.mastracode', { user: 'root' });
