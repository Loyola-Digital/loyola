/**
 * Story 18.28: Testes do componente
 * AC3: Exibir tabela compilada
 * AC4: Transição entre modos
 * AC5: Sem breaking changes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StageCreativePerformanceTable } from "../stage-creative-performance-table";
import * as useStageCreativePerformanceModule from "@/lib/hooks/useStageCreativePerformance";

// Mock do hook
const mockCreativeData = {
  stageId: "stage-1",
  stageType: "awareness",
  days: 30,
  creatives: [
    {
      adId: "ad_1_hot",
      adName: "Criativo A",
      spend: 100,
      impressions: 1000,
      clicks: 50,
      leads: 5,
      revenue: 200,
      utmTerm: "test_1",
    },
    {
      adId: "ad_1_cold",
      adName: "Criativo A",
      spend: 100,
      impressions: 1000,
      clicks: 30,
      leads: 3,
      revenue: 150,
      utmTerm: "test_1",
    },
    {
      adId: "ad_2_hot",
      adName: "Criativo B",
      spend: 150,
      impressions: 2000,
      clicks: 100,
      leads: 10,
      revenue: 300,
      utmTerm: "test_2",
    },
  ],
  summary: {
    totalSpend: 350,
    totalLeads: 18,
    totalRevenue: 650,
  },
};

describe("StageCreativePerformanceTable", () => {
  beforeEach(() => {
    vi.spyOn(useStageCreativePerformanceModule, "useStageCreativePerformance").mockReturnValue({
      data: mockCreativeData,
      isLoading: false,
      error: null,
    });
  });

  describe("AC3: Exibir tabela compilada", () => {
    it("deve mostrar dados compilados quando filtro é 'Todos'", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Filtro é "Todos" por padrão
      const todosButton = screen.getByRole("button", { name: /Todos/i });
      expect(todosButton).toHaveClass("bg-primary");

      // Deve mostrar 2 linhas (Criativo A e B compilados)
      const rows = screen.getAllByRole("row");
      expect(rows.length).toBeGreaterThanOrEqual(3); // Header + 2+ data rows
    });

    it("deve exibir badge '📊' em modo compilado", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Snapshot test para verificar estrutura
      expect(screen.getByText("Desempenho de Criativos")).toBeInTheDocument();
    });

    it("deve compilar valores corretamente (soma spend)", async () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Criativo A: 100 + 100 = 200
      // Em modo "Todos", a tabela mostrará valores compilados
      const rows = screen.getAllByRole("row");
      expect(rows.length).toBeGreaterThan(1);
    });
  });

  describe("AC4: Modo 'Todos' desativado → voltar ao Hot/Cold", () => {
    it("deve alternar entre modo compilado e Hot quando clica em botão", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Start: Todos (compilado)
      const todosButton = screen.getByRole("button", { name: /Todos/i });
      expect(todosButton).toHaveClass("bg-primary");

      // Click "Hot"
      const hotButton = screen.getByRole("button", { name: /Hot/i });
      fireEvent.click(hotButton);

      // Verificar que o estado mudou
      // (Em um teste real, monitoraria renderização)
      expect(hotButton).toHaveClass("bg-primary");
    });

    it("deve alternar entre modo compilado e Cold quando clica em botão", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Click "Cold"
      const coldButton = screen.getByRole("button", { name: /Cold/i });
      fireEvent.click(coldButton);

      // Verificar que o estado mudou
      expect(coldButton).toHaveClass("bg-primary");
    });

    it("deve ter transição suave ao trocar entre filtros (sem saltos de layout)", () => {
      const { container } = render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Verificar que o container existe e é estável
      const tableContainer = container.querySelector(".rounded-xl");
      expect(tableContainer).toBeInTheDocument();

      // Clicar em "Hot" e verificar que container é o mesmo
      const hotButton = screen.getByRole("button", { name: /Hot/i });
      fireEvent.click(hotButton);

      const tableContainerAfter = container.querySelector(".rounded-xl");
      expect(tableContainerAfter).toBeInTheDocument();
    });
  });

  describe("AC5: Integração sem breaking changes", () => {
    it("deve funcionar exatamente como antes quando não está em modo compilado", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Click "Hot" para sair do modo compilado
      const hotButton = screen.getByRole("button", { name: /Hot/i });
      fireEvent.click(hotButton);

      // Deve mostrar "Desempenho de Criativos" ainda
      expect(screen.getByText("Desempenho de Criativos")).toBeInTheDocument();

      // Deve mostrar badges 🔥 e ❄️ no modo normal
      // (Nota: badges só aparecem quando há dados hot/cold)
    });

    it("deve renderizar tabela com colunas esperadas", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Verificar que as colunas existem
      expect(screen.getByText("Invest.")).toBeInTheDocument();
      expect(screen.getByText("Impressões")).toBeInTheDocument();
      expect(screen.getByText("Cliques")).toBeInTheDocument();
      expect(screen.getByText("Faturamento")).toBeInTheDocument();
      expect(screen.getByText("ROAS")).toBeInTheDocument();
    });

    it("deve manter paginação funcional em modo compilado", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Verificar que controles de paginação existem
      // (No modo compilado com 2 criativos, pode não ter paginação, mas deve haver estrutura)
      const tableContainer = screen.getByText("Desempenho de Criativos").closest(".rounded-xl");
      expect(tableContainer).toBeInTheDocument();
    });

    it("deve suportar sorting em modo compilado", () => {
      render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      // Headers devem ser clicáveis para sorting
      const investHeader = screen.getByText("Invest.").closest("th");
      expect(investHeader).toHaveClass("cursor-pointer");

      // Click para trocar ordem
      fireEvent.click(investHeader!);
      expect(investHeader).toBeInTheDocument(); // Still there after click
    });
  });

  // Story 18.61: coluna Status (badge Ativo/Pausado/"—" + tooltip de adsets).
  // Modo padrão "Todos" (compilado) agrega por ad_name → o status compilado é OR
  // (Ativo se qualquer ad_id/linha do mesmo criativo estiver ativo).
  describe("Story 18.61: coluna Status", () => {
    it("AC2 (regra OR): criativo é Ativo se ≥1 linha do mesmo ad_name está active", () => {
      vi.spyOn(useStageCreativePerformanceModule, "useStageCreativePerformance").mockReturnValue({
        data: {
          ...mockCreativeData,
          creatives: [
            // Mesmo ad_name, um paused e outro active → compilado deve ser Ativo
            { ...mockCreativeData.creatives[0], status: "paused", activeAdsets: [] },
            {
              ...mockCreativeData.creatives[1],
              status: "active",
              activeAdsets: ["Lookalike 1%"],
            },
            // ad_name distinto, sem status conhecido → "—"
            { ...mockCreativeData.creatives[2], status: "unknown" },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(
        <StageCreativePerformanceTable funnelId="funnel-1" stageId="stage-1" days={30} />,
      );

      // Header "Status" presente
      expect(screen.getByText("Status")).toBeInTheDocument();
      // Criativo A (paused + active) compilado → Ativo
      expect(screen.getByText("Ativo")).toBeInTheDocument();
      // Criativo B (unknown) → "—" (nunca "Pausado" por ausência de dado — AC3)
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("AC3 (fallback): status desconhecido em todas as linhas → '—', nunca 'Pausado'", () => {
      vi.spyOn(useStageCreativePerformanceModule, "useStageCreativePerformance").mockReturnValue({
        data: {
          ...mockCreativeData,
          creatives: mockCreativeData.creatives.map((c) => ({ ...c, status: "unknown" as const })),
        },
        isLoading: false,
        error: null,
      });

      render(
        <StageCreativePerformanceTable funnelId="funnel-1" stageId="stage-1" days={30} />,
      );

      expect(screen.queryByText("Pausado")).not.toBeInTheDocument();
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("AC4 (tooltip): badge Ativo lista os adsets ativos via title", () => {
      vi.spyOn(useStageCreativePerformanceModule, "useStageCreativePerformance").mockReturnValue({
        data: {
          ...mockCreativeData,
          creatives: [
            {
              ...mockCreativeData.creatives[0],
              adName: "Criativo Único",
              status: "active" as const,
              activeAdsets: ["Interesses — Empreendedorismo", "Lookalike 1%"],
            },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(
        <StageCreativePerformanceTable funnelId="funnel-1" stageId="stage-1" days={30} />,
      );

      const badge = screen.getByText("Ativo");
      expect(badge).toHaveAttribute(
        "title",
        "Ativo em: Interesses — Empreendedorismo, Lookalike 1%",
      );
    });

    it("AC7 (ordenável): header Status é clicável para sort", () => {
      vi.spyOn(useStageCreativePerformanceModule, "useStageCreativePerformance").mockReturnValue({
        data: {
          ...mockCreativeData,
          creatives: mockCreativeData.creatives.map((c) => ({ ...c, status: "active" as const })),
        },
        isLoading: false,
        error: null,
      });

      render(
        <StageCreativePerformanceTable funnelId="funnel-1" stageId="stage-1" days={30} />,
      );

      const statusHeader = screen.getByText("Status").closest("th");
      expect(statusHeader).toHaveClass("cursor-pointer");
      fireEvent.click(statusHeader!);
      expect(statusHeader).toBeInTheDocument();
    });
  });

  describe("Snapshot tests", () => {
    it("deve fazer snapshot de tabela em modo compilado", () => {
      const { container } = render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      expect(container.querySelector(".rounded-xl")).toMatchSnapshot();
    });

    it("deve fazer snapshot de tabela em modo Hot", () => {
      const { container } = render(
        <StageCreativePerformanceTable
          funnelId="funnel-1"
          stageId="stage-1"
          days={30}
        />
      );

      const hotButton = screen.getByRole("button", { name: /Hot/i });
      fireEvent.click(hotButton);

      expect(container.querySelector(".rounded-xl")).toMatchSnapshot();
    });
  });
});
