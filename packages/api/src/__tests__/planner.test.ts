/**
 * As contas de data do Planner.
 *
 * O que estes testes protegem: a duração não pode contar um dia a mais, o
 * empilhamento das barras precisa ser estável entre renders, e um mês vazio no
 * meio de um lançamento não pode sumir da lista.
 */

import { describe, expect, it } from "vitest";
import {
  corDoTextoSobre,
  cruzaMes,
  diasEntre,
  distribuirEmFaixas,
  ehDataValida,
  mesesDoPeriodo,
  normalizarFase,
  periodoDaCampanha,
  planejarSincronia,
  somarDias,
  type FaseDoPlanner,
} from "../services/planner.js";
import { chaveDoNome } from "../services/planner-sync.js";

const fase = (over: Partial<FaseDoPlanner> = {}): FaseDoPlanner => ({
  id: "f1",
  name: "Definições",
  start: "2026-09-08",
  end: "2026-09-11",
  ...over,
});

describe("datas", () => {
  it("diasEntre é exclusivo — 08 a 11 são 3 dias", () => {
    // É a duração como se lê num cronograma. A barra ocupa 4 células; o número
    // exibido é 3.
    expect(diasEntre("2026-09-08", "2026-09-11")).toBe(3);
    expect(diasEntre("2026-09-08", "2026-09-08")).toBe(0);
  });

  it("atravessa o fim do mês e do ano", () => {
    expect(diasEntre("2026-08-30", "2026-09-02")).toBe(3);
    expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("atravessa a virada do horário de verão sem perder o dia", () => {
    // O motivo do meio-dia: à meia-noite, num dia de mudança de horário, somar
    // 24h pode cair no mesmo dia ou pular um.
    expect(somarDias("2026-10-17", 1)).toBe("2026-10-18");
    expect(somarDias("2026-02-14", 1)).toBe("2026-02-15");
    expect(diasEntre("2026-10-17", "2026-10-18")).toBe(1);
  });

  it("ano bissexto", () => {
    expect(ehDataValida("2028-02-29")).toBe(true);
    expect(diasEntre("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("rejeita data que o Date aceitaria rolando o mês", () => {
    // `new Date(2026, 1, 31)` vira 3 de março sem reclamar.
    expect(ehDataValida("2026-02-31")).toBe(false);
    expect(ehDataValida("2026-13-01")).toBe(false);
    expect(ehDataValida("08/09/2026")).toBe(false);
    expect(ehDataValida("")).toBe(false);
  });
});

describe("normalizarFase", () => {
  it("fim antes do início vira igual ao início", () => {
    // Inverter os dois seria adivinhar qual campo a pessoa errou.
    const r = normalizarFase(fase({ start: "2026-09-10", end: "2026-09-01" }));
    expect(r.end).toBe("2026-09-10");
  });

  it("data ilegível vira vazio, não some com a fase", () => {
    const r = normalizarFase(fase({ start: "2026-02-31", end: "xx" }));
    expect(r.start).toBe("");
    expect(r.end).toBe("");
    expect(r.name).toBe("Definições");
  });

  it("fim sem início zera os dois", () => {
    // Uma fase que termina e nunca começou não aparece em visão temporal
    // nenhuma; deixar as duas vazias é um estado que a tela sabe mostrar.
    const r = normalizarFase(fase({ start: "", end: "2026-09-11" }));
    expect(r.end).toBe("");
  });

  it("preserva o fim em aberto", () => {
    const r = normalizarFase(fase({ start: "2026-11-05", end: "" }));
    expect(r.start).toBe("2026-11-05");
    expect(r.end).toBe("");
  });
});

describe("periodoDaCampanha", () => {
  it("do menor início ao maior fim", () => {
    const r = periodoDaCampanha([
      fase({ id: "a", start: "2026-09-08", end: "2026-09-11" }),
      fase({ id: "b", start: "2026-11-01", end: "2026-11-15" }),
      fase({ id: "c", start: "2026-10-01", end: "2026-10-05" }),
    ]);
    expect(r).toEqual({ inicio: "2026-09-08", fim: "2026-11-15" });
  });

  it("fase em aberto conta pelo início dela", () => {
    // Ignorá-la encurtaria a campanha para antes de algo que já começou.
    const r = periodoDaCampanha([
      fase({ id: "a", start: "2026-09-08", end: "2026-09-11" }),
      fase({ id: "b", start: "2026-12-01", end: "" }),
    ]);
    expect(r?.fim).toBe("2026-12-01");
  });

  it("sem fase datada é null, não um período inventado", () => {
    expect(periodoDaCampanha([fase({ start: "", end: "" })])).toBeNull();
    expect(periodoDaCampanha([])).toBeNull();
  });
});

describe("cruzaMes", () => {
  it("uma fase longa pertence a TODOS os meses que atravessa", () => {
    // Contar só pelo início faria outubro parecer vazio no meio do lançamento.
    const longa = fase({ start: "2026-09-08", end: "2026-11-15" });
    expect(cruzaMes(longa, 2026, 9)).toBe(true);
    expect(cruzaMes(longa, 2026, 10)).toBe(true);
    expect(cruzaMes(longa, 2026, 11)).toBe(true);
    expect(cruzaMes(longa, 2026, 12)).toBe(false);
    expect(cruzaMes(longa, 2026, 8)).toBe(false);
  });

  it("pega as bordas exatas do mês", () => {
    expect(cruzaMes(fase({ start: "2026-09-30", end: "2026-09-30" }), 2026, 9)).toBe(true);
    expect(cruzaMes(fase({ start: "2026-02-28", end: "2026-02-28" }), 2026, 2)).toBe(true);
  });

  it("fase sem data não cruza mês nenhum", () => {
    expect(cruzaMes(fase({ start: "", end: "" }), 2026, 9)).toBe(false);
  });
});

describe("distribuirEmFaixas", () => {
  const item = (nome: string, start: string, end: string) => ({ nome, start, end });

  it("fases que não se cruzam ficam todas na faixa 0", () => {
    const r = distribuirEmFaixas([
      item("a", "2026-09-01", "2026-09-05"),
      item("b", "2026-09-10", "2026-09-15"),
    ]);
    expect(r.map((x) => x.faixa)).toEqual([0, 0]);
  });

  it("sobreposição empurra para a faixa seguinte", () => {
    const r = distribuirEmFaixas([
      item("a", "2026-09-01", "2026-09-10"),
      item("b", "2026-09-05", "2026-09-15"),
    ]);
    expect(r.find((x) => x.nome === "a")?.faixa).toBe(0);
    expect(r.find((x) => x.nome === "b")?.faixa).toBe(1);
  });

  it("encostar em um único dia já é colisão", () => {
    // Uma termina no dia em que a outra começa: as duas ocupam aquele dia na
    // tela, então não podem dividir a faixa.
    const r = distribuirEmFaixas([
      item("a", "2026-09-01", "2026-09-05"),
      item("b", "2026-09-05", "2026-09-10"),
    ]);
    expect(r.find((x) => x.nome === "b")?.faixa).toBe(1);
  });

  it("a mais longa fica embaixo, formando a base", () => {
    // Ordenar ao contrário espalha as longas por faixas altas e deixa buracos.
    const r = distribuirEmFaixas([
      item("curta", "2026-09-01", "2026-09-02"),
      item("longa", "2026-09-01", "2026-09-20"),
    ]);
    expect(r.find((x) => x.nome === "longa")?.faixa).toBe(0);
  });

  it("a ordem é estável entre execuções", () => {
    // Uma tela que reordena sozinha a cada render é impossível de ler.
    const itens = [
      item("zebra", "2026-09-01", "2026-09-05"),
      item("alfa", "2026-09-01", "2026-09-05"),
    ];
    const a = distribuirEmFaixas(itens).map((x) => `${x.nome}:${x.faixa}`);
    const b = distribuirEmFaixas([...itens].reverse()).map((x) => `${x.nome}:${x.faixa}`);
    expect(a).toEqual(b);
  });

  it("fase sem data fica de fora", () => {
    const r = distribuirEmFaixas([item("sem", "", ""), item("com", "2026-09-01", "2026-09-05")]);
    expect(r).toHaveLength(1);
    expect(r[0]?.nome).toBe("com");
  });

  it("fim em aberto ocupa o dia do início", () => {
    const r = distribuirEmFaixas([
      item("aberta", "2026-09-05", ""),
      item("outra", "2026-09-05", "2026-09-06"),
    ]);
    expect(new Set(r.map((x) => x.faixa)).size).toBe(2);
  });
});

describe("mesesDoPeriodo", () => {
  const HOJE = new Date(2026, 8, 2, 12); // 2026-09-02

  it("preenche os buracos entre o primeiro e o último mês", () => {
    // Um mês vazio no meio de um lançamento é informação: "não planejamos nada
    // em outubro". Escondê-lo faria a lista mentir sobre a continuidade.
    const r = mesesDoPeriodo(
      [fase({ start: "2026-09-08", end: "2026-09-10" }), fase({ start: "2026-12-01", end: "" })],
      HOJE,
    );
    expect(r).toEqual([
      { ano: 2026, mes: 9 },
      { ano: 2026, mes: 10 },
      { ano: 2026, mes: 11 },
      { ano: 2026, mes: 12 },
    ]);
  });

  it("o mês corrente entra sempre — é por onde a tela abre", () => {
    const r = mesesDoPeriodo([], HOJE);
    expect(r).toEqual([{ ano: 2026, mes: 9 }]);
  });

  it("atravessa o ano", () => {
    const r = mesesDoPeriodo([fase({ start: "2026-11-01", end: "2027-02-01" })], HOJE);
    expect(r[0]).toEqual({ ano: 2026, mes: 9 });
    expect(r.at(-1)).toEqual({ ano: 2027, mes: 2 });
  });

  it("data absurda não trava a tela", () => {
    // Alguém digita 2099 no campo de data. Sem teto, a lista tentaria desenhar
    // novecentos itens.
    const r = mesesDoPeriodo([fase({ start: "2026-09-01", end: "2099-01-01" })], HOJE, 12);
    expect(r).toHaveLength(12);
  });
});

describe("corDoTextoSobre", () => {
  it("escuro sobre cor clara, claro sobre cor escura", () => {
    // A mesma paleta precisa funcionar nos dois temas: quem decide é o brilho
    // da cor, não o tema.
    expect(corDoTextoSobre("#C2851B")).toBe("#101216");
    expect(corDoTextoSobre("#6D5BD0")).toBe("#ffffff");
    expect(corDoTextoSobre("#FFFFFF")).toBe("#101216");
    expect(corDoTextoSobre("#000000")).toBe("#ffffff");
  });

  it("aceita hex de 3 dígitos e cor inválida não quebra", () => {
    expect(corDoTextoSobre("#fff")).toBe("#101216");
    expect(corDoTextoSobre("nao-e-cor")).toBe("#ffffff");
  });
});

describe("planejarSincronia", () => {
  const f = (
    id: string,
    name: string,
    start: string,
    end: string,
    googleEventId?: string,
  ): FaseDoPlanner => ({ id, name, start, end, ...(googleEventId ? { googleEventId } : {}) });

  const base = { nomeAntes: "FZ BLACK", nomeDepois: "FZ BLACK" };

  it("fase nova com data vira evento", () => {
    const a = planejarSincronia({
      ...base,
      fasesAntes: [],
      fasesDepois: [f("1", "Captação", "2026-09-01", "2026-09-05")],
    });
    expect(a.criar).toHaveLength(1);
    expect(a.atualizar).toHaveLength(0);
    expect(a.apagar).toHaveLength(0);
  });

  it("fase sem data não vira evento — e não é erro", () => {
    // "Sem data" é estado normal do planejamento: a fase existe, ninguém sabe
    // quando. Na agenda ela não teria onde ficar.
    const a = planejarSincronia({
      ...base,
      fasesAntes: [],
      fasesDepois: [f("1", "Definições", "", "")],
    });
    expect(a).toEqual({ criar: [], atualizar: [], apagar: [] });
  });

  it("mudar a data atualiza o evento", () => {
    const a = planejarSincronia({
      ...base,
      fasesAntes: [f("1", "Captação", "2026-09-01", "2026-09-05", "ev1")],
      fasesDepois: [f("1", "Captação", "2026-09-03", "2026-09-08", "ev1")],
    });
    expect(a.atualizar).toEqual([
      { fase: f("1", "Captação", "2026-09-03", "2026-09-08", "ev1"), eventId: "ev1" },
    ]);
    expect(a.criar).toHaveLength(0);
    expect(a.apagar).toHaveLength(0);
  });

  it("fase intocada não vira chamada à toa", () => {
    // Salvar a campanha por qualquer motivo não pode reescrever a agenda
    // inteira: seriam dezenas de chamadas por clique.
    const iguais = [f("1", "Captação", "2026-09-01", "2026-09-05", "ev1")];
    const a = planejarSincronia({ ...base, fasesAntes: iguais, fasesDepois: iguais });
    expect(a).toEqual({ criar: [], atualizar: [], apagar: [] });
  });

  it("renomear a campanha atualiza TODAS as fases", () => {
    // O título no Google é `CAMPANHA - Fase`, então o nome da campanha está
    // dentro de cada evento.
    const fases = [
      f("1", "Captação", "2026-09-01", "2026-09-05", "ev1"),
      f("2", "Vendas", "2026-09-06", "2026-09-10", "ev2"),
    ];
    const a = planejarSincronia({
      nomeAntes: "FZ BLACK",
      nomeDepois: "FZ BLACK 2026",
      fasesAntes: fases,
      fasesDepois: fases,
    });
    expect(a.atualizar.map((x) => x.eventId)).toEqual(["ev1", "ev2"]);
  });

  it("fase excluída apaga o evento", () => {
    const a = planejarSincronia({
      ...base,
      fasesAntes: [
        f("1", "Captação", "2026-09-01", "2026-09-05", "ev1"),
        f("2", "Vendas", "2026-09-06", "2026-09-10", "ev2"),
      ],
      fasesDepois: [f("1", "Captação", "2026-09-01", "2026-09-05", "ev1")],
    });
    expect(a.apagar).toEqual(["ev2"]);
    expect(a.atualizar).toHaveLength(0);
  });

  it("fase que PERDEU a data apaga o evento", () => {
    // Deixar o evento na data antiga é pior que apagá-lo: o time continuaria
    // vendo uma data que já não vale.
    const a = planejarSincronia({
      ...base,
      fasesAntes: [f("1", "Captação", "2026-09-01", "2026-09-05", "ev1")],
      fasesDepois: [f("1", "Captação", "", "", "ev1")],
    });
    expect(a.apagar).toEqual(["ev1"]);
    expect(a.criar).toHaveLength(0);
  });

  it("fase sem evento por falha anterior é criada no próximo save", () => {
    // Escrita que falhou deixa a fase sem `googleEventId`. Ela não fica órfã:
    // a próxima edição a trata como nova e ela entra na agenda.
    const a = planejarSincronia({
      ...base,
      fasesAntes: [f("1", "Captação", "2026-09-01", "2026-09-05")],
      fasesDepois: [f("1", "Captação", "2026-09-01", "2026-09-05")],
    });
    expect(a.criar).toHaveLength(1);
  });
});

describe("chaveDoNome", () => {
  it("trata como a mesma campanha o que só muda hífen, espaço e caixa", () => {
    // Medido nas agendas do time: as três variações abaixo são pares reais que
    // viravam campanhas separadas a cada importação.
    expect(chaveDoNome("BBE-Margem 3X")).toBe(chaveDoNome("BBE Margem 3X"));
    expect(chaveDoNome("BBE-PR2")).toBe(chaveDoNome("BBEPR2"));
    expect(chaveDoNome("DG-PG02-MAR-26")).toBe(chaveDoNome("DG-PG-02-MAR-26"));
  });

  it("ignora acento, que é onde a digitação diverge", () => {
    expect(chaveDoNome("FÉRIAS")).toBe(chaveDoNome("ferias"));
  });

  it("não junta campanhas que são de fato diferentes", () => {
    expect(chaveDoNome("FZ-L1-JAN-25")).not.toBe(chaveDoNome("FZ-L1-FEV-26"));
    expect(chaveDoNome("DG-PG01-JAN-25")).not.toBe(chaveDoNome("DG-PG02-MAR-26"));
    expect(chaveDoNome("BBE BLACK")).not.toBe(chaveDoNome("FZ BLACK"));
  });
});
