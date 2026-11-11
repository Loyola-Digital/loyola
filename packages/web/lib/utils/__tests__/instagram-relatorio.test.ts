import { describe, expect, it } from "vitest";
import { cartoesDoRelatorio, textoDoRelatorio } from "../instagram-relatorio";
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
  variacao: { alcance: null, views: null, interacoes: null, crescimento: null, engajamento: null },
  ...over,
});

describe("textoDoRelatorio", () => {
  it("abre com o mês e o perfil, e traz os resultados", () => {
    const t = textoDoRelatorio({ perfil: "fulana", mes: "2026-10", doMes: mes() });
    expect(t.split("\n")[0]).toBe("Instagram — Outubro/26 · @fulana");
    expect(t).toContain("• Alcance: 683 mil");
    expect(t).toContain("• Saldo de seguidores: +580 (2.748 entraram, 2.168 saíram)");
    expect(t).toContain("• Engajamento: 10,4%");
  });

  it("compara com o mês anterior quando há base", () => {
    const t = textoDoRelatorio({
      perfil: null,
      mes: "2026-10",
      doMes: mes(),
      anterior: mes({ alcance: 186_000 }),
    });
    expect(t).toContain("683 mil (3,7× o mês anterior)");
  });

  it("sem mês anterior não inventa comparação", () => {
    expect(textoDoRelatorio({ perfil: null, mes: "2026-10", doMes: mes() })).not.toContain("mês anterior");
  });

  it("a meta só aparece quando existe", () => {
    const semMeta = textoDoRelatorio({ perfil: null, mes: "2026-10", doMes: mes() });
    expect(semMeta).not.toContain("Meta de saldo");

    const comMeta = textoDoRelatorio({
      perfil: null,
      mes: "2026-10",
      doMes: mes(),
      meta: { mes: "2026-10", saldoSeguidores: 1500, alcance: null, posts: null, metasPorFormato: null },
    });
    expect(comMeta).toContain("Meta de saldo: 1.500 — chegamos a 39%");
  });

  it("as três frases viram o bloco de resumo, e as vazias somem", () => {
    const t = textoDoRelatorio({
      perfil: null,
      mes: "2026-10",
      doMes: mes(),
      meta: {
        mes: "2026-10",
        saldoSeguidores: null,
        alcance: null,
        posts: null,
        metasPorFormato: null,
        resumoOndeEstamos: "Mês de maior alcance do ano.",
        resumoAprendizado: "   ",
        resumoPrioridade: "Segurar quem chega.",
      },
    });
    expect(t).toContain("RESUMO");
    expect(t).toContain("Mês de maior alcance do ano.");
    expect(t).toContain("Segurar quem chega.");
    expect(t.split("\n").filter((l) => l.trim() === "")).toHaveLength(2);
  });

  it("o plano vira linhas com responsável e prazo", () => {
    const t = textoDoRelatorio({
      perfil: null,
      mes: "2026-10",
      doMes: mes(),
      meta: {
        mes: "2026-10",
        saldoSeguidores: null,
        alcance: null,
        posts: null,
        metasPorFormato: null,
        plano: [
          { oQue: "Medir entradas no grupo", responsavel: "Ana", prazo: "18/11", status: "em-andamento" },
          { oQue: "   " },
        ],
      },
    });
    expect(t).toContain("• Medir entradas no grupo (Ana · 18/11 · em andamento)");
    expect(t).not.toContain("• \n");
  });

  it("o post do mês entra com o link quando existe", () => {
    const t = textoDoRelatorio({
      perfil: null,
      mes: "2026-10",
      doMes: mes({
        melhorPost: {
          id: "1",
          titulo: "Pare de fazer isso",
          permalink: "https://instagram.com/p/x",
          formato: "Reels",
          interacoes: 9_000,
          alcance: 94_000,
          engajamento: 9.5,
        },
      }),
    });
    expect(t).toContain("POST DO MÊS");
    expect(t).toContain("Pare de fazer isso (Reels) — 94.000 de alcance, 9.000 interações");
    expect(t).toContain("https://instagram.com/p/x");
  });
});

describe("cartoesDoRelatorio", () => {
  it("os quatro números que o cliente lê primeiro", () => {
    const c = cartoesDoRelatorio(mes(), mes({ crescimento: 236, engajamento: 13.9 }));
    expect(c.map((x) => x.rotulo)).toEqual([
      "Alcance",
      "Saldo de seguidores",
      "Saídas sobre entradas",
      "Engajamento",
    ]);
    expect(c[1].variacao).toBe("era +236");
    expect(c[2].valor).toBe("79%");
    expect(c[3].variacao).toBe("−3,5 pp");
  });

  it("sem mês anterior, os cartões ficam sem comparação em vez de inventar", () => {
    expect(cartoesDoRelatorio(mes()).every((c) => c.variacao === "")).toBe(true);
  });
});
