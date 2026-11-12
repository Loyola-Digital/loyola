import { describe, expect, it } from "vitest";
import { metasSugeridas, rascunhoDoResumo } from "../instagram-rascunho";
import type { MesDoOrganico } from "@/lib/hooks/use-instagram-mensal";

const mes = (over: Partial<MesDoOrganico> = {}): MesDoOrganico => ({
  mes: "2026-10",
  semDados: false,
  seguidoresNoFim: 152_500,
  novosSeguidores: 2_748,
  unfollows: 2_168,
  crescimento: 580,
  alcance: 683_000,
  views: 2_950_000,
  interacoes: 75_000,
  engajamento: 10.4,
  posts: 34,
  melhorPost: null,
  emCurso: null,
  variacao: { alcance: null, views: null, interacoes: null, crescimento: null, engajamento: null },
  ...over,
});

describe("rascunhoDoResumo", () => {
  it("a primeira frase junta alcance, saldo, engajamento e posts", () => {
    const r = rascunhoDoResumo(mes());
    expect(r.onde).toBe(
      "Alcançamos 683 mil contas, o saldo de seguidores foi de +580 " +
        "(2.748 entraram, 2.168 saíram), e o engajamento ficou em 10,4%, com 34 publicações.",
    );
  });

  it("compara com o mês anterior quando há base", () => {
    const r = rascunhoDoResumo(mes(), mes({ alcance: 500_000 }));
    expect(r.onde).toContain("(+37% sobre o mês anterior)");
  });

  // O rascunho é o texto que o cliente lê: um mês pela metade contra um mês
  // inteiro produziria a queda que não existe.
  it("mês em curso não compara, mesmo havendo mês anterior", () => {
    const r = rascunhoDoResumo(
      mes({ alcance: 186_000, emCurso: { dias: 11, de: 30 } }),
      mes({ alcance: 683_000 }),
    );
    expect(r.onde).not.toContain("mês anterior");
  });

  it("o aprendizado sai do melhor post", () => {
    const r = rascunhoDoResumo(
      mes({
        melhorPost: {
          id: "x",
          titulo: "Rotina da manhã",
          permalink: null,
          formato: "CAROUSEL_ALBUM",
          interacoes: 4_200,
          alcance: 51_000,
          engajamento: 8.2,
        },
      }),
    );
    expect(r.aprendizado).toContain('"Rotina da manhã"');
    expect(r.aprendizado).toContain("8,2% de engajamento");
  });

  it("sem melhor post, não afirma nada sobre o que funcionou", () => {
    expect(rascunhoDoResumo(mes()).aprendizado).toBeNull();
  });

  it("prioridade aponta as saídas quando elas dominam", () => {
    const r = rascunhoDoResumo(mes({ novosSeguidores: 1_000, unfollows: 900 }));
    expect(r.prioridade).toContain("90 foram embora");
  });

  it("prioridade aponta a queda de engajamento", () => {
    const r = rascunhoDoResumo(
      mes({ engajamento: 8.0, novosSeguidores: 1_000, unfollows: 100 }),
      mes({ engajamento: 10.4 }),
    );
    expect(r.prioridade).toContain("caiu 2,4 ponto(s)");
  });

  it("prioridade aponta a frequência quando nada mais aperta", () => {
    const r = rascunhoDoResumo(
      mes({ posts: 20, novosSeguidores: 1_000, unfollows: 100 }),
      mes({ posts: 34 }),
    );
    expect(r.prioridade).toContain("14 post(s) menos");
  });

  it("sem aperto nenhum e sem base, a prioridade fica em branco", () => {
    expect(rascunhoDoResumo(mes({ novosSeguidores: 1_000, unfollows: 100 })).prioridade).toBeNull();
  });
});

describe("metasSugeridas", () => {
  it("é a média dos três últimos meses fechados", () => {
    const s = metasSugeridas([
      mes({ mes: "2026-08", alcance: 300_000, crescimento: 100, posts: 20 }),
      mes({ mes: "2026-09", alcance: 600_000, crescimento: 400, posts: 30 }),
      mes({ mes: "2026-10", alcance: 900_000, crescimento: 700, posts: 40 }),
    ]);
    expect(s.alcance).toBe(600_000);
    expect(s.saldoSeguidores).toBe(400);
    expect(s.posts).toBe(30);
    expect(s.mesesUsados).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("olha só três meses, mesmo havendo mais", () => {
    const s = metasSugeridas([
      mes({ mes: "2026-01", alcance: 10 }),
      mes({ mes: "2026-08", alcance: 300_000 }),
      mes({ mes: "2026-09", alcance: 600_000 }),
      mes({ mes: "2026-10", alcance: 900_000 }),
    ]);
    expect(s.alcance).toBe(600_000);
    expect(s.mesesUsados).toHaveLength(3);
  });

  // Ele está pela metade e puxaria a meta para baixo.
  it("mês em curso fica fora da conta", () => {
    const s = metasSugeridas([
      mes({ mes: "2026-10", alcance: 600_000 }),
      mes({ mes: "2026-11", alcance: 100_000, emCurso: { dias: 11, de: 30 } }),
    ]);
    expect(s.alcance).toBe(600_000);
    expect(s.mesesUsados).toEqual(["2026-10"]);
  });

  // A média de um zero falso viraria meta de verdade.
  it("mês sem dado fica fora da conta", () => {
    const s = metasSugeridas([
      mes({ mes: "2026-09", semDados: true, alcance: 0, crescimento: 0, posts: 0 }),
      mes({ mes: "2026-10", alcance: 600_000 }),
    ]);
    expect(s.alcance).toBe(600_000);
  });

  it("sem mês fechado não sugere nada", () => {
    expect(metasSugeridas([]).alcance).toBeNull();
    expect(metasSugeridas([mes({ emCurso: { dias: 1, de: 30 } })]).mesesUsados).toEqual([]);
  });
});
