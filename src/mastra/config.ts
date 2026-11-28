import type { ToolsInput } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { Mastra } from '@mastra/core/mastra';
import type { RequestContext } from '@mastra/core/request-context';
import type { IMastraAuthProvider } from '@mastra/core/server';
import type { WorkspaceFilesystem, WorkspaceSandbox } from '@mastra/core/workspace';

/** Chave do RequestContext com o app da requisição. O host põe; o pacote só lê. */
export const HARNESS_APP_ID_KEY = 'conexus-harness.appId';

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

/** Argumentos que o pacote passa às funções de modelo do host. */
export interface ModelArgs {
  requestContext: RequestContext;
}

/** Qual modelo o Construtor usa. O host decide o padrão e como um id vira modelo (e chave). */
export interface BuilderModelConfig {
  /**
   * Modelo de uma conversa que ainda não tem escolha, por empresa ou pessoa se o host quiser. Função: roda a cada turno
   * dessas conversas, com o `requestContext` do turno.
   */
  defaultId: string | ((args: ModelArgs) => string | Promise<string>);
  /**
   * Transforma o id (o da conversa ou o padrão) no modelo com a chave certa. Síncrona porque o core não espera o
   * `resolveSubagentModel`. Sem ela, o id vai ao roteador do Mastra e a chave sai do ambiente.
   */
  resolve?: (modelId: string, args: ModelArgs) => MastraModelConfig;
}

export interface HarnessModels {
  /** Padrão: { defaultId: "anthropic/claude-sonnet-5-5" }. */
  builder?: BuilderModelConfig;
  /** Id do gateway ou modelo do AI SDK. Fixo para todos. Padrão: "anthropic/claude-haiku-5-5". */
  memory?: MastraModelConfig;
}

export interface ConexusHarnessConfig {
  sandbox: AppMachineFactory;
  /** Omitido ou null: servidor aberto, só para o Studio local. */
  auth?: IMastraAuthProvider | null;
  model?: HarnessModels;
  tools?: HarnessTools;
  /** Pasta dos planos, relativa à raiz do disco da máquina. Padrão: ".conexus/plans". */
  plansDir?: string;
}

type MastraArgs = NonNullable<ConstructorParameters<typeof Mastra>[0]>;

/** O que o pacote entrega ao `new Mastra` do host. Nunca storage, observability, logger nem server.middleware. */
export type HarnessMastraArgs = Pick<MastraArgs, 'agents' | 'agentControllers' | 'server' | 'studio'>;
