import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  funnelSurveys,
  funnelSpreadsheets,
  stageLeadScoringSchemas,
} from "../db/schema.js";

/**
 * Story 36.9 — elegibilidade do `lead-origin-sync` e fonte declarada.
 *
 * Os testes chamam `resolveLeadSource` e `computeLeadOriginForStage` de verdade;
 * o que está mockado é a borda (`readSheetData`) e o `db`. Reimplementar a regra
 * aqui e verificar a reimplementação é o defeito que o QA-32 da 43.5 apontou —
 * um teste que passa independentemente do código.
 */

const readSheetData = vi.hoisted(() => vi.fn());
vi.mock("../services/google-sheets.js", () => ({ readSheetData }));

const { resolveLeadSource, computeLeadOriginForStage } = await import(
  "../services/lead-origin-sync.js"
);

/**
 * `db` falso que roteia por TABELA (identidade do objeto drizzle), com uma fila
 * por tabela.
 *
 * A fila importa porque `funnelSurveys` pode ser consultada duas vezes — por id
 * (quando há Lead Scoring) e por stageId — e as duas precisam responder coisas
 * diferentes. Sem Lead Scoring o código faz UMA consulta só, então a fila tem um
 * item; escrever dois ali faz o teste ler a resposta errada e mentir sobre o
 * código (foi o que aconteceu na primeira versão deste arquivo).
 */
function fakeDb(filas: {
  scoring?: unknown[][];
  surveys?: unknown[][];
  spreadsheets?: unknown[][];
}) {
  const q = {
    scoring: [...(filas.scoring ?? [])],
    surveys: [...(filas.surveys ?? [])],
    spreadsheets: [...(filas.spreadsheets ?? [])],
  };
  const proxima = (table: unknown): unknown[] => {
    if (table === stageLeadScoringSchemas) return q.scoring.shift() ?? [];
    if (table === funnelSurveys) return q.surveys.shift() ?? [];
    if (table === funnelSpreadsheets) return q.spreadsheets.shift() ?? [];
    throw new Error("tabela inesperada na query");
  };
  return {
    select: () => ({
      from: (table: unknown) => {
        const rows = proxima(table);
        const chain = {
          where: () => chain,
          limit: () => Promise.resolve(rows),
          then: (r: (v: unknown[]) => unknown) => Promise.resolve(rows).then(r),
        };
        return chain;
      },
    }),
  } as never;
}

const SHEET_LEADS = {
  headers: ["E-mail", "Telefone", "utm_source", "utm_term", "Data"],
  rows: [
    ["ana@x.com", "11999990001", "facebook", "quente", "01/08/2026"],
    ["bru@x.com", "11999990002", "google", "frio", "02/08/2026"],
  ],
};

beforeEach(() => {
  readSheetData.mockReset();
});

describe("resolveLeadSource — elegibilidade (AC1)", () => {
  it("etapa SÓ com planilha de leads passa a ter fonte — era a causa do semDados", async () => {
    // Este é o caso do chamado: a etapa `81ea6018` (bbe-pr2-ago-26, "Leads
    // Popup"). Antes desta story `resolveLeadSource` não existia e o compute
    // devolvia null aqui, o que virava `stagesSkipped` e `semDados` no endpoint.
    const db = fakeDb({
      scoring: [[]],
      surveys: [[]],
      spreadsheets: [
        [{ spreadsheetId: "ss1", sheetName: "n8n-leads-lp", label: "Leads Popup", columnMapping: {} }],
      ],
    });
    const fonte = await resolveLeadSource(db, "stage-1");
    expect(fonte?.kind).toBe("planilha_leads");
    expect(fonte?.sheets).toHaveLength(1);
    expect(fonte?.sheets[0].sheetName).toBe("n8n-leads-lp");
  });

  it("etapa sem NENHUMA fonte devolve null — base do motivo etapa_sem_fonte (AC5)", async () => {
    const fonte = await resolveLeadSource(
      fakeDb({ scoring: [[]], surveys: [[]], spreadsheets: [[]] }),
      "stage-vazia",
    );
    expect(fonte).toBeNull();
  });
});

describe("resolveLeadSource — precedência", () => {
  it("etapa com pesquisa E planilha de leads continua na PESQUISA", async () => {
    // O ponto desta story é não mexer em quem já funciona. O diagnóstico de
    // 2026-08-15 achou 4 etapas em produção computando este cache pela pesquisa;
    // promover a planilha aqui trocaria o denominador delas em silêncio.
    //
    // Se alguém implementar a precedência do AC2 original, este teste quebra —
    // e deve quebrar junto com uma decisão registrada, não de passagem.
    const db = fakeDb({
      scoring: [[]],
      surveys: [[{ spreadsheetId: "ss-pesquisa", sheetName: "Pesquisa-Captação" }]],
      spreadsheets: [
        [{ spreadsheetId: "ss-leads", sheetName: "n8n-leads-lp", label: "Leads", columnMapping: {} }],
      ],
    });
    const fonte = await resolveLeadSource(db, "stage-com-ambas");
    expect(fonte?.kind).toBe("pesquisa");
    expect(fonte?.sheets[0].sheetName).toBe("Pesquisa-Captação");
  });

  it("Lead Scoring vence a pesquisa solta", async () => {
    const db = fakeDb({
      scoring: [[{ surveyId: "srv-9" }]],
      surveys: [[{ spreadsheetId: "ss-scoring", sheetName: "Pesquisa-Captação" }]],
      spreadsheets: [[]],
    });
    expect((await resolveLeadSource(db, "s"))?.kind).toBe("lead_scoring");
  });
});

