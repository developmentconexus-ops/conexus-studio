# Validação P2: o ciclo completo no Studio

Resultado de 2026-11-28. O ciclo da definição de pronto (seção 1 do plano) rodou de ponta a ponta no Studio, com o
código de `main` (`5d87a4d`) sem nenhuma mudança. Este PR só acrescenta esta página e as telas. A passada pelo
`AgentController` achou o erro conhecido do Claude 5, descrito na seção "O erro do Claude 5".

## Ambiente

- `mastra dev` 1.40.2 (Studio 1.86.0), `@mastra/core` 1.86.0, `@mastra/e2b` 0.18.1.
- Modelo do Construtor: `anthropic/claude-sonnet-5-5`. Memória em Haiku.
- Template E2B `conexus-harness-builder` (PR 4), um app de teste (`STUDIO_APP_ID=p2-validacao`), então a máquina é
  `conexus-harness-studio-p2-validacao`.
- Um Postgres remoto para o `PostgresStoreVNext`. A observabilidade usou a mesma URL, com o aviso que o plano previu.

## O ciclo no chat do Studio

Duas ressalvas de método: a E2B guarda o `sandboxId` como metadado `mastra-sandbox-id`, e eu li o id pela SDK da E2B
(`Sandbox.list`). O link do app traz o mesmo id no começo do host.

| # | Passo | Resultado | Prova |
|---|-------|-----------|-------|
| 1 | Pedir o app | O agente entendeu e não construiu nada. | `01-pedido-do-app.png` |
| 2 | Pedir o plano | Escreveu `.mastracode/plans/contador.md` (a pasta `/.mastracode/plans` é gravável pelo usuário do template, o risco 2 do plano fechou) e chamou `submit_plan`. O cartão nativo desenhou o plano. | `02-plano-submetido.png` |
| 3 | Aprovar no cartão | Aprovado. O agente seguiu direto para a construção. **Sem o erro 400 do Claude 5 aqui.** | `03-plano-aprovado.png` |
| 4 | Construir e testar | Criou `app.js`, `index.html` e `test.js` em `/home/user/app`, rodou `node test.js`, leu a skill `testar-app`, abriu o app com `agent-browser`, clicou três vezes em `+` e em `Zerar`, e leu a foto `/tmp/tela-1.png` com `read_file` (a imagem aparece no cartão da ferramenta). | `04-teste-com-agent-browser.png` |
| 5 | Link do app | `preview_url` devolveu `https://5173-igul0ka0piwri5s8j9ir3.e2b.app`. Abri o link num navegador e cliquei em `+`: o contador foi a 1. | `05-link-do-app-aberto.png` |
| 6 | `publish` de teste | Devolveu `{ "published": false, "dryRun": true, "name": "contador-de-cliques", "directory": "/home/user/app/dist", "files": ["app.js", "index.html"], "message": "Dry run: nothing was published." }`. A pasta padrão `dist` não existia, e o agente a criou copiando os dois arquivos antes de chamar. | `06-publish-de-teste.png` |
| 7a | Segunda conversa, mesmo app | Outro thread novo viu os arquivos da primeira e o `preview_url` devolveu o mesmo host. | `07-conversa-2-mesma-maquina.png` |
| 7b | Reinício do `mastra dev` | A terceira conversa depois do reinício reencontrou a máquina pausada. Hook `onStart`: `outcome=connected`. | `09-retomada-depois-do-reinicio.png` |

### sandboxId

| Conversa | Thread | sandboxId |
|----------|--------|-----------|
| 1 (ciclo todo) | `48b598e0-ab70-4501-9e02-b8073f2003ee` | `igul0ka0piwri5s8j9ir3` |
| 2 (mesmo app) | `be063c0b-8d29-499e-9f43-23bbb385578a` | `igul0ka0piwri5s8j9ir3` |
| 3 (depois do reinício) | `e9b3b72d-d23e-42b1-88d0-6f23f22e002b` | `igul0ka0piwri5s8j9ir3` |

### Reinício e retomada

O processo do Studio nunca chama `harness.shutdown()`. Parar o `mastra dev` deixou a máquina `running` até o timeout
de 30 minutos da E2B (`lifecycle.onTimeout: 'pause'`, o padrão do `@mastra/e2b`). Para não esperar, depois de parar o
servidor eu pausei a máquina com `Sandbox.pause(id)` da SDK, o mesmo estado que o timeout produz. A lista da E2B mostrou
`paused`. Depois subi o `mastra dev` de novo com um `onStart` temporário no `E2BSandbox` da entrada do Studio
(`console.log` do `outcome`, não commitado). Na primeira mensagem da terceira conversa saiu
`[P2-ONSTART] outcome=connected id=conexus-harness-studio-p2-validacao`, e a lista da E2B voltou a mostrar o mesmo
`sandboxId` em `running`. Nenhuma máquina nova foi criada.

