# Validação P3: RAM da máquina e fotos no histórico

Resultado de 2026-11-28, com o código de `main` (`f54eb39`) sem nenhuma mudança. Este PR só acrescenta esta página.
Ela dá ao fundador os números para duas decisões: a RAM do template (2 ou 4 GiB) e se o limite de três fotos da skill
`testar-app` basta.

## Resumo

| Pergunta | Medida | Leitura |
|----------|--------|---------|
| Pico de RAM do agente testando um app pequeno | 551 MiB usados (de 3,9 GiB) | Com folga em 2 GiB. |
| Pico de RAM com uma página React/Vite pesada | 884 MiB (amostra de 3 s), 1.440 MiB (amostra de 1 s, na foto da página inteira) | Ainda cabe em 2 GiB, com cerca de 460 MiB de sobra no pior ponto. |
| Fotos lidas na rodada | 2, de 1280x577 | Cada uma custa cerca de 1.080 tokens de entrada, e a foto fica no histórico. |
| Custo das fotos | cerca de 10.800 tokens de entrada de 191 mil (6%) | O limite de três fotos basta. |
| Custo da rodada | US$ 0,42 de modelo mais E2B de poucos minutos | Muito abaixo do teto de US$ 5. |

## Método

- O Studio (`npm run dev`, `mastra dev` 1.40.2) rodou com o `studio/index.ts` de `main`, um Postgres local descartável
  (`docker run --rm`, parado no fim) para as duas bases, o template `conexus-harness-builder` (2 vCPU, 4096 MiB) e o
  Construtor no modelo padrão, `anthropic/claude-sonnet-5-5`.
- A rodada passou pelas rotas nativas do controller (`/api/agent-controller/builder/...`): criar a sessão, abrir o
  stream e `POST messages`, no modo `build` (o padrão). Não usei o plano nem o chat da tela, porque o que se mede é a
  fase de teste do app, e o ciclo com plano já foi validado no P2. Um só pedido: um cronômetro regressivo de 25 minutos
  com Iniciar, Pausar e Zerar, para testar no navegador com a skill e conferir o visual do estado parado e do estado
  contando.
- A RAM foi lida de fora da máquina, pela SDK da E2B: `free -m` por `commands.run` a cada cerca de 3 s, mais
  `getMetrics()` como segunda fonte (as duas deram o mesmo pico). Escolhi ler de fora, e não pelo `execute_command` do
  agente, para não pôr ruído no histórico que está sendo medido. "Usados" é a coluna `used` do `free -m`, que não conta
  cache de disco.
- Os tokens vêm dos spans `model_step` do trace da rodada (campo `usage.inputTokens`), e a conta em dólar vem das
  métricas de custo que o próprio Studio grava.
- Limite da amostragem: um pico mais curto que o intervalo passa despercebido. A medição extra abaixo mostra um caso
  disso.

## RAM

Máquina: 3.931 MiB visíveis (template de 4.096 MiB), 2 vCPU. Parada, sem navegador, ela usa 228 a 293 MiB.

| Momento | Usados (MiB) | O que roda |
|---------|--------------|-----------|
| Parada | 228 a 233 | só o sistema e o agente da E2B |
| Servidor `python3 -m http.server` | 258 | o app |
| Chromium abrindo (`agent-browser open`) | 302 a 370 | três processos `chrome` |
| **Pico da rodada do agente** | **551** | Chromium aberto, páginas lidas e fotos tiradas (os três maiores `chrome` somam cerca de 535 MiB) |
| Depois do `agent-browser close` | 289 | volta ao patamar parado |

O pico é de um Chromium com uma página simples. Para ver o teto realista sem pagar outra rodada de modelo, rodei na
mesma máquina, por comando direto (sem modelo), uma página React/Vite com uma tabela de 2.000 linhas, amostrando a cada
1 s:

| Fase | Pico de usados (MiB) |
|------|----------------------|
| `npm install react react-dom vite @vitejs/plugin-react` | 594 |
| Servidor do Vite com Chromium e 3 fotos da janela | 854 |
| **Foto da página inteira** (`screenshot --full`, PNG de 3,2 MB) | **1.440** (dura cerca de 2 s; um `chrome` chegou a 730 MiB) |
| Build com Chromium aberto | 938 |

Com amostra de 3 s, a mesma fase mostrou só 884 MiB. A foto da janela (a que a skill pede) não faz esse salto, a da
página inteira faz.

Leitura para a decisão:

- Uma máquina de 2 GiB enxerga cerca de 1.900 MiB. Todos os picos medidos cabem, o pior (foto da página inteira de uma
  página pesada) deixa cerca de 460 MiB.
- O que **não** medi: um build de verdade de um app grande (Next ou Webpack, que costumam passar de 1 GiB sozinhos) e o
  Chromium em duas abas. Em 2 GiB, um build desses mais o Chromium aberto pode estourar a memória. Com 4 GiB há
  folga para os dois casos.
- Minha recomendação, que é uma opinião e não uma medida: manter 4 GiB até alguém rodar um build grande de verdade. A
  RAM é só uma parte do preço da máquina, e um estouro de memória no meio de uma conversa custa mais do que a diferença.
  Passar para 2 GiB é seguro apenas para apps do tamanho dos que foram medidos aqui.

## Fotos e tokens de entrada

O agente leu duas fotos (`read_file` em `/tmp/tela-1.png` e `/tmp/tela-2.png`), as duas de 1280x577 (cerca de 17 e 16
KB). Cada passo abaixo é um pedido ao modelo, com os tokens de entrada que ele recebeu.

