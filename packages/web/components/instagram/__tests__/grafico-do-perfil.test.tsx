// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GraficoDoPerfil } from "../grafico-do-perfil";

/** O app inteiro roda dentro de um TooltipProvider (`lib/providers.tsx`). */
const montar = (props: Parameters<typeof GraficoDoPerfil>[0]) =>
  render(
    <TooltipProvider>
      <GraficoDoPerfil {...props} />
    </TooltipProvider>,
  );

/**
 * O gráfico troca de escala, de métrica e de tipo (linha/barra) no clique —
 * caminhos que só existem em execução. Um `SelectLabel` fora do grupo já
 * derrubou uma tela desta área com tsc e lint limpos.
 */

vi.mock("@/lib/hooks/use-instagram-mensal", () => ({
  useInstagramMensal: () => ({
    data: {
      meses: [
        { mes: "2026-07", alcance: 1_000_000, views: 2_000_000, interacoes: 50_000, novosSeguidores: 900, unfollows: 3_155, crescimento: -2_255, seguidoresNoFim: 100_000, posts: 20 },
        { mes: "2026-08", alcance: 1_400_000, views: 2_400_000, interacoes: 80_000, novosSeguidores: 8_000, unfollows: 3_866, crescimento: 4_134, seguidoresNoFim: 104_134, posts: 25 },
      ],
    },
    isLoading: false,
  }),
}));

const insights = [
  {
    name: "reach",
    period: "day",
    title: "",
    description: "",
    id: "x",
    values: [
      { value: 73_770, end_time: "2026-09-04T07:00:00+0000" },
      { value: 62_628, end_time: "2026-09-05T07:00:00+0000" },
    ],
  },
  {
    name: "follower_count",
    period: "day",
    title: "",
    description: "",
    id: "y",
    values: [{ value: 536, end_time: "2026-09-04T07:00:00+0000" }],
  },
];

/** O período anterior, para a linha cinza de comparação. */
const anteriores = [
  {
    name: "reach",
    period: "day",
    title: "",
    description: "",
    id: "x0",
    values: [
      { value: 40_000, end_time: "2026-08-05T07:00:00+0000" },
      { value: 38_000, end_time: "2026-08-06T07:00:00+0000" },
    ],
  },
];

describe("GraficoDoPerfil", () => {
  it("abre no diário com os dois painéis, sem alternador de métrica", () => {
    montar({ data: insights, isLoading: false, accountId: "conta" });
    expect(screen.getByText("Dia a dia")).toBeTruthy();
    // As duas métricas aparecem como TÍTULO de painel, não como botão: sendo
    // duas, não há o que escolher.
    expect(screen.getByText("Alcance")).toBeTruthy();
    expect(screen.getByText("Novos seguidores")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alcance" })).toBeNull();
    // "Unfollows" só existe no mensal: a Meta não dá unfollow por dia.
    expect(screen.queryByRole("button", { name: "Unfollows" })).toBeNull();
  });

  it("com período anterior, a legenda nomeia a linha cinza", () => {
    montar({ data: insights, dataAnterior: anteriores, isLoading: false, accountId: "conta" });
    expect(screen.getByText("período anterior")).toBeTruthy();
  });

  it("sem período anterior não promete comparação", () => {
    montar({ data: insights, isLoading: false, accountId: "conta" });
    expect(screen.queryByText("período anterior")).toBeNull();
  });

  it("trocar para mensal muda o título e abre as métricas do mês", () => {
    montar({ data: insights, isLoading: false, accountId: "conta" });
    fireEvent.click(screen.getByRole("button", { name: "Mensal" }));
    expect(screen.getByText("Mês a mês")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unfollows" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publicações" })).toBeTruthy();
  });

  it("clicar numa métrica do mês não quebra", () => {
    montar({ data: insights, isLoading: false, accountId: "conta" });
    fireEvent.click(screen.getByRole("button", { name: "Mensal" }));
    for (const nome of ["Saldo", "Seguidores", "Views", "Publicações"]) {
      fireEvent.click(screen.getByRole("button", { name: nome }));
    }
    expect(screen.getByText("Mês a mês")).toBeTruthy();
  });

  it("voltar para o diário não herda a métrica do mês", () => {
    // "Unfollows" não existe no diário: sem o ajuste, o gráfico ficaria vazio.
    montar({ data: insights, isLoading: false, accountId: "conta" });
    fireEvent.click(screen.getByRole("button", { name: "Mensal" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfollows" }));
    fireEvent.click(screen.getByRole("button", { name: "Diário" }));
    expect(screen.getByText("Dia a dia")).toBeTruthy();
    expect(screen.queryByText("Sem dados no período.")).toBeNull();
  });

  // Sem esta marca a linha sempre termina numa queda que não aconteceu.
  it("com dias suficientes, avisa que os últimos ainda estão fechando", () => {
    const umMes = [
      {
        name: "reach",
        period: "day",
        title: "",
        description: "",
        id: "z",
        values: Array.from({ length: 10 }, (_, i) => ({
          value: 50_000 + i * 100,
          end_time: `2026-09-${String(i + 1).padStart(2, "0")}T07:00:00+0000`,
        })),
      },
    ];
    montar({ data: umMes, isLoading: false, accountId: "conta" });
    expect(screen.getByText("últimos 2 dias ainda fechando")).toBeTruthy();
  });

  it("sem série nenhuma, avisa em vez de desenhar vazio", () => {
    montar({ data: [], isLoading: false, accountId: "conta" });
    expect(screen.getByText("Sem dados no período.")).toBeTruthy();
  });
});
