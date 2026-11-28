import type { AgentController, AgentControllerRequestContext, Session } from '@mastra/core/agent-controller';
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import type { RequestContext } from '@mastra/core/request-context';
import type { DynamicArgument } from '@mastra/core/types';
import type { HarnessModel, HarnessModels, ModelId } from '../../config.js';

type Models = Required<HarnessModels>;

function ownerOf(requestContext: RequestContext): { resourceId: string } {
  const resourceId = requestContext.get(MASTRA_RESOURCE_ID_KEY);
  if (typeof resourceId !== 'string' || resourceId === '') {
    throw new Error('No resourceId on this model call. The agent must run inside an AgentController session.');
  }
  return { resourceId };
}

export function builderModel({ resolve }: Pick<Models, 'resolve'>): DynamicArgument<HarnessModel> {
  return async ({ requestContext }: { requestContext: RequestContext }) => {
    const controller: AgentControllerRequestContext | undefined = requestContext.get('controller');
    const modelId = controller?.session.modelId;
    if (!modelId) throw new Error('This conversation has no model. The host must seed it before the first turn.');
    return resolve(modelId, { resourceId: ownerOf(requestContext).resourceId, requestContext });
  };
}

export function memoryModels({ resolve, memoryFor }: Pick<Models, 'resolve' | 'memoryFor'>): {
  observer: DynamicArgument<HarnessModel>;
  reflector: DynamicArgument<HarnessModel>;
} {
  const modelOf = (role: 'observer' | 'reflector'): DynamicArgument<HarnessModel> =>
    async ({ requestContext }: { requestContext: RequestContext }) => {
      const { resourceId } = ownerOf(requestContext);
      const models = await memoryFor({ resourceId });
      return resolve(models[role], { resourceId, requestContext });
    };
  return { observer: modelOf('observer'), reflector: modelOf('reflector') };
}

async function seed(session: Session, picked: ModelId | Promise<ModelId>): Promise<void> {
  if (typeof picked === 'string') session.model.set({ modelId: picked });
  await session.model.switch(await picked);
}

export function seedConversationModels(controller: AgentController, defaultFor: Models['defaultFor']): void {
  controller.onSessionCreated(
    async (session) => {
      const owner = { resourceId: session.identity.getResourceId(), sessionId: session.identity.getId() };
      session.subscribe((event) => {
        if (event.type !== 'thread_created' || session.model.hasSelection()) return;
        seed(session, defaultFor(owner)).catch(() => {});
      });
      if (!session.model.hasSelection()) await seed(session, defaultFor(owner));
    },
    { blocking: true },
  );
}
