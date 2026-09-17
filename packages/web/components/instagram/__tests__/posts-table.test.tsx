// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { PostsTable } from "../posts-table";

/**
 * Clique na linha, modal e botão de análise só existem em execução — tsc e
 * lint não veem nenhum dos três.
 */

const gerar = vi.fn();
const salvarSeguidores = vi.fn();

vi.mock("@/lib/hooks/use-organic-posts", () => ({
  useOrganicPostLinks: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/use-instagram", () => ({
  useSalvarSeguidoresDoPost: () => ({ mutate: salvarSeguidores, isPending: false }),
  useAnaliseDoPost: () => ({ data: { analise: null, geradoEm: null }, isLoading: false }),
  useGerarAnaliseDoPost: () => ({ mutate: gerar, isPending: false }),
}));

const post = (x: Partial<InstagramMedia>): InstagramMedia => ({
  id: "17900000000000001",
  media_type: "VIDEO",
  media_product_type: "REELS",
  timestamp: "2026-08-12T12:00:00+0000",
  caption: "Pare de fazer isso com seu filho",
  reach: 100_000,
  views: 200_000,
  like_count: 8_000,
  comments_count: 400,
  shares: 5_000,
  saved: 1_000,
  engagement_rate: 14.4,
  skip_rate: 30,
  ...x,
});

const posts = [
  post({}),
  post({ id: "17900000000000002", timestamp: "2026-09-05T12:00:00+0000", caption: "Post de setembro" }),
];

const montar = () =>
  render(
    <TooltipProvider>
      <PostsTable data={posts} isLoading={false} accountId="conta-1" />
    </TooltipProvider>,
  );

describe("PostsTable", () => {
  it("clicar numa linha abre o post, com as métricas e o botão de análise", () => {
    montar();
    fireEvent.click(screen.getByText("Pare de fazer isso com seu filho"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gerar análise de IA/ })).toBeTruthy();
    // O formato e a data no título do modal.
    expect(screen.getByText(/Reels de 12\/08\/2026/)).toBeTruthy();
  });

  it("o botão dispara a geração", () => {
    montar();
    fireEvent.click(screen.getByText("Pare de fazer isso com seu filho"));
    fireEvent.click(screen.getByRole("button", { name: /Gerar análise de IA/ }));
    expect(gerar).toHaveBeenCalled();
  });

  it("escolher o mês filtra os posts da tabela", () => {
    montar();
    // Os dois posts aparecem quando não há recorte.
    expect(screen.getByText("Post de setembro")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Mês dos posts" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: /Agosto\/26/ }));
    expect(screen.queryByText("Post de setembro")).toBeNull();
    expect(screen.getByText("Pare de fazer isso com seu filho")).toBeTruthy();
  });

  it("mexer nos seguidores do Reels não abre o modal", () => {
    // A célula é editável; abrir o post junto atrapalharia a digitação.
    montar();
    const celula = screen.getAllByTitle(/painel do Instagram/)[0]!;
    fireEvent.click(celula);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