describe("computeLeadOriginForStage — payload da planilha de leads", () => {
  it("declara a fonte no payload (AC3)", async () => {
    readSheetData.mockResolvedValue(SHEET_LEADS);
    const payload = await computeLeadOriginForStage(
      fakeDb({
        scoring: [[]],
        surveys: [[]],
        spreadsheets: [[{ spreadsheetId: "ss1", sheetName: "n8n-leads-lp", label: "Leads Popup", columnMapping: {} }]],
      }),
      "stage-1",
    );
    // Sem `fonte`, contar respondentes e contar leads chegam com a mesma forma a
    // quem consome — e ninguém sabe qual dos dois está lendo.
    expect(payload?.fonte).toBe("planilha_leads");
    expect(payload?.fontes).toEqual([
      { label: "Leads Popup", sheetName: "n8n-leads-lp", leads: 2 },
    ]);
    expect(payload?.totalLeads).toBe(2);
    expect(payload?.uniqueLeads).toBe(2);
  });

  it("column_mapping vence os aliases (AC4)", async () => {
    // Caso real: `n8n-kiwify-captação` mapeia utm_source para a coluna chamada
    // `s=`. Nenhum alias de ALIASES.utmSource acha isso — só o mapeamento.
    readSheetData.mockResolvedValue({
      headers: ["E-mail", "s=", "t="],
      rows: [["ana@x.com", "facebook", "quente"]],
    });
    const payload = await computeLeadOriginForStage(
      fakeDb({
        scoring: [[]],
        surveys: [[]],
        spreadsheets: [
          [{
            spreadsheetId: "ss1", sheetName: "n8n-kiwify-captação", label: "Leads",
            columnMapping: { email: "E-mail", utm_source: "s=", utm_term: "t=" },
          }],
        ],
      }),
      "stage-1",
    );
    expect(payload?.columnsResolved.utmSource).toBe(true);
    expect(payload?.columnsResolved.utmTerm).toBe(true);
    // Resolveu a coluna certa: `facebook` classifica como Pago, não Sem Track.
    expect(payload?.byOrigin.find((o) => o.origem === "Pago")?.leads).toBe(1);
  });

  it("duas planilhas somam e deduplicam ENTRE elas, declarando as duas", async () => {
    // `bbe-pr1-mar-26` tem "Leads evento" + "Leads bbe-escala-sales". Decisão de
    // 2026-08-15: somar e declarar. `ana@x.com` aparece nas duas e conta uma vez
    // em uniqueLeads — mas as duas linhas contam em totalLeads.
    readSheetData
      .mockResolvedValueOnce(SHEET_LEADS)
      .mockResolvedValueOnce({
        headers: ["E-mail", "Telefone", "utm_source", "utm_term", "Data"],
        rows: [["ana@x.com", "11999990001", "facebook", "quente", "03/08/2026"]],
      });
    const payload = await computeLeadOriginForStage(
      fakeDb({
        scoring: [[]],
        surveys: [[]],
        spreadsheets: [[
          { spreadsheetId: "ss1", sheetName: "Leads-Cap-Paga", label: "Leads bbe-escala-sales", columnMapping: {} },
          { spreadsheetId: "ss1", sheetName: "Leads-Evento", label: "Leads evento", columnMapping: {} },
        ]],
      }),
      "stage-multi",
    );
    expect(payload?.totalLeads).toBe(3);
    expect(payload?.uniqueLeads).toBe(2);
    expect(payload?.fontes).toHaveLength(2);
    expect(payload?.fontes.map((f) => f.leads)).toEqual([2, 1]);
    // O range cobre as duas planilhas, não só a primeira.
    expect(payload?.range).toEqual({ from: "2026-08-01", to: "2026-08-03" });
  });

  it("uma planilha ilegível não derruba a outra (AC7)", async () => {
    readSheetData
      .mockRejectedValueOnce(new Error("403 sem permissão"))
      .mockResolvedValueOnce(SHEET_LEADS);
    const payload = await computeLeadOriginForStage(
      fakeDb({
        scoring: [[]],
        surveys: [[]],
        spreadsheets: [[
          { spreadsheetId: "ss-quebrada", sheetName: "A", label: "A", columnMapping: {} },
          { spreadsheetId: "ss-ok", sheetName: "B", label: "B", columnMapping: {} },
        ]],
      }),
      "stage-parcial",
    );
    expect(payload?.totalLeads).toBe(2);
    // A que falhou some de `fontes` — é assim que quem consome percebe a perda.
    expect(payload?.fontes.map((f) => f.label)).toEqual(["B"]);
  });

  it("TODAS as planilhas ilegíveis devolvem null, não um payload zerado", async () => {
    // Zero leads e "não consegui ler" são coisas diferentes. Um payload zerado
    // gravaria no cache que ninguém se cadastrou — e o endpoint devolveria isso
    // com cara de dado bom, que é a classe de defeito que o Epic 43 fechou.
    readSheetData.mockRejectedValue(new Error("timeout"));
    const payload = await computeLeadOriginForStage(
      fakeDb({
        scoring: [[]],
        surveys: [[]],
        spreadsheets: [[{ spreadsheetId: "x", sheetName: "A", label: "A", columnMapping: {} }]],
      }),
      "stage-ilegivel",
    );
    expect(payload).toBeNull();
  });
});