### Traces (aba Observability)

| Trace | O que é |
|-------|---------|
| `eeeb1a371c27866fcb7dbafe381590cd` | Conversa 1, passo 1 |
| `3fa9312290c9d2c0b914d1187c141e5d` | Conversa 1, plano, aprovação e construção (`08-trace-observability.png`) |
| `b024fcc3660901ef8c0a70b645af7db3` | Conversa 1, `publish` |
| `bf2c17b2c29492bf95f4cdb114ea5b51` | Conversa 2 |
| `c9ac650d550a94d5352b2bba2716959c` | Conversa 3, depois do reinício |

## A passada pelo AgentController

Rotas nativas `/api/agent-controller/builder/...` (OpenAPI do próprio servidor), com um script de ~60 linhas que só
chama `fetch` e lê o SSE: criar a sessão (`resourceId`), trocar para `plan`, `POST messages`, esperar o evento
`tool_suspended` do `submit_plan`, responder em `POST tool-suspension` com `{ action: 'approved' }`.

- **O modo plan só vê as ferramentas de `availableTools`.** Os spans `model_generation` do trace da sessão mostram o
  que foi para o modelo: 17 ferramentas em `plan` (as 17 de `PLAN_MODE_AVAILABLE_TOOLS`) e 24 depois da aprovação, o
  mesmo conjunto do chat do Studio. Faltam em `plan`: `execute_command`, `get_process_output`, `kill_process`, `mkdir`,
  `delete`, `preview_url` e `publish`. Pedi ao agente para rodar `ls` em `plan`: ele respondeu que não tem ferramenta
  de comando e listou a pasta com `list_files`. Trace `d7a979a65602b0d4b81f15191289860c`.
- **O `submit_plan` vindo do agente aprova e troca para `build`.** O servidor emitiu `tool_suspended`, a resposta
  `approved` voltou `{ ok: true }`, o evento `mode_changed` foi de `plan` para `build` e `GET sessions/:id` terminou
  com `modeId: "build"`. Isso responde o risco 1 do plano.
- **`disableBuiltinTools` não é necessário.** Tirei a opção, reiniciei e repeti: uma mensagem simples em `plan` não deu
  erro, o modelo recebeu as mesmas 17 ferramentas sem nome repetido (trace `032f7995e2f76b12464c8d7f7d08a666`), e o
  fluxo inteiro de plano e aprovação se comportou igual, com a mesma troca para `build` e o mesmo erro do Claude 5 no
  fim. Só vi o resultado (uma cópia de cada nome no pedido ao modelo), não li como o controller junta as listas, e `submit_plan` é o mesmo `submitPlanTool` do `@mastra/core` nos dois lados. A opção continua no
  código (a decisão de remover é do plano); a rota do cartão de plano do Studio só depende de o agente listar
  `submit_plan`, e isso não muda.

### O erro do Claude 5

No caminho do controller, depois de `submit_plan` aprovado e do `mode_changed`, a requisição seguinte ao modelo falha:

```
HTTP 400 (AI_APICallError, invalid_request_error)
messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.
Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to "drop_block". That setting requires the
`thinking-binding-controls-2026-08-01` value in the `anthropic-beta` header. The `tools` list differs from the one
this block was created with.
```

Dois request ids: `req_011ChUirvZBqEw5AJcPFsgKx` (com `disableBuiltinTools`) e `req_011ChUj3pfXkFTvwVeyqMNSU` (sem). O
modo já tinha trocado para `build`, então o erro vem da resposta que o agente daria depois de aprovar.

O texto do erro explica a causa: o bloco de `thinking` da rodada em `plan` foi assinado com 17 ferramentas, e a
rodada em `build` reenvia o bloco com 24. É o `availableTools` por modo (comportamento nativo do controller) combinado
com o histórico que repete o bloco assinado. No chat do Studio não há troca de modo, a lista de ferramentas não muda e
a aprovação não deu erro.

Registrado como bug do Mastra (decisão de 2026-11-27, sem contorno na época). Não enviei nada ao time do Mastra, porque a tarefa não
autoriza chamada a serviço externo. Quem decidir pode usar esta seção como texto do relato.

### A correção e a prova (2026-11-28)

A causa tem três partes nativas: o Sonnet 5.5 gera thinking assinado mesmo sem configuração; o `availableTools` do modo
vira `activeTools` e muda o array `tools` enviado (17 em `plan`, 23 em `build` neste teste); a aprovação do
`submit_plan` retoma a mesma run e reenvia o bloco assinado. A correção é a opção nativa do provedor, em
`defaultOptions` do `createCodingAgent`:
`providerOptions.anthropic.thinking = { type: 'adaptive', blockBinding: { prefixMismatchBehavior: 'drop_block' } }`. O
provedor acrescenta sozinho o beta `thinking-binding-controls-2026-08-01`. Os modos não mudaram.

