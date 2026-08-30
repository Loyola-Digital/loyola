---
name: runner-que-enxerga-o-arquivo
description: "\"Este pacote não tem runner\" não é \"não dá para testar\" — a pergunta certa é qual runner já lê este arquivo"
metadata:
  type: feedback
---

Quando uma story declara que não há como testar porque o pacote alterado não tem runner, **refaça a pergunta**: existe algum runner no monorepo que já lê o arquivo alterado?

**Why:** na Story 44.24 (`packages/mcp/src/tools.ts`), o @sm, o @po e o @dev conferiram os três, independentemente, que `packages/mcp` não tem script `test` e que a raiz não tem `test` — tudo verdade. Só que `packages/api` tem `"test": "vitest run"`, e `packages/api/src/__tests__/llms-txt-contrato.test.ts` já faz `readFileSync(".../packages/mcp/src/tools.ts")` e cruza esse fonte com a rota e com `docs/llms.txt` por regex. O runner existia, já apontava para o arquivo certo e rodou na mesma sessão. A defasagem que a story consertava (rota a 500 desde a 43.4, tool e doc em 200 por meses) era exatamente o que uma asserção nesse arquivo travaria.

**How to apply:** antes de aceitar "sem teste possível", rode um grep por `readFileSync`/`resolve(raiz` nos `__tests__` dos outros pacotes procurando o path do arquivo alterado. Testes de contrato por leitura de fonte (regex sobre o código) são o padrão do projeto para amarrar doc ↔ rota ↔ tool, e custam zero infra nova.

Corolário para o gate: rodar um teste de contrato que **não contém nenhuma asserção sobre o que a story mudou** é prova de não-regressão, não de entrega. Diga isso explicitamente no gate.

Relacionado: [[desempate-inalcancavel]], [[reversao-no-fio-nao-na-biblioteca]].
