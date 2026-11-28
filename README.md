# conexus-studio

Projeto Mastra puro onde cada agente do Conexus nasce e é validado no Mastra Studio antes de entrar no Conexus. Aqui não há ferramentas, usuário, login nem biblioteca de UI do Conexus.

## Rodar

```bash
cp .env.example .env   # preencha ANTHROPIC_API_KEY, E2B_API_KEY e DATABASE_URL
npm install
npm run dev            # Studio em http://localhost:4111, API em /api
```

## Pedir um app no chat do Studio

O chat do Studio fala com o agente direto, sem o controller. O Construtor trabalha como o modo build do Mastra Code: tarefa simples faz direto, tarefa não trivial usa a lista de tarefas, um passo por vez, e pergunta quando há caminhos que mudam o escopo. Quando o app roda, devolve o link da E2B (`preview_url`). O modo plan só existe pelas rotas do controller e entra quando a pessoa pede.

As rotas nativas do `AgentController` ficam em `/api/agent-controller/builder/...` e a especificação completa em `/api/openapi.json`.

## Árvore

```
src/mastra/
  agents/builder/
    index.ts      createCodingAgent e AgentController
    prompt.ts     instruções do agente (Working Style do build do Mastra Code, link do app)
    modes.ts      modos plan (availableTools) e build
    tools.ts      preview_url (link do app na E2B) e publish, em ensaio
    sandbox.ts    máquina E2B e trava de escrita de arquivo de plano
    memory.ts     Observational Memory do Construtor
  storage.ts      PostgresStore, a única peça dividida entre agentes
  observability.ts  rastreamento no Postgres do Studio, com SensitiveDataFilter
  index.ts        a instância do Mastra
```

`prompt.ts` não se chama `instructions.ts` porque o `mastra dev` trata qualquer pasta de `agents/` com um `instructions.ts` como agente roteado pelo sistema de arquivos e exige `export default`.