**A forma sem `type` não serve.** Com `{ blockBinding: ... }` só, o corpo saiu `thinking: { block_binding: ... }` e a
Anthropic respondeu 400 `thinking.type: Field required` (`req_011ChUnJj9B3se6fVxjPDmyj`, sem custo). Por isso a opção
leva `type: 'adaptive'`.

Prova paga, uma máquina local (sem E2B), `anthropic/claude-sonnet-5-5`, plano que exige raciocínio, `submit_plan`
aprovado, depois o build. Controller usado direto, com as mesmas chamadas das rotas nativas (`sendMessage` e
`respondToToolSuspension`).

| Rodada | Pedido 1 (plan, 17 ferr.) | Pedido 2 (plan, 17 ferr., 1 bloco de thinking) | Pedido 3 (primeiro do build, 23 ferr., 1 bloco) |
|--------|---------------------------|-----------------------------------------------|-------------------------------------------------|
| Sem a opção | 200 `req_011ChUnNGrz6aKTsqeNbPyCV` | 200 `req_011ChUnPjNSuvxQWUUBqnY2a` | **400** `req_011ChUnPq326PyyFHKGrPKgM`, o mesmo erro do bloco ligado à lista de ferramentas; o retry também: `req_011ChUnPzeDXpPbfFKQx9i2v` |
| Com a opção | 200 `req_011ChUnQXFxafpQztFNFfKtx` | 200 `req_011ChUnRn9wAGKNYSChSvxzn` | **200** `req_011ChUnRrJUdFYJ6cgdnrYmf`; o agente seguiu e criou o app (pedido 4, 200, `req_011ChUnTiBddrJ8bwjN2NoW3`) |

Com a opção, os quatro pedidos saíram com `anthropic-beta: thinking-binding-controls-2026-08-01` e
`thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } }`. Sem a opção, nenhum dos dois
saiu. Uso com a opção: 57,5 mil tokens de entrada, 7,5 mil de saída (858 de raciocínio) em 4 pedidos. Sem a opção, até o
400: 24,4 mil de entrada, 2,6 mil de saída.

Um roteiro mais simples (plano de uma linha) não reproduz o erro nem sem a opção: o modelo não pensou nos passos do
`plan`, e não havia bloco assinado para invalidar (`req_011ChUnLk6Gwqo6NaHMAxMHc` a `req_011ChUnMDqe6Qj1XMsKbSv5d`, todos
200 sem a opção; com a opção, `req_011ChUnKULDUAoxU3bp6Qvss` a `req_011ChUnKtARDe9t63VeRswvk`, todos 200). A prova vale
só quando o plan gera thinking.

Custo da prova inteira (quatro rodadas completas mais a tentativa sem `type`): cerca de 179 mil tokens de entrada e
11,6 mil de saída em Sonnet 5.5, mais um pouco de Haiku da memória. Não medi o preço em dólar; a US$ 3 por milhão de
entrada e US$ 15 por milhão de saída (preço de tabela presumido, sem cache) dá no máximo cerca de US$ 0,71, abaixo do
teto de US$ 1.

## Custo

- Tokens do modelo (Sonnet 5.5, somando os spans `model_step` dos traces e o uso das duas sessões do controller):
  cerca de 466 mil de entrada e 8,5 mil de saída. A Observational Memory em Haiku não foi medida. O Studio mostra
  US$ 0,51 para o trace de construção (`3fa931...`).
- E2B: uma máquina, cerca de 19 minutos em `running` (04:32 a 04:46 UTC e 04:47 a 04:52 UTC). Paga só enquanto roda.

## Limpeza

A máquina `igul0ka0piwri5s8j9ir3` foi morta com `Sandbox.kill(id)`. Em seguida `Sandbox.getInfo(id)` devolveu
`SandboxNotFoundError: Sandbox igul0ka0piwri5s8j9ir3 not found`, e a lista de máquinas `running` e `paused` da conta não
trazia mais o id. Foi a única máquina criada por esta validação.

## Como repetir

1. `npm install`, as chaves da E2B e da Anthropic e duas URLs de Postgres no ambiente, `STUDIO_APP_ID` com um nome novo.
2. `npm run dev` e abrir `/agents/builder/chat`.
3. Seguir a tabela acima. Para a retomada, parar o servidor, pausar a máquina pela SDK e subir de novo.
4. Para a passada do controller, usar as rotas listadas em `GET /api/openapi.json` sob `/agent-controller`.
5. Ao final, matar a máquina do app.

## Notas do campo de entrada

- O botão de enviar do chat só habilita com eventos de teclado reais. Preencher o campo por valor não basta.
- A porta padrão 4111 pode estar ocupada. `PORT` muda a do `mastra dev`.
