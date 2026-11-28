import type { AgentController } from '@mastra/core/agent-controller';
import type { ConversationOwner, ModelId } from '../../config.js';

type DefaultFor = (owner: ConversationOwner) => ModelId | Promise<ModelId>;
type Seedable = Parameters<Parameters<AgentController['onSessionCreated']>[0]>[0];

async function seed(session: Seedable, defaultFor: DefaultFor): Promise<void> {
  if (session.model.hasSelection()) return;
  const modelId = await defaultFor({ resourceId: session.identity.getResourceId(), sessionId: session.identity.getId() });
  if (session.model.hasSelection()) return;
  await session.model.switch(modelId);
}

/**
 * Grava o padrão do host como o modelo da conversa quando ela nasce sem escolha: o core o persiste na thread e o `GET`
 * da sessão já o mostra. Uma thread nova na mesma sessão recebe o padrão pelo evento `thread_created`. Retomada com
 * escolha gravada não é tocada. Falha de `defaultFor` não sobe daqui: o primeiro turno falha com `ModelNotSeededError`.
 */
export function seedConversationModels(controller: AgentController, defaultFor: DefaultFor): () => void {
  return controller.onSessionCreated(
    async (session) => {
      await seed(session, defaultFor);
      session.subscribe((event) => {
        if (event.type === 'thread_created') seed(session, defaultFor).catch(() => {});
      });
    },
    { blocking: true },
  );
}
