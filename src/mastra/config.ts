import type { ToolsInput } from '@mastra/core/agent';
import type { Mastra } from '@mastra/core/mastra';
import type { RequestContext } from '@mastra/core/request-context';
import type { IMastraAuthProvider } from '@mastra/core/server';
import type { WorkspaceFilesystem, WorkspaceSandbox } from '@mastra/core/workspace';

/** Chave do RequestContext com o app da requisição. O host põe; o pacote só lê. */
export const HARNESS_APP_ID_KEY = 'conexus-harness.appId';

/** Id de modelo do gateway do Mastra, como "anthropic/claude-sonnet-5-5". */
export type ModelId = `${string}/${string}`;

/** A máquina de um app: o sandbox e o disco dele. O pacote não importa nenhum provedor. */
export interface AppMachine {
  sandbox: WorkspaceSandbox;
  filesystem: WorkspaceFilesystem;
}

/** Cria a máquina de um app sem ligá-la. O Mastra liga na primeira ferramenta. */
export type AppMachineFactory = (ctx: { appId: string }) => AppMachine;

/** Ferramentas a mais que o host dá ao Construtor, como o `publish` vindo do MCP do Hub. */
export type HarnessTools =
  | ToolsInput
  | ((args: { requestContext: RequestContext }) => ToolsInput | Promise<ToolsInput>);

export interface HarnessModels {
  /** Padrão: "anthropic/claude-sonnet-5-5". */
  builder?: ModelId;
  /** Padrão: "anthropic/claude-haiku-5-5". */
  memory?: ModelId;
}

export interface ConexusHarnessConfig {
  sandbox: AppMachineFactory;
  /** Omitido ou null: servidor aberto, só para o Studio local. */
  auth?: IMastraAuthProvider | null;
  model?: HarnessModels;
  tools?: HarnessTools;
}

type MastraArgs = NonNullable<ConstructorParameters<typeof Mastra>[0]>;

/** O que o pacote entrega ao `new Mastra` do host. Nunca storage, observability, logger nem server.middleware. */
export type HarnessMastraArgs = Pick<MastraArgs, 'agents' | 'agentControllers' | 'server' | 'studio'>;
