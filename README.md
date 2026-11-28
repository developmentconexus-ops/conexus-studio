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
- `model`: opcional. `{ defaultFor?, resolve?, memoryFor? }`, as decisões do host sobre modelos (veja "O modelo de cada
  conversa").
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
`POST /api/agent-controller/builder/sessions/:sid/model` o troca. O controller não aplica essa escolha ao agente: ele
só a põe em `requestContext.get('controller').session.modelId`. O pacote lê essa chave uma vez, na função `model` do
agente. O host nunca precisa conhecê-la.

O host passa até três funções em `model`, todas opcionais:

```ts
new ConexusHarness({
  sandbox,
  model: {
    defaultFor: async ({ resourceId, sessionId }) => modeloInicialDe(resourceId),
    resolve: async (modelId, { resourceId, requestContext }) => ({ id: modelId, apiKey: await chaveDe(resourceId, modelId) }),
    // ou, para girar entre contas, uma lista ModelWithRetries[] (veja "Várias contas, em ordem")
    memoryFor: async ({ resourceId }) => ({ observer: modeloDaMemoriaDe(resourceId), reflector: modeloDaMemoriaDe(resourceId) }),
  },
});
```

- **O host.** `defaultFor` diz o modelo de uma conversa nova. `resolve` junta o id com a credencial (um modelo ou uma lista de contas) e recusa um id não
  permitido, lançando erro. `memoryFor` diz os modelos da memória do dono. Sem elas: Sonnet 5.5 no Construtor, Haiku 5.5
  na memória, e o id vai direto ao roteador do Mastra, com a chave do ambiente.
- **O Studio.** Não passa nada. Ele recebe Sonnet 5.5, Haiku 5.5 e a chave do ambiente.
- **A UI.** Lê o modelo da conversa pela rota nativa `GET` da sessão. Logo depois de criada, a sessão já tem o padrão
  gravado, então a UI não vê mais `''`.
- **A conversa fica no modelo com que nasceu.** O pacote chama `defaultFor` uma vez, quando a sessão nasce sem modelo
  gravado (`onSessionCreated` bloqueante e `session.model.switch`). Se o padrão da empresa mudar, as conversas antigas
  não mudam. A retomada com escolha gravada não é tocada.
- **A troca vale no turno seguinte.** Pela rota nativa ou por `session.model.switch`.
- **Várias contas, em ordem.** `resolve` pode devolver uma lista, o tipo nativo `ModelWithRetries[]` do Agent
  (`HarnessModel` é `MastraModelConfig | ModelWithRetries[]`). O pacote entrega a lista ao Agent sem mudar, e o Agent
  tenta as entradas na ordem: se a primeira falha, a seguinte serve. O mesmo vale para observer e reflector, que passam
  pelo mesmo `resolve`.

  ```ts
  resolve: async (modelId, { resourceId }) =>
    (await contasDe(resourceId, modelId)).map((conta) => ({
      id: `${modelId}:${conta.id}`,
      model: modeloDa(conta),
      maxRetries: 0,
    })),
  ```

  O que o Mastra pede de cada entrada, conferido no código do `@mastra/core` 1.86.0:
  - `id` único em cada entrada. Duas contas do mesmo modelo têm o mesmo `modelId`, e o Agent acha a entrada ativa pelo
    `id`. Com ids repetidos, o passo seguinte do agente volta a tentar a primeira conta.
  - Entrada barata de montar. O Agent resolve todas as entradas (modelo, `headers`, `modelSettings`, `providerOptions`)
    antes de tentar a primeira. Então `modeloDa(conta)` não deve abrir a credencial de contas que talvez nem sejam
    usadas: o host monta cada modelo para ler a credencial só ao enviar.
  - Lista não vazia, com modelos v2 ou v3. Lista vazia lança erro, e modelo v1 não entra em lista.
  - `maxRetries` da entrada vale `0` quando omitido. Ele não cobre o retry de erro do Agent: o Construtor nasce de
    `createCodingAgent`, que repete um erro com `isRetryable` (como um 429) até 2 vezes na mesma entrada, com 3 s entre
    as tentativas e respeitando `Retry-After` (até 30 s), antes de passar à seguinte. O pacote não muda isso.
  - Erro ao abrir o stream, ou stream que cai, passa à entrada seguinte. Um chunk `error` que o provedor manda no meio
    do stream chega ao chamador sem trocar de entrada (medido com modelos de teste).
- **Id recusado não roda.** `resolve` é a autoridade da lista permitida. Se ela lança erro, o turno falha com esse mesmo
  erro, e nada cai em outro modelo. Se `defaultFor` falhar, a conversa fica sem modelo e o primeiro turno falha. O host
  pode conferir `session.model.hasSelection()` depois do `createSession`.
- **Memória.** Observer e reflector pedem `memoryFor(owner)` a cada chamada e passam pelo mesmo `resolve`, então usam a
  conta da empresa e respeitam a lista permitida. O dono vem de `MASTRA_RESOURCE_ID_KEY`. O seletor de modelo de memória
  por thread do controller (`omConfig`) continua desligado.
- **Thread nova na mesma sessão.** Ela recebe o padrão pelo evento `thread_created`. Se `defaultFor` devolve uma
  Promise, o primeiro turno de uma thread criada e usada logo em seguida pode rodar antes do padrão chegar e falha, em vez
  de rodar em modelo errado. O Hub abre uma thread por sessão, e o Studio usa um padrão em texto, então nenhum dos dois
  passa por isso. Uma thread clonada nasce sem modelo e recebe o padrão, porque o core não copia `currentModelId`.
- A lista de modelos do seletor e a validação do id que a rota de troca recebe são do host.

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
