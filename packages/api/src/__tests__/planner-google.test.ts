/**
 * A leitura da agenda do Google.
 *
 * Os casos vêm da agenda real ("🇺🇸 [FZ] Agenda Geral"), lida em 02/09/2026:
 * 20 eventos, todos de dia inteiro, todos com nome de campanha no título.
 */

import { describe, expect, it } from "vitest";
import { corParaCampanha, separarTitulo } from "../services/planner-google.js";

const PALETA = ["#6D5BD0", "#C2851B", "#2D7F8C", "#C4503F", "#4B8B3B"] as const;

describe("separarTitulo", () => {
  it("o padrão com hífen, como está na agenda", () => {
    expect(separarTitulo("FZL3 - Prod. Captação")).toEqual({
      campanha: "FZL3",
      fase: "Prod. Captação",
    });
    expect(separarTitulo("FZM2 - Exec. da Captação")).toEqual({
      campanha: "FZM2",
      fase: "Exec. da Captação",
    });
  });

  it("o padrão com colchete", () => {
    expect(separarTitulo("[FZ BLACK] Definições")).toEqual({
      campanha: "FZ BLACK",
      fase: "Definições",
    });
  });

  it("emoji antes do colchete não atrapalha", () => {
    // O caso real: "☠️ [FÉRIAS] Fernanda Zapparoli".
    expect(separarTitulo("☠️ [FÉRIAS] Fernanda Zapparoli")).toEqual({
      campanha: "FÉRIAS",
      fase: "Fernanda Zapparoli",
    });
  });

  it("o colchete vence o hífen quando os dois aparecem", () => {
    // Ali quem separa campanha de fase é o colchete; o hífen faz parte do
    // nome da fase.
    expect(separarTitulo("[FZ BLACK] Exec. - semana 2")).toEqual({
      campanha: "FZ BLACK",
      fase: "Exec. - semana 2",
    });
  });

  it("hífen sem espaços NÃO separa — é um nome só", () => {
    expect(separarTitulo("FZ-BLACK")).toEqual({ campanha: "", fase: "FZ-BLACK" });
  });

  it("ponto não separa", () => {
    // "Prod. Captação" tem ponto, e quebrar ali daria campanha "Prod".
    expect(separarTitulo("Prod. Captação")).toEqual({ campanha: "", fase: "Prod. Captação" });
  });

  it("sem padrão, o título inteiro é a FASE e a campanha fica vazia", () => {
    // Inventar campanha a partir da primeira palavra criaria uma campanha nova
    // a cada evento solto.
    expect(separarTitulo("Reunião com o time")).toEqual({
      campanha: "",
      fase: "Reunião com o time",
    });
  });

  it("colchete sem texto depois usa o próprio rótulo como fase", () => {
    expect(separarTitulo("[FÉRIAS]")).toEqual({ campanha: "FÉRIAS", fase: "FÉRIAS" });
  });

  it("aceita travessão além do hífen", () => {
    expect(separarTitulo("FZM3 — Definições")).toEqual({
      campanha: "FZM3",
      fase: "Definições",
    });
  });
});

describe("corParaCampanha", () => {
  it("a mesma campanha recebe a mesma cor em toda importação", () => {
    // Sem isso, reimportar embaralharia as cores e a legenda deixaria de ser
    // reconhecível entre uma sessão e outra.
    expect(corParaCampanha("FZ BLACK", PALETA)).toBe(corParaCampanha("FZ BLACK", PALETA));
  });

  it("campanhas diferentes tendem a cores diferentes", () => {
    const cores = new Set(["FZL3", "FZM2", "FZM3", "FZ BLACK"].map((n) => corParaCampanha(n, PALETA)));
    expect(cores.size).toBeGreaterThan(1);
  });

  it("sempre devolve uma cor da paleta", () => {
    for (const nome of ["", "A", "campanha com nome bem comprido", "☠️"]) {
      expect(PALETA).toContain(corParaCampanha(nome, PALETA));
    }
  });
});
