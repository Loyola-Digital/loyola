---
name: paridade-funcao-pura-e-render
description: Função pura que valida um value contra a config não prova que a camada de render tem um branch para esse value — compare os dois CONJUNTOS
metadata:
  type: feedback
---

Quando uma story extrai a lógica para uma função pura testável e deixa o render de fora do runner, o teste cobre metade do risco. Compare os **conjuntos**: os valores que a função pode devolver × os valores que o render sabe desenhar.

**Why:** na 45.1 o `resolverAbaAtiva()` é puro, testado e provado por reversão — ele garante que só devolve um `value` que está no menu. Ele **não** garante que esse `value` tem um `<TabsContent value=...>` correspondente em `page.tsx`. Um `value` novo na config sem branch no render (ou o inverso) passa por vitest, eslint, `tsc` e `next build` sem um único vermelho, e só aparece como tela em branco. O @dev e o @po revisaram a story inteira e nenhum dos dois fez essa conferência.

**How to apply:** em qualquer revisão de refactor "JSX literal → config declarativa", extraia os dois conjuntos e compare literalmente (na 45.1: `grep -o 'TabsContent value="[^"]*"'` × os `value` da config, união de todos os contextos de elegibilidade). Se baterem 1:1, registre o número na evidência do gate. Vale para rotas × handlers, enum × switch, e config de menu × conteúdo — qualquer lugar onde o runner alcança um lado só.

Relacionado: [[story-45-1-menu-abas-hierarquico]].
