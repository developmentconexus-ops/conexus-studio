import type { AgentControllerRequestContext } from '@mastra/core/agent-controller';
import type { MastraModelConfig } from '@mastra/core/llm';
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import type { RequestContext } from '@mastra/core/request-context';
import type { ConversationOwner, HarnessModels, MemoryModels, ModelCall, ModelId } from '../../config.js';
import { ModelNotSeededError } from '../../models.js';

export type ResolvedModels = Required<HarnessModels>;

const DEFAULT_BUILDER_MODEL: ModelId = 'anthropic/claude-sonnet-5-5';
const DEFAULT_MEMORY_MODEL: ModelId = 'anthropic/claude-haiku-5-5';

export function withModelDefaults(models: HarnessModels = {}): ResolvedModels {
  return {
    defaultFor: models.defaultFor ?? (() => DEFAULT_BUILDER_MODEL),
    resolve: models.resolve ?? ((modelId) => modelId),
    memoryFor: models.memoryFor ?? ((): MemoryModels => ({ observer: DEFAULT_MEMORY_MODEL, reflector: DEFAULT_MEMORY_MODEL })),
  };
}

/**
 * O core não aplica o modelo da sessão ao agente: ele só o põe em `requestContext.get('controller')`, com o dono e o
 * `session.modelId` ('' enquanto a conversa não tem escolha). Este arquivo é o único que lê essa chave.
 */
function controllerOf(requestContext: RequestContext): AgentControllerRequestContext | undefined {
  return requestContext.get('controller');
}

/** O dono da chamada. Na memória em segundo plano o core ainda grava o `resourceId` do turno, mesmo sem a entrada `controller`. */
export function ownerOf(requestContext: RequestContext): ConversationOwner | undefined {
  const controller = controllerOf(requestContext);
  if (controller) return { resourceId: controller.resourceId, sessionId: controller.sessionId };
  const resourceId = requestContext.get(MASTRA_RESOURCE_ID_KEY);
  return typeof resourceId === 'string' ? { resourceId, sessionId: '' } : undefined;
}

/** O `model` do agente: só lê o id gravado na conversa. Sem id, falha, nunca escolhe um modelo escondido. */
export function builderModel({ resolve }: ResolvedModels) {
  return async ({ requestContext }: { requestContext: RequestContext }): Promise<MastraModelConfig> => {
    const controller = controllerOf(requestContext);
    if (!controller?.session.modelId) throw new ModelNotSeededError();
    const call: ModelCall = { resourceId: controller.resourceId, sessionId: controller.sessionId, requestContext };
    return resolve(controller.session.modelId, call);
  };
}

/** O modelo de um papel da memória: o host diz o id pelo dono, e o `resolve` o transforma em modelo com chave. */
export function memoryModel({ memoryFor, resolve }: ResolvedModels, role: keyof MemoryModels) {
  return async ({ requestContext }: { requestContext: RequestContext }): Promise<MastraModelConfig> => {
    const owner = ownerOf(requestContext);
    if (!owner) throw new Error('Memory call without a conversation owner: no controller entry and no resource id.');
    return resolve((await memoryFor(owner))[role], { ...owner, requestContext });
  };
}
