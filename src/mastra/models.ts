import type { ConversationOwner, ModelId } from './config.js';

/** O host lança este erro em `resolve` quando o dono da conversa não pode mais usar o modelo gravado nela. */
export class ModelNotAllowedError extends Error {
  readonly modelId: ModelId;
  readonly owner: ConversationOwner;

  constructor(modelId: ModelId, owner: ConversationOwner) {
    super(`Model ${modelId} is not allowed for this conversation. Choose another model.`);
    this.name = 'ModelNotAllowedError';
    this.modelId = modelId;
    this.owner = owner;
  }
}

/** A conversa não tem modelo gravado: a semeadura do padrão não rodou ou `defaultFor` falhou. */
export class ModelNotSeededError extends Error {
  constructor() {
    super('The conversation has no model: defaultFor did not seed one when it started.');
    this.name = 'ModelNotSeededError';
  }
}
