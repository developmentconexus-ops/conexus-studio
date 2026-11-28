import type { ModelWithRetries, ToolsInput } from '@mastra/core/agent';
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

/** Dono de uma chamada de modelo. O `resourceId` é o que o host deu à sessão (no Hub, `company:<c>:person:<p>`). */
export interface ModelOwner {
  readonly resourceId: string;
}

export interface ConversationOwner extends ModelOwner {
  readonly sessionId: string;
}

/** Uma chamada ao modelo: o dono mais o requestContext do turno. Nunca carrega segredo. */
export interface ModelCall extends ModelOwner {
  readonly requestContext: RequestContext;
}

/**
 * O que o `resolve` do host devolve: um modelo, ou a lista nativa do Agent (`ModelWithRetries[]`), usada para girar entre
 * contas. O pacote entrega o valor ao Agent sem mudar. Cada entrada de uma lista precisa de `id` único (duas contas do
 * mesmo modelo têm o mesmo `modelId`, e o Mastra acha a entrada ativa pelo id) e deve abrir a credencial só ao enviar,
 * porque o Mastra monta todas as entradas antes de tentar a primeira.
 */
export type HarnessModel = MastraModelConfig | ModelWithRetries[];

export interface MemoryModels {
  readonly observer: ModelId;
  readonly reflector: ModelId;
}

export interface HarnessModels {
  /** Modelo de uma conversa nova. Padrão: "anthropic/claude-sonnet-5-5". */
  defaultFor?: (owner: ConversationOwner) => ModelId | Promise<ModelId>;
  /** Id para modelo e chave. Lança erro se o id não for permitido. Padrão: o próprio id, que vai ao roteador. */
  resolve?: (modelId: ModelId, call: ModelCall) => HarnessModel | Promise<HarnessModel>;
  /** Modelos da memória do dono. Padrão: "anthropic/claude-haiku-5-5" nos dois. */
  memoryFor?: (owner: ModelOwner) => MemoryModels | Promise<MemoryModels>;
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
