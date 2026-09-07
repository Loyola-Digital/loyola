---
name: detector-por-nome-e-cego-a-schema
description: Um detector de defasagem que compara nomes (de tools, rotas, campos) não acusa mudança de schema — a AC que manda "verificar" precisa dizer QUAL probe discrimina
metadata:
  type: feedback
---

Quando uma story muda o **schema** de algo já existente (novo parâmetro numa tool MCP, novo campo numa rota), o mecanismo anti-deriva do projeto **não** vai acusar nada — porque ele compara **nomes**, não formas. Numa AC de verificação, exigir "verifique de fato" é insuficiente: a AC precisa nomear o **probe que discrimina** as duas versões.

**Why:** Story 44.23 (Epic 44). O detector da 44.22 (`packages/mcp/src/defasagem.ts` → `compararComManifesto`) calcula `faltando`/`sobrando` como diferença de conjunto sobre nomes, e `index.ts` só registra a tool `AVISO_bundle_do_mcp_desatualizado` `if (d.atrasado || d.sobrando.length > 0)`. Uma story que só acrescenta `offset` a uma tool existente produz `faltando = []` e `sobrando = []` → o aviso **nunca é registrado**, e o roster de um gateway de dois meses atrás fica idêntico ao de um gateway em dia. O `verificar-tools.mjs` do `build` tem a mesma cegueira. O @dev leria o roster, não acharia aviso, e concluiria que entregou — o padrão "erro virando ausência" que já custou três investigações neste projeto.

**How to apply:** Em toda story que altere schema de um contrato consumido por outro processo (MCP, gateway, worker), no gate do @po:
1. Ler o comparador antes de aprovar a AC de verificação — é por nome ou por forma?
2. Se for por nome, escrever na AC que **ausência de aviso não é evidência**.
3. Exigir um probe que só a versão nova aceita (na 44.23: `limit: 300`, que o teto antigo de 200 rejeita), e não a mera presença do campo.

Relacionado: [[ac-meio-impossivel]] — lá a AC pedia um meio impossível; aqui ela pede uma evidência que não discrimina. Os dois se pegam lendo o código antes do GO.
