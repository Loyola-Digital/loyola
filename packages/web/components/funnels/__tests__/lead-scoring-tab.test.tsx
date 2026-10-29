// @vitest-environment jsdom

/**
 * A aba de Lead Scoring abrindo — com e sem pesquisa cadastrada.
 *
 * Existe por um defeito de produção: `pesquisaPorWebhook` lia
 * `selectedSurveyId` acima da linha que o declara com `const`. Isso é TDZ, mas
 * não quebra sempre — `Array.prototype.find` não chama o callback em array
 * vazio. Então a aba abria normalmente em toda etapa SEM pesquisa e estourava
 * "Cannot access 'k' before initialization" exatamente nas que têm, que são as
 * que importam.
 *
 * O `tsc` não pega (o acesso está dentro de um callback, que ele assume poder
 * rodar depois) e o lint também não, com a regra que o repo usa. O que pega é
 * renderizar com a lista CHEIA — por isso o caso de duas pesquisas é o
 * primeiro teste aqui.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadScoringTab } from "../lead-scoring-tab";
import * as sheets from "@/lib/hooks/use-google-sheets";
import * as scoring from "@/lib/hooks/use-lead-scoring";
import type { FunnelSurvey } from "@/lib/hooks/use-google-sheets";

/**
 * O cliente de API é o único ponto da árvore que exige o Clerk
 * (`useAuth` dentro de `<ClerkProvider>`). Mockar só ele deixa os hooks que
 * não controlamos — o do dialog de webhook, por exemplo — rodarem de verdade,
 * em vez de substituir a árvore inteira por dublês.
 */
vi.mock("@/lib/hooks/use-api-client", () => ({
  useApiClient: () => vi.fn(async () => ({})),
}));

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LeadScoringTab {...PROPS} />
    </QueryClientProvider>,
  );
}

function pesquisa(over: Partial<FunnelSurvey> = {}): FunnelSurvey {
  return {
    id: "survey-1",
    funnelId: "funnel-1",
    stageId: "stage-1",
    spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    spreadsheetName: "Respostas",
    sheetName: "Form Responses 1",
    surveyType: "paid",
    columnMapping: {} as FunnelSurvey["columnMapping"],
    createdAt: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

/** Os quatro hooks da aba, nos estados "carregou e está vazio". */
function mockarHooks(surveys: FunnelSurvey[]) {
  vi.spyOn(sheets, "useFunnelSurveys").mockReturnValue({
    data: { surveys },
    isLoading: false,
  } as unknown as ReturnType<typeof sheets.useFunnelSurveys>);

  vi.spyOn(scoring, "useLeadScoring").mockReturnValue({
    data: undefined,
    isLoading: false,
  } as unknown as ReturnType<typeof scoring.useLeadScoring>);

  vi.spyOn(scoring, "useLeadScoringResults").mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof scoring.useLeadScoringResults>);

  vi.spyOn(scoring, "useLeadScoringDebug").mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof scoring.useLeadScoringDebug>);

  vi.spyOn(scoring, "useSaveLeadScoring").mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof scoring.useSaveLeadScoring>);
}

const PROPS = { projectId: "proj-1", funnelId: "funnel-1", stageId: "stage-1" };

describe("LeadScoringTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("abre com pesquisa cadastrada — o caso que quebrava", () => {
    mockarHooks([
      pesquisa(),
      pesquisa({ id: "survey-2", spreadsheetId: "webhook-pesquisa:abc", spreadsheetName: "QUIZZ" }),
    ]);

    // Renderizar é a asserção: o defeito original era um throw aqui.
    const { container } = renderizar();
    expect(container.innerHTML).toContain("Fonte das respostas");
  });

  it("abre também sem pesquisa nenhuma, que era o caminho que parecia são", () => {
    mockarHooks([]);
    const { container } = renderizar();
    expect(container.innerHTML).toContain("Fonte das respostas");
  });

  it("a pesquisa por webhook é reconhecida pelo prefixo, e só ela", () => {
    mockarHooks([
      pesquisa({ id: "planilha", spreadsheetName: "Planilha de verdade" }),
      pesquisa({ id: "wh", spreadsheetId: "webhook-pesquisa:abc", spreadsheetName: "QUIZZ" }),
    ]);
    const { container } = renderizar();

    // O prefixo 🔗 marca a que chega por webhook; a planilha fica sem ele.
    expect(container.innerHTML).toContain("Ver o webhook");
    expect(container.innerHTML).not.toContain("🔗 Planilha de verdade");
  });
});
