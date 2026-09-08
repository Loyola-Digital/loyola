/**
 * O registro de uso.
 *
 * O que protege: webhook e API pública não contam como gente usando o produto
 * (contá-los infla a adesão de quem nunca abriu a tela), rota nova não some do
 * relatório, e o acumulador não perde contagem entre dois drenos.
 */

import { describe, expect, it } from "vitest";
import { AcumuladorDeUso, areaDaRota, horaCheia } from "../services/adesao.js";

describe("areaDaRota", () => {
  it("reconhece as áreas do produto", () => {
    expect(areaDaRota("/api/swipe-files")?.chave).toBe("swipe");
    expect(areaDaRota("/api/planner/anual/x/2026")?.chave).toBe("planner");
    expect(areaDaRota("/api/tasks/123")?.chave).toBe("tasks");
  });

  it("o prefixo mais específico vence — mapas não caem em funis", () => {
    expect(areaDaRota("/api/funnel-maps/abc")?.chave).toBe("mapas");
    expect(areaDaRota("/api/funnel-stages/abc")?.chave).toBe("funis");
  });

  it("webhook e API pública NÃO contam — é máquina, não gente", () => {
    expect(areaDaRota("/api/webhooks/kiwify")).toBeNull();
    expect(areaDaRota("/api/public-leads")).toBeNull();
    expect(areaDaRota("/api/health")).toBeNull();
  });

  it("rota nova cai num balde próprio em vez de sumir", () => {
    expect(areaDaRota("/api/algo-que-nao-existe-ainda")?.chave).toBe("outros");
  });

  it("ignora a query string", () => {
    expect(areaDaRota("/api/swipe-files?q=vsl&tag=escassez")?.chave).toBe("swipe");
  });

  it("o que não é da API não conta", () => {
    expect(areaDaRota("/favicon.ico")).toBeNull();
    expect(areaDaRota("/")).toBeNull();
  });
});

describe("horaCheia", () => {
  it("zera minuto, segundo e milissegundo", () => {
    expect(horaCheia(new Date("2026-09-08T14:37:22.451Z")).toISOString()).toBe(
      "2026-09-08T14:00:00.000Z",
    );
  });

  it("não modifica a data recebida", () => {
    const d = new Date("2026-09-08T14:37:22.451Z");
    horaCheia(d);
    expect(d.toISOString()).toBe("2026-09-08T14:37:22.451Z");
  });
});

describe("AcumuladorDeUso", () => {
  const t = (h: string) => new Date(`2026-09-08T${h}:00.000Z`);

  it("soma as requisições da mesma hora e área numa linha só", () => {
    const a = new AcumuladorDeUso();
    for (const m of ["14:01", "14:30", "14:59"]) a.registrar("u1", "swipe", t(m));
    const linhas = a.drenar();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].requisicoes).toBe(3);
  });

  it("separa por hora, por área e por pessoa", () => {
    const a = new AcumuladorDeUso();
    a.registrar("u1", "swipe", t("14:10"));
    a.registrar("u1", "swipe", t("15:10")); // outra hora
    a.registrar("u1", "planner", t("14:10")); // outra área
    a.registrar("u2", "swipe", t("14:10")); // outra pessoa
    expect(a.drenar()).toHaveLength(4);
  });

  it("drenar ZERA — o segundo dreno não regrava o que já foi gravado", () => {
    const a = new AcumuladorDeUso();
    a.registrar("u1", "swipe", t("14:10"));
    expect(a.drenar()).toHaveLength(1);
    expect(a.drenar()).toHaveLength(0);
  });

  it("continua contando depois de drenar", () => {
    const a = new AcumuladorDeUso();
    a.registrar("u1", "swipe", t("14:10"));
    a.drenar();
    a.registrar("u1", "swipe", t("14:20"));
    expect(a.drenar()[0].requisicoes).toBe(1);
  });
});
