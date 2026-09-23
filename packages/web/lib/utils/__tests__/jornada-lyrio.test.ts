/**
 * Story 42.11 — a tabela "Jornada por canal" da etapa Lyrio.
 *
 * As funções puras (estado do bloco, taxas, declarações) e o FIO até a tela:
 * os `.tsx` de `components/funnels` não são coletados (`environment: node`,
 * sem jsdom), então as ligações são provadas lendo o fonte — padrão de
 * `lib/swipe/__tests__/pdf-capa-efeito.test.ts`. Lição do gate de 23/09:
 * cortar a ligação no componente tem que derrubar teste.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  declaracoesDaJornada,
  estadoDoBlocoDaJornada,
  formatarTaxa,
  taxaDaJornada,
  tentarDeNovoAJornada,
  type JornadaDoLyrio,
} from "../jornada-lyrio";

const zerada = { novos: 0, viuPaywall: 0, interagiu: 0, iniciou: 0, iniciouTeste: 0, pagou: 0, receitaUsd: 0 };
const dados: JornadaDoLyrio = { days: 90, desde: "2026-06-25", assinaturaDesde: "2026-08-10", linhas: [], total: zerada };
const erroHttp = (status: number, message: string) => Object.assign(new Error(message), { status });

describe("estadoDoBlocoDaJornada — 404 × erro (AC6, PO-07)", () => {
  it("404 da ROTA (API anterior à 42.11, corpo \"Not Found\") → o bloco some", () => {
    expect(estadoDoBlocoDaJornada({ isLoading: false, error: erroHttp(404, "Not Found"), data: undefined })).toEqual({ tipo: "oculto" });
  });
  it("404 de DOMÍNIO, 5xx e rede → erro no bloco (nunca tabela vazia nem zeros)", () => {
    expect(estadoDoBlocoDaJornada({ isLoading: false, error: erroHttp(404, "Etapa não encontrada"), data: undefined })).toEqual({ tipo: "erro", mensagem: "Etapa não encontrada" });
    expect(estadoDoBlocoDaJornada({ isLoading: false, error: erroHttp(500, "Internal Server Error"), data: undefined })).toMatchObject({ tipo: "erro" });
    expect(estadoDoBlocoDaJornada({ isLoading: false, error: new TypeError("Failed to fetch"), data: undefined })).toEqual({ tipo: "erro", mensagem: "Failed to fetch" });
    // erro com dado antigo em cache continua sendo erro — não mostra números velhos como se fossem os da janela
    expect(estadoDoBlocoDaJornada({ isLoading: false, error: erroHttp(502, "Bad Gateway"), data: dados }).tipo).toBe("erro");
  });
  it("carregando e pronto", () => {
    expect(estadoDoBlocoDaJornada({ isLoading: true, error: null, data: undefined })).toEqual({ tipo: "carregando" });
    expect(estadoDoBlocoDaJornada({ isLoading: false, error: null, data: dados })).toEqual({ tipo: "pronto", dados });
  });
  it("retry desligado para 404; outras falhas tentam até 2 vezes", () => {
    expect(tentarDeNovoAJornada(0, erroHttp(404, "Not Found"))).toBe(false);
    expect(tentarDeNovoAJornada(0, erroHttp(500, "x"))).toBe(true);
    expect(tentarDeNovoAJornada(2, erroHttp(500, "x"))).toBe(false);
  });
});

describe("taxas e declarações (AC1, AC4)", () => {
  it("taxa contra Novos; denominador 0 = —", () => {
    expect(taxaDaJornada(231, 2368)).toBeCloseTo(0.09755, 4);
    expect(formatarTaxa(taxaDaJornada(231, 2368))).toBe("9,8%");
    expect(taxaDaJornada(0, 0)).toBeNull();
    expect(formatarTaxa(taxaDaJornada(0, 0))).toBe("—");
    expect(formatarTaxa(taxaDaJornada(0, 12))).toBe("0,0%");
  });
  it("AC4: (a) data do primeiro evento de assinatura VINDA DA API; (b) últimos 7 dias; (c) campanha não identificável — sem referência interna na tela", () => {
    const d = declaracoesDaJornada(dados);
    expect(d).toHaveLength(3);
    expect(d[0]).toBe("Eventos de assinatura só existem desde 10/08/2026 — esta janela começa antes disso, então a jornada está incompleta.");
    expect(d[1]).toMatch(/últimos 7 dias.*teste grátis dura 7 dias/);
    expect(d[2]).toMatch(/Campanha individual ainda não é identificável/);
    expect(d.join(" ")).not.toMatch(/3\.1|42\.x/);
    expect(declaracoesDaJornada({ assinaturaDesde: "2026-08-10", desde: "2026-09-01" })[0]).toMatch(/janela que começa antes disso mostra a jornada incompleta/);
    expect(declaracoesDaJornada({ assinaturaDesde: null, desde: "2026-09-01" })[0]).toMatch(/Ainda não há eventos de assinatura/);
    // a data vem do dado — outra etapa, outra data (uma data fixa no código seria pega aqui)
    expect(declaracoesDaJornada({ assinaturaDesde: "2026-11-03", desde: "2026-09-01" })[0]).toMatch(/desde 03\/11\/2026 — esta janela começa antes disso/);
  });
});

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

describe("o fio até a tela", () => {
  const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
  const bloco = ler("../../../components/funnels/lyrio-jornada-por-canal.tsx");
  const hooks = ler("../../hooks/use-revenuecat.ts");

  it("a etapa Lyrio monta o bloco com o `days` do cabeçalho e FORA da condição do Detalhamento", () => {
    expect(etapa).toMatch(/<LyrioJornadaPorCanal projectId=\{projectId\} funnelId=\{funnelId\} stageId=\{stage\.id\} days=\{days\} \/>/);
    const detalhe = etapa.indexOf("<LyrioDetailTable");
    const fechaCondicao = etapa.indexOf(")}", detalhe);
    const jornada = etapa.indexOf("<LyrioJornadaPorCanal");
    expect(detalhe).toBeGreaterThan(0);
    expect(jornada).toBeGreaterThan(fechaCondicao);
    // FORA de condição: entre o `)}` do Detalhamento e o bloco só há comentário JSX; e a tag fecha sozinha na linha
    const entre = etapa.slice(fechaCondicao + 2, jornada).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(entre.trim()).toBe("");
    expect(etapa.slice(jornada, etapa.indexOf("\n", jornada))).toMatch(/\/>$/);
    // uma vez só
    expect(etapa.split("<LyrioJornadaPorCanal").length - 1).toBe(1);
    // e antes do bloco RevenueCat (logo depois do Detalhamento)
    expect(jornada).toBeLessThan(etapa.indexOf("<RevenuecatOverviewPanel"));
  });
  it("o bloco decide por estadoDoBlocoDaJornada: some no 404 da rota, mostra erro no resto", () => {
    expect(bloco).toMatch(/const estado = estadoDoBlocoDaJornada\(\{ isLoading: q\.isLoading, error: q\.error, data: q\.data \}\)/);
    expect(bloco).toMatch(/if \(estado\.tipo === "oculto"\) return null;/);
    expect(bloco).toMatch(/estado\.tipo === "erro" \? \(\s*<p role="alert"/);
    expect(bloco).toMatch(/declaracoesDaJornada\(estado\.dados\)/);
    expect(bloco).toMatch(/useRevenuecatJornada\(projectId, funnelId, stageId, days\)/);
  });
  it("o hook chama a rota com days e sem retry no 404", () => {
    expect(hooks).toMatch(/\/stages\/\$\{stageId\}\/revenuecat\/jornada\?days=\$\{days\}/);
    expect(hooks).toMatch(/queryKey: \["revenuecat-jornada", stageId, days\]/);
    expect(hooks).toMatch(/retry: tentarDeNovoAJornada/);
  });
});
