# conexus-harness

A parte agêntica do Conexus, construída com as peças nativas do Mastra. Hoje ela tem o Construtor de apps. O
Assistente com o lago entra depois, com a mesma forma.

O repositório publica um pacote npm com uma classe, `ConexusHarness`. Ela segue o padrão do `MastraFactory`. O host
passa o que é dele, e o pacote entrega os argumentos do `new Mastra`:

```ts
import { Mastra } from '@mastra/core/mastra';
import { ConexusHarness } from '@leandrotca/conexus-harness';

const harness = new ConexusHarness({ sandbox, auth, model, tools, plansDir });
export const mastra = new Mastra({ ...(await harness.prepare()), storage, observability, logger });
await harness.finalize();
// no desligamento: await harness.shutdown();
```

- `sandbox`: a fábrica da máquina de cada app. O host escolhe o provedor (a E2B). O pacote guarda uma máquina por app.
- `auth`: o provedor de login do host. O pacote o põe em `server.auth` e em `studio.auth`.
- `model`: opcional. `{ defaultFor?, resolve?, memoryFor? }`, as três decisões do host sobre modelos (veja "O modelo de
  cada conversa").
- `tools`: ferramentas do host, como o `publish` que vem do Hub por MCP.
- `plansDir`: a pasta dos planos, opcional. O padrão é `.conexus/plans`.

`storage`, `observability` e `logger` ficam no `new Mastra` do host. O controller e a memória do Construtor herdam
os três da instância. O pacote não entrega middleware, porque servidores como o Fastify o ignoram.

## O Construtor

- `createCodingAgent` com um `AgentController` e dois modos. `build` é o padrão. `plan` só quando a pessoa pede, e
  ele vê apenas as ferramentas de leitura e de plano.
- Ferramentas nativas da Workspace (arquivos, terminal, skills), do controller (`ask_user`, `submit_plan`, `task_*`),
  `web_search` e `web_fetch`. A única ferramenta nossa é `preview_url`, que devolve o link do app rodando.
- Uma máquina E2B por app, reencontrada pelo id lógico. As conversas do mesmo app dividem a máquina.
- O agente testa o app dentro da máquina, com o `agent-browser` e o Chromium do template e a skill `testar-app`.
- O plano mora na pasta `plansDir`. O cartão de aprovação nativo do Studio só lê `.mastracode/plans/`, então a
  entrada do Studio passa essa pasta.
- Observational Memory em Haiku. O Construtor roda em Sonnet, se o host não disser outro modelo.

## O modelo de cada conversa

O Mastra grava o modelo escolhido em cada conversa (`currentModelId`, na thread), e a rota nativa
`POST /api/agent-controller/builder/sessions/:sid/model` o troca. Mas o controller não aplica essa escolha ao agente: ele
só a põe em `requestContext.get('controller').session.modelId`. O pacote faz essa leitura, uma vez, na função `model` do
agente. O host nunca precisa conhecer essa chave. O segredo nunca entra no `requestContext`: ele só existe no retorno de
`resolve`.

```ts
new ConexusHarness({
  sandbox,
  model: {
    // Uma vez por conversa, quando ela nasce. O host lê o próprio resourceId (empresa e pessoa).
    defaultFor: async ({ resourceId, sessionId }) => modeloInicialDe(resourceId),
    // A cada chamada ao modelo (Construtor e memória). Id vira modelo e chave. Lança ModelNotAllowedError se não vale mais.
    resolve: async (modelId, { resourceId, sessionId, requestContext }) => ({ id: modelId, apiKey: await chaveDe(resourceId, modelId) }),
    // A cada observação e reflexão da memória. O host responde do próprio cache.
    memoryFor: async ({ resourceId }) => ({ observer: modeloDaMemoriaDe(resourceId), reflector: modeloDaMemoriaDe(resourceId) }),
  },
});
```

Os três campos são opcionais. Sem eles: Sonnet 5.5 no Construtor, Haiku 5.5 na memória, e o id vai direto ao roteador do
Mastra, com a chave do ambiente.

- **Conversa nova.** O pacote liga `controller.onSessionCreated(..., { blocking: true })`. Se a sessão nasce sem modelo
  gravado, ele chama `defaultFor` uma vez e grava o resultado com `session.model.switch`. O padrão fica na thread, então
  o `GET` nativo da sessão já o mostra logo depois do `createSession`. Uma thread nova na mesma sessão recebe o padrão
  pelo evento `thread_created`, só com API pública. Os modos não têm `defaultModelId`: o core só distingue "sem escolha"
  de "padrão fixo" quando ele é vazio (`hasSelection()`).
- **Retomada.** Conversa com escolha gravada não é tocada, e `defaultFor` não roda de novo. Trocar o padrão da empresa
  não muda as conversas que já existem.
- **Troca.** O turno seguinte à troca (pela rota nativa ou por `session.model.switch`) já roda no modelo novo.
- **Falha fechada.** O core engole o erro do gancho. Se `defaultFor` falhar, a conversa fica sem modelo e o primeiro turno
  falha com `ModelNotSeededError`, em vez de rodar num modelo escondido. O host pode conferir `hasSelection()` depois do
  `createSession` e recusar a abertura. O mesmo erro vale fora de um turno do controller (por exemplo, `agent.listTools`
  sem a entrada `controller`).
- **Modelo que não vale mais.** `resolve` é a autoridade da lista permitida. Se o modelo gravado deixou de ser permitido
  (conta removida), ela lança `ModelNotAllowedError` e o turno falha com esse erro, para a UI abrir o seletor. Nunca cai
  calada em outro modelo. A rota de troca aceita qualquer texto: o host confere a lista antes, como atalho.
- **Thread nova na mesma sessão.** O padrão chega de forma assíncrona (`defaultFor` pode ser async). Quem cria a thread e
  fala logo em seguida pode ver `ModelNotSeededError`; espere o evento `model_changed` ou `session.model.hasSelection()`.
  O Hub cria uma thread por sessão, então só o gancho de `onSessionCreated` roda lá.
- **Memória.** Observer e reflector são funções (`observation.model` e `reflection.model`). Cada uma lê o dono da chamada,
  pede `memoryFor(owner)`, pega o seu papel e passa pelo mesmo `resolve`, então usa a conta da empresa e respeita a lista
  permitida. Diferente do modelo da conversa, não é congelado: se a empresa trocar, a próxima observação já usa o novo. O
  seletor de modelo de memória por thread do controller (`omConfig`) continua desligado. Se a chamada não trouxer a
  entrada `controller`, o dono sai de `MASTRA_RESOURCE_ID_KEY` (com `sessionId` vazio).
- A lista de modelos do seletor e a validação do id que a rota de troca recebe são do host.
- Sem subagentes por enquanto, então o pacote não liga `resolveSubagentModel`. Quando houver, ele é síncrono no core.

## O Studio é uma entrada de teste

`studio/index.ts` é um host como outro qualquer. Ele usa a mesma classe, com a E2B, um Postgres
(`PostgresStoreVNext`) e um middleware que escolhe o app de teste. Ele nunca é publicado. Validar no Studio é
validar o caminho que o Conexus vai usar.

```bash
cp .env.example .env   # ANTHROPIC_API_KEY, E2B_API_KEY, DATABASE_URL, OBSERVABILITY_DATABASE_URL, STUDIO_APP_ID
npm install
npm run check          # typecheck, testes, build e o teste do pacote instalado
npm run dev            # Studio em http://localhost:4111
```

O `npm run dev` precisa de dois bancos num Postgres. Para um Postgres local descartável:

```bash
docker run --rm -d --name harness-pg -e POSTGRES_PASSWORD=dev -p 55432:5432 postgres:17
docker exec harness-pg psql -U postgres -c "create database harness" -c "create database harness_obs"
# no fim: docker stop harness-pg
```

## Árvore

```
src/
  index.ts                 porta pública do pacote
  mastra/
    harness.ts             ConexusHarness: prepare, finalize, shutdown
    config.ts              config e tipos públicos
    sandboxes.ts           uma máquina por app
    agents/builder/
      prompt.ts  modes/  tools/  controller.ts  workspace.ts  memory.ts
studio/                    entrada do Studio, fora do pacote (nunca publicada)
e2b/                       template da máquina e a skill testar-app (chega com a unidade P1)
```

## Regras do projeto

- Peça nativa do Mastra primeiro. Uma peça própria só entra com aprovação do fundador.
- Siga o padrão de código do Mastra. Use uma classe com config para o que tem estado e ciclo de vida, e uma função
  de fábrica para o que só monta peças.
- Cada agente tem uma pasta em `src/mastra/agents/<nome>/`. Nunca ponha `config.ts` nem `instructions.*` nela,
  porque esses nomes ligam a descoberta por arquivos do `mastra dev`.
- Cada agente tem a sua memória. O banco é do host.
- O pacote não importa provedor de máquina nem de banco. `@mastra/*` e `zod` são `peerDependencies`. Deve existir
  uma só cópia do `@mastra/core` no host.
