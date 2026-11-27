# conexus-studio

Projeto Mastra puro onde cada agente do Conexus nasce e é validado no Mastra Studio antes de entrar no Conexus. Aqui não há ferramentas, usuário, login nem biblioteca de UI do Conexus.

## Rodar

```bash
cp .env.example .env   # preencha ANTHROPIC_API_KEY, E2B_API_KEY e DATABASE_URL
npm install
npm run dev            # Studio em http://localhost:4111, API em /api
```

As rotas nativas do `AgentController` ficam em `/api/agent-controller/builder/...` e a especificação completa em `/api/openapi.json`.

## Árvore

```
src/mastra/
  agents/builder/
    index.ts      createCodingAgent (sem workspace próprio) e AgentController
    prompt.ts     instruções do agente
    modes.ts      modos plan e build
    tools.ts      ferramenta publish, em ensaio
    sandbox.ts    máquina E2B por conversa e trava do modo plan
    memory.ts     Observational Memory do Construtor
  storage.ts      PostgresStore, a única peça dividida entre agentes
  index.ts        a instância do Mastra
```

`prompt.ts` não se chama `instructions.ts` porque o `mastra dev` trata qualquer pasta de `agents/` com um `instructions.ts` como agente roteado pelo sistema de arquivos e exige `export default`.
