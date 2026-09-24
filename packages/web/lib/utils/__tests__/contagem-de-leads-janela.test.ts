/**
 * Story 18.85 (AC2/AC4/AC6) — a contagem de leads respeita a janela do seletor.
 *
 * Relógio fixado em 2026-09-23 (as datas medidas só dão estes números nesse
 * dia) e fuso fixo: o vitest do web roda em `TZ=America/Sao_Paulo`
 * (`vitest.config.ts`). Fixture real do `fz-m2` (sem PII — ver `_origem`).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contarLeadsDaPlanilha,
  hojeNoNavegador,
  recortarPelaJanela,
} from "@/lib/utils/contagem-de-leads";

const HOJE = "2026-09-23";
const fzM2 = JSON.parse(
  readFileSync(new URL("./fixtures/fz-m2-leads-janela.json", import.meta.url), "utf-8"),
) as { headers: string[]; rows: string[][] };

const soma = (r: Record<string, { total: number }>) => Object.values(r).reduce((s, n) => s + n.total, 0);

describe("fz-m2 real: 525 leads de julho/agosto e investimento de 30 dias", () => {
  it("sem janela contava 525 (o defeito)", () => {
    expect(soma(contarLeadsDaPlanilha(fzM2).leadsByLp)).toBe(525);
    expect(soma(contarLeadsDaPlanilha(fzM2).leadsPagosPorAnuncio)).toBe(525);
  });

  it("com a janela de 30 dias em 2026-09-23: 0 lead pago", () => {
    // Mutação: voltar a ignorar `days` → 525 e o teste cai.
    const c = contarLeadsDaPlanilha(fzM2, { days: 30, colunaDeData: "data", hoje: HOJE });
    expect(soma(c.leadsByLp)).toBe(0);
    expect(soma(c.leadsPagosPorAnuncio)).toBe(0);
    expect(c.janela).toEqual({ aplicada: true, foraDaJanela: 531, semData: 0, colunaAusente: false });
  });
});

describe("a borda é a do shared (18.80), não `hoje − days` inclusivo", () => {
  const headers = ["data", "utm_source", "utm_content", "utm_term"];
  const lead = (dia: string) => [dia, "meta", "120", "x--hot--lpa"];

  it("30 dias em 23/09 = 25/08 a 23/09; 24/08 fica fora", () => {
    // Mutação: `inicio = hoje − days` → 24/08 entra (31 dias) e o teste cai.
    const c = contarLeadsDaPlanilha(
      { headers, rows: [lead("2026-08-24"), lead("2026-08-25"), lead("23/09/2026"), lead("2026-09-24")] },
      { days: 30, colunaDeData: "data", hoje: HOJE },
    );
    expect(c.leadsPagosPorAnuncio["120"]).toEqual({ hot: 2, cold: 0, total: 2 });
    expect(c.janela.foraDaJanela).toBe(2);
  });

  it("7 dias em 23/09 = 17/09 a 23/09", () => {
    const { linhas } = recortarPelaJanela(headers, [lead("2026-09-16"), lead("2026-09-17")], {
      days: 7, colunaDeData: "data", hoje: HOJE,
    });
    expect(linhas.map((l) => l[0])).toEqual(["2026-09-17"]);
  });
});

describe("AC4/PO-04 — nada some calado", () => {
  const headers = ["Data Criação Lead", "utm_source", "utm_content", "utm_term"];
  const rows = [
    ["2026-09-20", "meta", "1", "lpa"],
    ["", "meta", "1", "lpa"],
    ["ontem", "meta", "1", "lpa"],
  ];

  it("data ilegível numa planilha COM a coluna: a linha sai e é contada", () => {
    const c = contarLeadsDaPlanilha({ headers, rows }, { days: 30, colunaDeData: "data criação lead", hoje: HOJE });
    expect(c.leadsPagosPorAnuncio["1"].total).toBe(1);
    expect(c.janela.semData).toBe(2);
  });

  it("coluna mapeada e AUSENTE do cabeçalho (renomeada): conta tudo, não zera", () => {
    // Mutação: copiar o `filterSheetRowsByDays` (que zera nesse caso) → 0.
    const c = contarLeadsDaPlanilha({ headers, rows }, { days: 30, colunaDeData: "data", hoje: HOJE });
    expect(c.leadsPagosPorAnuncio["1"].total).toBe(3);
    expect(c.janela).toEqual({ aplicada: false, foraDaJanela: 0, semData: 0, colunaAusente: true });
  });

  it("sem coluna de data mapeada: como antes (sem filtro)", () => {
    const c = contarLeadsDaPlanilha({ headers, rows }, { days: 30, colunaDeData: undefined, hoje: HOJE });
    expect(c.leadsPagosPorAnuncio["1"].total).toBe(3);
    expect(c.janela.aplicada).toBe(false);
  });
});

describe("hojeNoNavegador — o 'hoje' do front é o do fuso local", () => {
  afterEach(() => vi.useRealTimers());

  it("02h30 UTC de 24/09 ainda é 23/09 em São Paulo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T02:30:00Z"));
    expect(hojeNoNavegador()).toBe(HOJE);
  });
});

describe("o fio: o hook passa a janela e reconta quando ela muda (PO-05/PO-07)", () => {
  const hook = readFileSync(
    fileURLToPath(new URL("../../hooks/useCrossReferenceLeads.ts", import.meta.url)),
    "utf-8",
  );

  it("usa o `days` que recebe (não mais `_days`)", () => {
    expect(hook).not.toMatch(/days: _days/);
    expect(hook).toMatch(/const colunaDeData = leadsSheet\?\.columnMapping\?\.date;/);
    expect(hook).toMatch(/contarLeadsDaPlanilha\([^)]*\{\s*days,\s*colunaDeData,\s*hoje: hojeNoNavegador\(\),\s*\}\)/);
  });

  it("o memo depende de `days` e da coluna de data", () => {
    // Mutação: deps só `[sheetQuery.data]` → trocar o seletor não reconta.
    expect(hook).toMatch(/\[sheetQuery\.data, days, colunaDeData\]/);
  });
});
