# conexus-harness

Regras para quem trabalha neste repositório. O contexto e a árvore estão no `README.md`.

1. **Nada que não seja nativo do Mastra sem aprovação do fundador.** As peças próprias aprovadas são só: a ferramenta
   `preview_url`, o middleware do Studio, a skill `testar-app` e o template E2B do Construtor, e a ferramenta `publish`
   de teste na entrada do Studio. Qualquer outra peça própria para e vira pergunta.
2. **Confira a API no código instalado** (`node_modules/@mastra/*/dist`) antes de usar. Não confie na memória.
3. **Padrão do Mastra.** Classe com config para o que tem estado e ciclo de vida (`ConexusHarness`, `AppSandboxes`).
   Função de fábrica para o que só monta peças (`createBuilder`).
4. **Pastas.** Nunca ponha `config.ts` nem `instructions.*` dentro de `src/mastra/agents/<nome>/`. Esses nomes ligam a
   descoberta por arquivos do `mastra dev`.
5. **Modelos.** O Construtor usa por padrão `anthropic/claude-sonnet-5-5` e a memória usa por padrão
   `anthropic/claude-haiku-5-5`. O host pode trocar os dois por empresa, em `model`.
6. **O pacote não escolhe o banco, a observabilidade, o logger, a máquina nem o login.** Tudo isso vem do host.
7. **Antes de cada commit**, rode `npm run check`. Teste testa comportamento, não implementação.
8. **Nenhum segredo, dado de empresa ou caminho de máquina em commit.** O repositório é público.
