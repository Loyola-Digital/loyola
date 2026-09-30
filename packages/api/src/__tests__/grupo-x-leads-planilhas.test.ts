/**
 * De onde `leadsDoFunil` tira os leads.
 *
 * O caso real: o `dgpg05-out-26` não tem uma linha sequer em
 * `funnel_spreadsheets` — a captação inteira dele é uma pesquisa
 * ("Pesquisa-Captação"). Lendo só as planilhas de captação, o funil vinha com
 * ZERO leads e todas as 7 pessoas do grupo caíam em "Sem cadastro", sem erro
 * nenhum na tela.
 *
 * Mockado só a borda (`readSheetData`) e o `db`, como em
 * `lead-origin-source.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { funnelSpreadsheets, funnelSurveys } from "../db/schema.js";

const readSheetData = vi.hoisted(() => vi.fn());
vi.mock("../services/google-sheets.js", () => ({ readSheetData }));

const { leadsDoFunil } = await import("../services/grupo-x-leads.js");

function fakeDb(filas: { surveys?: unknown[]; spreadsheets?: unknown[] }) {
  const linhas = (table: unknown): unknown[] => {
    if (table === funnelSurveys) return filas.surveys ?? [];
    if (table === funnelSpreadsheets) return filas.spreadsheets ?? [];
    throw new Error("tabela inesperada na query");
  };
  return {
    select: () => ({
      from: (table: unknown) => {
        const rows = linhas(table);
        const chain = {
          where: () => chain,
          then: (r: (v: unknown[]) => unknown) => Promise.resolve(rows).then(r),
        };
        return chain;
      },
    }),
  } as never;
}

const PESQUISA = {
  spreadsheetId: "s1",
  sheetName: "Pesquisa-Captação",
  columnMapping: {
    email: "Digite o e-mail de compra, por favor:",
    phone: "Agora seu WhatsApp/Telefone:",
    utm_source: "utm_source",
    utm_medium: "utm_medium",
  },
};

describe("leadsDoFunil", () => {
  beforeEach(() => readSheetData.mockReset());

  it("lê a PESQUISA quando o funil não tem planilha de captação (o dgpg05)", async () => {
    readSheetData.mockResolvedValueOnce({
      headers: ["Nome", "Agora seu WhatsApp/Telefone:", "utm_source", "utm_medium"],
      rows: [["Marcelo Viana", "+55 (41) 99549-0890", "whatsapp", "organico"]],
    });
    const leads = await leadsDoFunil(fakeDb({ surveys: [PESQUISA] }), "f1");
    expect(leads.get("95490890")).toMatchObject({
      nome: "Marcelo Viana",
      canal: "WhatsApp",
    });
  });

  it("resolve a UTM pelo MAPEAMENTO, não pelo nome do cabeçalho", async () => {
    // A `n8n-kiwify-captação` do dg-pg02 mapeia utm_source para uma coluna
    // chamada literalmente `s=` — nenhum alias acha isso, e sem o mapeamento
    // 648 pessoas do grupo caíam em "Sem Track".
    readSheetData.mockResolvedValueOnce({
      headers: ["telefone", "s="],
      rows: [["11964911718", "meta"]],
    });
    const leads = await leadsDoFunil(
      fakeDb({
        spreadsheets: [
          {
            spreadsheetId: "s2",
            sheetName: "n8n-kiwify-captação",
            columnMapping: { phone: "telefone", utm_source: "s=" },
          },
        ],
      }),
      "f1",
    );
    expect(leads.get("64911718")?.canal).toBe("Meta Ads");
  });

  it("canal conhecido de uma planilha vence o Sem Track da outra", async () => {
    readSheetData
      .mockResolvedValueOnce({
        headers: ["telefone"],
        rows: [["11964911718"]], // planilha sem UTM nenhuma
      })
      .mockResolvedValueOnce({
        headers: ["telefone", "utm_source"],
        rows: [["5511964911718", "meta"]],
      });
    const leads = await leadsDoFunil(
      fakeDb({
        spreadsheets: [{ spreadsheetId: "a", sheetName: "sem-utm", columnMapping: {} }],
        surveys: [{ spreadsheetId: "b", sheetName: "com-utm", columnMapping: {} }],
      }),
      "f1",
    );
    expect(leads.get("64911718")?.canal).toBe("Meta Ads");
  });

  it("planilha fora do ar não zera as outras", async () => {
    readSheetData
      .mockRejectedValueOnce(new Error("403"))
      .mockResolvedValueOnce({
        headers: ["telefone", "utm_source"],
        rows: [["11964911718", "instagram"]],
      });
    const leads = await leadsDoFunil(
      fakeDb({
        spreadsheets: [{ spreadsheetId: "a", sheetName: "quebrada", columnMapping: {} }],
        surveys: [{ spreadsheetId: "b", sheetName: "boa", columnMapping: {} }],
      }),
      "f1",
    );
    expect(leads.get("64911718")?.canal).toBe("Instagram");
  });

  it("a mesma planilha ligada nas duas pontas é lida uma vez só", async () => {
    readSheetData.mockResolvedValue({ headers: ["telefone"], rows: [["11964911718"]] });
    const mesma = { spreadsheetId: "x", sheetName: "Leads", columnMapping: {} };
    await leadsDoFunil(fakeDb({ spreadsheets: [mesma], surveys: [mesma] }), "f1");
    expect(readSheetData).toHaveBeenCalledTimes(1);
  });
});
