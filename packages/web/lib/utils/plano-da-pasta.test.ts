/**
 * Subir uma pasta inteira.
 *
 * O que protege:
 *
 * 1. O mime resolvido pela EXTENSÃO quando o navegador não sabe. Ele manda
 *    `application/octet-stream` com frequência para arquivo vindo do disco, e
 *    sem isso uma pasta inteira de `.png` seria recusada.
 * 2. Subpasta vira coleção filha — achatar perderia a arrumação que a pessoa
 *    já tinha feito.
 * 3. Coleção só existe se tiver arquivo dentro.
 * 4. As coleções saem das rasas para as fundas: a filha precisa da mãe criada.
 */

import { describe, expect, it } from "vitest";
import {
  mimeDoArquivo,
  planejarPasta,
  resumoPorTipo,
  type ArquivoDaPasta,
} from "./plano-da-pasta";

const arq = (caminho: string, over: Partial<ArquivoDaPasta> = {}): ArquivoDaPasta => ({
  caminho,
  nome: caminho.split("/").pop()!,
  mime: "",
  tamanho: 1000,
  ...over,
});

describe("mimeDoArquivo", () => {
  it("usa o que o navegador disse quando ele sabe", () => {
    expect(mimeDoArquivo("a.png", "image/png")).toBe("image/png");
  });

  it("tolera o `; charset=` que vem no HTML", () => {
    expect(mimeDoArquivo("p.html", "text/html; charset=utf-8")).toBe("text/html");
  });

  it("cai na EXTENSÃO quando o navegador não sabe — o caso comum do disco", () => {
    expect(mimeDoArquivo("peca.png", "application/octet-stream")).toBe("image/png");
    expect(mimeDoArquivo("vsl.MP4", "")).toBe("video/mp4");
    expect(mimeDoArquivo("briefing.PDF", "")).toBe("application/pdf");
  });

  it("recusa o que o Swipe Files não sabe mostrar", () => {
    expect(mimeDoArquivo("arte.psd", "")).toBeNull();
    expect(mimeDoArquivo("pack.zip", "application/zip")).toBeNull();
    expect(mimeDoArquivo("sem-extensao", "")).toBeNull();
  });
});

describe("planejarPasta", () => {
  const pasta = [
    arq("Black Friday 2026/capa.png"),
    arq("Black Friday 2026/anuncios/peca-01.png"),
    arq("Black Friday 2026/anuncios/peca-02.jpg"),
    arq("Black Friday 2026/paginas/lp.html"),
    arq("Black Friday 2026/paginas/antigas/lp-2025.html"),
  ];

  it("a pasta escolhida é a raiz", () => {
    expect(planejarPasta(pasta).raiz).toBe("Black Friday 2026");
  });

  it("cada nível de pasta vira uma coleção", () => {
    const caminhos = planejarPasta(pasta).colecoes.map((c) => c.caminho.join("/"));
    expect(caminhos).toContain("Black Friday 2026");
    expect(caminhos).toContain("Black Friday 2026/anuncios");
    expect(caminhos).toContain("Black Friday 2026/paginas");
    expect(caminhos).toContain("Black Friday 2026/paginas/antigas");
  });

  it("das RASAS para as fundas — a filha precisa da mãe já criada", () => {
    const niveis = planejarPasta(pasta).colecoes.map((c) => c.caminho.length);
    expect(niveis).toEqual([...niveis].sort((a, b) => a - b));
  });

  it("o nome da coleção é o da própria pasta, não o caminho inteiro", () => {
    const c = planejarPasta(pasta).colecoes.find(
      (x) => x.caminho.join("/") === "Black Friday 2026/paginas/antigas",
    );
    expect(c?.nome).toBe("antigas");
  });

  it("pasta sem arquivo não vira coleção", () => {
    // "vazia" aparece no caminho de nenhum arquivo, então não existe aqui.
    const plano = planejarPasta([arq("Raiz/cheia/a.png")]);
    expect(plano.colecoes.map((c) => c.nome)).toEqual(["Raiz", "cheia"]);
  });

  it("cada arquivo aponta para a coleção da SUA pasta", () => {
    const plano = planejarPasta(pasta);
    const lp = plano.itens.find((i) => i.nome === "lp-2025.html");
    expect(lp?.colecao).toEqual(["Black Friday 2026", "paginas", "antigas"]);
  });

  it("sem coleção, tudo cai solto e nenhuma pasta é criada", () => {
    const plano = planejarPasta(pasta, false);
    expect(plano.colecoes).toEqual([]);
    expect(plano.itens.every((i) => i.colecao.length === 0)).toBe(true);
    // Mas os arquivos sobem igual — é o "subir em lote".
    expect(plano.itens).toHaveLength(5);
  });

  it("o formato não suportado é CONTADO, não sumido", () => {
    const plano = planejarPasta([arq("R/a.png"), arq("R/arte.psd"), arq("R/pack.zip")]);
    expect(plano.itens).toHaveLength(1);
    expect(plano.ignorados.map((i) => i.nome)).toEqual(["arte.psd", "pack.zip"]);
    expect(plano.ignorados[0]!.motivo).toBe("formato não suportado");
  });

  it("arquivo vazio entra no relatório", () => {
    const plano = planejarPasta([arq("R/vazio.png", { tamanho: 0 })]);
    expect(plano.itens).toHaveLength(0);
    expect(plano.ignorados[0]!.motivo).toBe("arquivo vazio");
  });

  it("lixo do sistema não entra nem no relatório — ninguém tentou subir isso", () => {
    const plano = planejarPasta([
      arq("R/.DS_Store"),
      arq("R/Thumbs.db"),
      arq("R/desktop.ini"),
      arq("R/a.png"),
    ]);
    expect(plano.itens).toHaveLength(1);
    expect(plano.ignorados).toHaveLength(0);
  });

  it("soma os bytes só do que vai subir", () => {
    const plano = planejarPasta([
      arq("R/a.png", { tamanho: 100 }),
      arq("R/b.psd", { tamanho: 9999 }),
    ]);
    expect(plano.bytes).toBe(100);
  });

  it("aceita a barra do Windows no caminho", () => {
    const plano = planejarPasta([arq("Raiz\\sub\\a.png", { nome: "a.png" })]);
    expect(plano.itens[0]!.colecao).toEqual(["Raiz", "sub"]);
  });

  it("pasta vazia de verdade não quebra", () => {
    expect(planejarPasta([])).toMatchObject({ raiz: null, colecoes: [], itens: [] });
  });
});