| Passo | Tokens de entrada | Variação | O que o passo anterior fez |
|-------|-------------------|----------|----------------------------|
| 0 | 13.081 | | primeiro pedido (prompt do sistema e ferramentas) |
| 1 | 13.943 | +862 | leu a skill `testar-app` e listou a pasta |
| 2 | 16.364 | +2.421 | escreveu `index.html`, `style.css` e `app.js` e checou `python3` e `node` (o salto é sobretudo o código que o agente gerou) |
| 3 | 16.489 | +125 | subiu o servidor |
| 4 | 16.748 | +259 | abriu o app no navegador e tirou a foto 1 |
| **5** | **17.828** | **+1.080** | **leu a foto 1** |
| 6 | 18.116 | +288 | clicou em Iniciar e tirou a foto 2 |
| **7** | **19.196** | **+1.080** | **leu a foto 2** |
| 8 | 19.591 | +395 | conferiu Pausar e Zerar |
| 9 | 19.722 | +131 | `preview_url` |
| 10 | 20.249 | +527 | `web_fetch` do link e resposta final |

Total da rodada: 191.327 tokens de entrada e 3.827 de saída em 11 pedidos.

**Antes e depois de cada foto**

| Foto | Entrada antes | Entrada depois | Diferença |
|------|---------------|----------------|-----------|
| 1 | 16.748 (passo 4) | 17.828 (passo 5) | +1.080 |
| 2 | 18.116 (passo 6) | 19.196 (passo 7) | +1.080 |

- Cada foto soma cerca de 1.080 tokens. A fórmula documentada da Anthropic para imagem (largura vezes altura dividido
  por 750) dá 985 para 1280x577, e a diferença é a chamada da ferramenta e o texto ao redor. Os resultados de ferramenta que
  não são foto somaram entre 125 e 862 tokens por passo, e o maior é o texto da skill.
- **A foto não sai do histórico.** A entrada nunca cai de um passo para o outro. A foto 1 foi reenviada em 6 pedidos
  (passos 5 a 10) e a foto 2 em 4, cerca de 10.800 tokens no total, 6% da entrada. Em dólar: cerca de US$ 0,02.
- Com o limite de três fotos da skill, o pior caso é cerca de 3.000 tokens a mais por passo, sobre uma base de 13 a
  20 mil. Mesmo dez fotos somariam cerca de 10.000 por passo, longe do limite de contexto. O limite basta. Ele não é o
  que pesa no custo.
- O agente usou duas das três fotos permitidas, e só depois de a skill pedir o visual do estado parado e do estado
  contando. Para os demais passos usou a árvore da página (`snapshot -i`) e `eval`.
- Não medi o custo em tokens de uma foto da página inteira. O Chromium gerou um PNG de 3,2 MB nesse caso, e o limite de
  tamanho da imagem na API não foi testado aqui.

**Sem cache de prompt.** Os 11 pedidos têm `cacheRead` e `cacheWrite` em 0. Os cerca de 13 mil tokens de prompt do
sistema e ferramentas foram cobrados cheios em todo passo. Não investiguei a causa. É uma observação medida, e pode
valer mais dinheiro que as fotos.

## Custo

| Item | Valor |
|------|-------|
| Modelo (Sonnet 5.5, 191.327 entrada e 3.827 saída) | US$ 0,42, pelas métricas de custo do Studio (US$ 2 por milhão de entrada e US$ 10 por milhão de saída) |
| Observational Memory (Haiku) | não apareceu nas métricas: a conversa foi curta demais para disparar |
| E2B | uma máquina de 2 vCPU e 4 GiB por cerca de 3 a 4 minutos (08:29 a pouco depois de 08:32 UTC). A tabela de preço da E2B não foi consultada: mesmo a US$ 0,50 por hora, seriam menos de US$ 0,04 |
| **Total** | **cerca de US$ 0,46, de um teto de US$ 5** |

Foi uma rodada única do ciclo, sem repetição. A medição extra de RAM usou só a máquina, sem chamada de modelo.

## Limpeza

A máquina `ijqnn7y63z6rmthvgz2qr` foi morta com `Sandbox.kill(id)`. Em seguida `Sandbox.getInfo(id)` devolveu
`SandboxNotFoundError`, e a lista de máquinas `running` e `paused` da conta não trazia mais o id. Nenhuma máquina
`running` ficou na conta. O Studio foi parado e o Postgres descartável também (`docker stop`, o `--rm` o removeu).
Foi a única máquina criada por esta medição. As máquinas `paused` que já estavam na conta não são desta tarefa e não
foram tocadas.

## Como repetir

1. `npm install`, as chaves da E2B e da Anthropic no ambiente, dois bancos num Postgres local (veja o README),
   `STUDIO_APP_ID` com um nome novo.
2. `npm run dev`.
3. Por um script que só chama `fetch`: criar a sessão em `/api/agent-controller/builder/sessions`, abrir
   `.../sessions/:id/stream`, mandar `POST .../messages` e esperar o evento `agent_end`.
4. Na SDK da E2B, achar a máquina pelo metadado `mastra-sandbox-id` e rodar `free -m` a cada poucos segundos.
5. Ler os spans `model_step` (`usage.inputTokens`) do trace da rodada, na aba Observability ou na tabela
   `mastra_span_events` da base de observabilidade.
6. Matar a máquina e parar o Postgres.
