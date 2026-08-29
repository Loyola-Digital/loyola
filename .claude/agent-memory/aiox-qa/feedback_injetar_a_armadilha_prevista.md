---
name: injetar-a-armadilha-prevista
description: Quando o @po nomeia uma armadilha na story, reverter o fix não basta — injete a armadilha exata e veja se o teste dedicado a ela falha
metadata:
  type: feedback
---

Quando o gate do @po **nomeia** uma falha específica que a implementação deve evitar ("não mutar o const, `unshift` vazaria/duplicaria"), e o @dev responde com um teste por armadilha, a verificação do @qa não é a reversão do fix — é **injetar cada armadilha, uma por vez, e conferir que o teste dedicado a ela é um dos que falham**.

**Why:** reversão e injeção medem coisas diferentes. Pego na Story 45.2 (Epic 45): a reversão completa (desfazer a mudança) derrubava 5 testes, mas **3 desses 5 eram os testes antigos consertados** — eles falhariam de qualquer jeito. Ela não dizia nada sobre os 2 testes novos escritos especificamente contra as armadilhas. Injetando `ABAS_DE_DADOS.unshift(...)` no escopo do módulo → 3 falhas, incluindo "não vaza para lançamento"; injetando o mesmo `unshift` dentro da função → 5 falhas, incluindo "montar duas vezes não duplica". Só aí ficou provado que os dois testes dedicados fazem o trabalho para o qual foram escritos.

Um teste pode existir, ter o nome certo, o comentário certo, e ainda assim não falhar quando o defeito que ele nomeia volta. Nome de teste é intenção; falha é prova.

**How to apply:**
1. Faça `cp` do arquivo para o scratchpad antes de tocar nele.
2. Uma injeção por vez, restaurando do backup entre elas (defeitos combinados mascaram qual teste pegou o quê).
3. Confira que **o teste com o nome da armadilha** aparece na lista de falhas — não basta "N testes falharam".
4. Restaure e prove: `shasum` idêntico ao original + `git status --short` limpo no pacote + suíte de volta ao total.

Cuidado com o **teste tautológico**, que é como a armadilha escapa: `expect(conjuntoExistente).toContain(fn(x))` passa igualmente quando `fn` cai no fallback — para aquele `x` a asserção não pode falhar de forma útil. Se a story promete "o teste trava o contrato", ache a asserção que trava, e verifique que ela é sobre o **valor esperado**, não sobre a pertinência a um conjunto que sempre contém a resposta errada também.

Relacionado: [[reversao-no-fio-nao-na-biblioteca]], [[project-story-45-2]].
