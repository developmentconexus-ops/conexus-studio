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

/** Id do roteador do Mastra ("anthropic/claude-sonnet-5-5") ou apelido do host. Opaco para o pacote. */
export type ModelId = string;

/** De quem é a conversa. O pacote lê da sessão; o host interpreta o resourceId que ele mesmo criou. */
export interface ConversationOwner {
  readonly resourceId: string;
  readonly sessionId: string;
}

/** Uma chamada ao modelo: o dono mais o requestContext do turno, só para conferências do host. Nunca carrega segredo. */
export interface ModelCall extends ConversationOwner {
  readonly requestContext: RequestContext;
}

/** Os modelos da memória de quem é dono da conversa. */
export interface MemoryModels {
  readonly observer: ModelId;
  readonly reflector: ModelId;
}

/** O que o host decide sobre modelos. O pacote só lê o id gravado na conversa e nunca guarda segredo. */
export interface HarnessModels {
  /**
   * Modelo de uma conversa nova, decidido uma vez quando a sessão nasce (e numa thread nova da mesma sessão) sem
   * modelo gravado. O host pode decidir por empresa ou pessoa a partir do `resourceId`. Padrão: "anthropic/claude-sonnet-5-5".
   */
  defaultFor?: (owner: ConversationOwner) => ModelId | Promise<ModelId>;
  /**
   * Transforma o id gravado na conversa em modelo com a chave certa. Roda a cada chamada (Construtor e memória) e é a
   * autoridade da lista permitida: lança (`ModelNotAllowedError`) quando o dono não pode mais usar o id, nunca cai
   * calada em outro. Padrão: devolve o próprio id (roteador do Mastra, chave do ambiente).
   */
  resolve?: (modelId: ModelId, call: ModelCall) => MastraModelConfig | Promise<MastraModelConfig>;
  /**
   * Modelos da memória de quem é dono da conversa. Roda a cada observação e reflexão, então o host responde do próprio
   * cache. Não é congelado por conversa. Padrão: "anthropic/claude-haiku-5-5" nos dois.
   */
  memoryFor?: (owner: ConversationOwner) => MemoryModels | Promise<MemoryModels>;
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
