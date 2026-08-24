---
name: reversao-no-fio-nao-na-biblioteca
description: Reversão que testa a biblioteca compartilhada não prova que o chamador está ligado a ela — o fio (argumento passado) precisa da própria reversão
metadata:
  type: feedback
---

Quando uma story existe para **ligar** um consumidor a um produtor, a reversão obrigatória é **cortar o argumento no ponto da chamada**, não reverter a lógica de dentro da biblioteca.

**Why:** pego na Story 44.12 (Epic 44). A story se chamava "ligar a guarda de rastreio". O teste dito "ponta a ponta" chamava `calcularTetos(serie, "gratuita", { coberturaDaEtapa })` **direto**, com o array de cobertura montado à mão — nunca a saída do produtor, nunca pela rota. Trocar a chamada real por `calcularTetos(series, familia, {})`, isto é, **a guarda nunca rodar**, deixou a suíte inteira da API idêntica ao baseline (1267/11), typecheck limpo. 13 outras reversões eram diferenciais; essa — a do fio — era a única que importava e era a única lacuna.

Agravante que se repete: o payload derivava o estado (`guardaDeCobertura.estado = "aplicada"`) de uma variável **irmã** do argumento, não do resultado. Com o fio cortado, a tela continuava anunciando que a guarda rodou. Sem fonte única entre *o mecanismo rodou* e *o payload diz que rodou*, o teste de estado não cobre o mecanismo.

**How to apply:** em toda story de wiring, antes de aceitar a suíte verde, aplicar duas reversões distintas:
1. reverter a lógica interna (prova que a biblioteca é testada — geralmente já está, de stories anteriores);
2. **cortar o argumento no call site** (prova que ESTA story entregou algo).

Se (2) não derruba nada, a story não tem teste — por mais testes que tenha. E checar se o campo de estado é derivado do *retorno* da chamada ou de uma variável paralela: se for paralela, ele mente quando o fio quebra.

Relacionado: [[feedback-revert-to-prove-test]], [[project-story-44-12]].
