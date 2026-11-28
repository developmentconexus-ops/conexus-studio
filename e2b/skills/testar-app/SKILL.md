---
name: testar-app
description: Testa o app que você construiu no navegador da própria máquina, com o agent-browser. Use antes de entregar o link do app e depois de qualquer mudança visível.
---

# Testar o app no navegador

O `agent-browser` e o Chromium headless já estão nesta máquina. Rode tudo pelo `execute_command`. Abra sempre
`http://localhost:<porta>`, nunca a URL pública do app.

## Rotina

1. Suba o servidor do app em segundo plano pelo `execute_command` (processo em background) e espere a porta responder.
2. Abra a página: `agent-browser open http://localhost:<porta>`.
3. Leia a página: `agent-browser snapshot -i`. A saída lista os elementos com refs como `@e3`.
4. Aja pelos refs: `agent-browser click @e3`, `agent-browser fill @e4 "texto"`.
5. Depois de qualquer mudança de página, rode `snapshot -i` de novo. Um ref de antes de navegar deixa de valer.
6. Confira os erros: `agent-browser console`, `agent-browser errors` e `agent-browser network requests`.
7. Feche o navegador no fim: `agent-browser close`.

Use `agent-browser wait --text "<texto esperado>"` quando o elemento ainda não apareceu. Um snapshot vazio quase sempre
quer dizer que a página ainda carrega.

## Screenshot

Tire no máximo três screenshots por rodada. Em todo o resto, use a árvore da página (`snapshot -i`).

1. Grave num arquivo: `agent-browser screenshot /tmp/tela-1.png`.
2. Leia o arquivo com `read_file`. O PNG chega a você como imagem.

Use o screenshot só para o que a árvore não mostra, como layout, cor, canvas ou imagem. Nunca tire um para ver se um
elemento existe ou se a página terminou de carregar.

## O que reportar

Diga o que você abriu, o que clicou, o que viu e o que falhou. Se `errors` ou `console` trouxer erro, corrija o app e
teste de novo antes de entregar o link.
