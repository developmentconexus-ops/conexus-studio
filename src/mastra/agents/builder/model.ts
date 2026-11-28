import type { MastraModelConfig } from '@mastra/core/llm';
import type { AgentControllerRequestContext } from '@mastra/core/agent-controller';
import { RequestContext } from '@mastra/core/request-context';
import type { BuilderModelConfig, ModelArgs } from '../../config.js';

export interface BuilderModel {
  /** O `model` do agente: roda a cada chamada ao modelo, com o `requestContext` do turno. */
  model: (args: ModelArgs) => Promise<MastraModelConfig>;
  /** O `resolveSubagentModel` do controller: o mesmo `resolve` do host. */
  resolveSubagentModel: (modelId: string, options: { requestContext?: RequestContext }) => MastraModelConfig;
}

/**
 * O core não aplica o modelo da sessão ao agente: ele só o põe em `requestContext.get('controller').session.modelId`,
 * que é '' enquanto a conversa não tem escolha. Este é o único lugar que lê essa chave.
 */
export function createBuilderModel({ defaultId, resolve }: BuilderModelConfig): BuilderModel {
  const toModel = (modelId: string, args: ModelArgs): MastraModelConfig => (resolve ? resolve(modelId, args) : modelId);

  return {
    model: async ({ requestContext }) => {
      const controller: AgentControllerRequestContext | undefined = requestContext.get('controller');
      const modelId =
        controller?.session.modelId || (typeof defaultId === 'function' ? await defaultId({ requestContext }) : defaultId);
      return toModel(modelId, { requestContext });
    },
    resolveSubagentModel: (modelId, { requestContext }) =>
      toModel(modelId, { requestContext: requestContext ?? new RequestContext() }),
  };
}