describe("resumoPorTipo", () => {
  it("agrupa por tipo, do mais numeroso ao menos", () => {
    const plano = planejarPasta([
      arq("R/a.png"),
      arq("R/b.png"),
      arq("R/c.mp4"),
      arq("R/d.pdf"),
    ]);
    expect(resumoPorTipo(plano.itens)).toEqual([
      { tipo: "imagem", n: 2 },
      { tipo: "PDF", n: 1 },
      { tipo: "vídeo", n: 1 },
    ]);
  });
});

/**
 * A pasta real que motivou o suporte a documento.
 *
 * `SwipeOffers` tem 127 arquivos: 60 vídeos em `Ads`, 60 transcrições `.docx`
 * em `Transcrição`, mais imagens. Antes, os 61 `.docx` eram recusados — e com
 * eles ia embora a pasta `Transcrição` inteira, porque coleção sem arquivo não
 * é criada. Justamente o texto que descreve os vídeos.
 */
describe("a pasta SwipeOffers", () => {
  const pasta = [
    ...Array.from({ length: 60 }, (_, i) => arq(`SwipeOffers/Ads/ativo ${i}.mp4`)),
    ...Array.from({ length: 60 }, (_, i) => arq(`SwipeOffers/Transcrição/ativo ${i}.docx`)),
    arq("SwipeOffers/VSL/Gabriel Navarro - VSL 1.docx"),
    arq("SwipeOffers/VSL/vsl.mp4"),
    arq("SwipeOffers/Checkout/checkout.png"),
    ...Array.from({ length: 5 }, (_, i) => arq(`SwipeOffers/Ads/print-${i}.jpg`)),
  ];

  it("nenhum arquivo fica de fora", () => {
    const plano = planejarPasta(pasta);
    expect(plano.ignorados).toHaveLength(0);
    expect(plano.itens).toHaveLength(pasta.length);
  });

  it("a pasta Transcrição vira coleção — antes sumia junto com os .docx", () => {
    const nomes = planejarPasta(pasta).colecoes.map((c) => c.nome);
    expect(nomes).toContain("Transcrição");
    expect(nomes).toEqual(["SwipeOffers", "Ads", "Checkout", "Transcrição", "VSL"]);
  });

  it("o .docx é reconhecido mesmo com o mime vazio do navegador", () => {
    const plano = planejarPasta([arq("R/transcricao.docx", { mime: "" })]);
    expect(plano.itens[0]!.mimeFinal).toContain("wordprocessingml");
  });

  it("o resumo separa documento de vídeo", () => {
    const r = resumoPorTipo(planejarPasta(pasta).itens);
    expect(r.find((t) => t.tipo === "documento")?.n).toBe(61);
    expect(r.find((t) => t.tipo === "vídeo")?.n).toBe(61);
  });
});
