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

describe("GraficoDoPerfil", () => {
  it("abre no diário e oferece só as métricas com série", () => {
    montar({ data: insights, isLoading: false, accountId: "conta" });
    expect(screen.getByText("Dia a dia")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alcance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Novos seguidores" })).toBeTruthy();
    // "Unfollows" só existe no mensal: a Meta não dá unfollow por dia.
    expect(screen.queryByRole("button", { name: "Unfollows" })).toBeNull();
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

  it("voltar para o diário reaproveita uma métrica que existe lá", () => {
    // "Unfollows" não existe no diário: sem o ajuste, o gráfico ficaria vazio.
    montar({ data: insights, isLoading: false, accountId: "conta" });
    fireEvent.click(screen.getByRole("button", { name: "Mensal" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfollows" }));
    fireEvent.click(screen.getByRole("button", { name: "Diário" }));
    expect(screen.getByText("Dia a dia")).toBeTruthy();
    expect(screen.queryByText("Sem dados no período.")).toBeNull();
  });

  it("sem série nenhuma, avisa em vez de desenhar vazio", () => {
    montar({ data: [], isLoading: false, accountId: "conta" });
    expect(screen.getByText("Sem dados no período.")).toBeTruthy();
  });
});
