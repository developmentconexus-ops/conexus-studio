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
- `model`: opcional. `model.builder` é `{ defaultId, resolve? }` e `model.memory` é o modelo da memória (veja "O modelo de cada
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
`POST /api/agent-controller/builder/sessions/:sid/model` o troca. Mas o controller não aplica essa escolha ao agente: ele
só a põe em `requestContext.get('controller').session.modelId`. O pacote faz essa leitura, uma vez, na função `model` do
agente. O host nunca precisa conhecer essa chave.

```ts
new ConexusHarness({
  sandbox,
  model: {
    builder: {
      // Modelo de uma conversa sem escolha. Texto, ou função por empresa e pessoa (lê o seu requestContext).
      defaultId: ({ requestContext }) => modeloPadraoDe(requestContext),
      // Id vira modelo e chave. Opcional: sem ela o id vai ao roteador e a chave sai do ambiente.
      resolve: (modelId, { requestContext }) => ({ id: modelId, apiKey: chaveDe(requestContext) }),
    },
  },
});
```

- Conversa com escolha: o turno seguinte à troca já roda no modelo novo.
- Conversa sem escolha: roda em `defaultId`, perguntado a cada turno. Os modos não têm `defaultModelId`, porque ele só
  aceita texto fixo e alimenta `currentModelId` (o Mastra o grava na thread), então não saberia de quem é a conversa. Sem
  escolha, `session.modelId` fica `''` (o core documenta esse estado) e o padrão do host vale. Quem quiser mostrar o
  padrão na tela o pergunta ao próprio host.
- Conversa nova na mesma sessão volta ao padrão do host, e não herda a escolha da anterior.
- `resolve` também é o `resolveSubagentModel` do controller. Ela é síncrona porque o core não espera esse resolvedor.
- O modelo da memória continua único e fixo. Chave por empresa na memória fica para depois.
- A lista de modelos permitidos e a validação do id que a rota de troca recebe são do host. A rota aceita qualquer texto.

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
