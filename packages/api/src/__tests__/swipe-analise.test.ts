/**
 * A catalogação assistida de referências.
 *
 * O que estes testes protegem é o **campo em branco**: uma marca errada é pior
 * que marca vazia, porque a busca por ela devolve o anúncio errado e ninguém
 * confere um campo que já veio preenchido.
 */

import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  ErroDeAnalise,
  FORMATOS,
  PLATAFORMAS,
  analisarLink,
  analisarReferencia,
  motivoLegivel,
  podeAnalisar,
} from "../services/swipe-analise.js";

const IMAGEM = { buffer: Buffer.from("fake"), mimeType: "image/png" };

/**
 * Um cliente de mentira no formato de STREAM.
 *
 * A chamada real usa `messages.stream(...).finalMessage()` — sem isso, uma
 * análise de 40 segundos é cortada pelo proxy no meio.
 */
function clienteQueResponde(input: Record<string, unknown>) {
  const create = vi.fn((_p: Anthropic.MessageCreateParamsNonStreaming) => ({
    finalMessage: async () =>
      ({
        content: [{ type: "tool_use", name: "catalogar_referencia", id: "t", input }],
      }) as unknown as Anthropic.Message,
  }));
  return { cliente: { messages: { stream: create } }, create };
}

describe("o que dá para analisar", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"])(
    "%s sim",
    (m) => expect(podeAnalisar(m)).toBe(true),
  );

  it("vídeo NÃO — o modelo não recebe vídeo", () => {
    // Extrair um frame exigiria ffmpeg para adivinhar a partir de uma imagem
    // que pode ser a tela preta do primeiro quadro.
    expect(podeAnalisar("video/mp4")).toBe(false);
    expect(podeAnalisar("video/quicktime")).toBe(false);
  });

  it("tipo ausente é não", () => {
    expect(podeAnalisar(null)).toBe(false);
    expect(podeAnalisar(undefined)).toBe(false);
  });

  it("vídeo é recusado antes de chamar a IA", async () => {
    const { cliente, create } = clienteQueResponde({});
    await expect(
      analisarReferencia(cliente, { buffer: Buffer.from("x"), mimeType: "video/mp4" }),
    ).rejects.toThrow(ErroDeAnalise);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("campo que não se sabe fica VAZIO", () => {
  it("string vazia vira null", async () => {
    const { cliente } = clienteQueResponde({ titulo: "", marca: "   ", tags: [] });
    const r = await analisarReferencia(cliente, IMAGEM);
    expect(r.titulo).toBeNull();
    expect(r.marca).toBeNull();
  });

  it("o modelo dizendo 'não sei' também vira null", async () => {
    // Ele às vezes preenche em vez de deixar vazio; a frase não pode virar
    // o nome de uma marca na busca.
    for (const dito of ["não sei", "N/A", "desconhecido", "indefinida"]) {
      const { cliente } = clienteQueResponde({ marca: dito, tags: [] });
      const r = await analisarReferencia(cliente, IMAGEM);
      expect(r.marca, `"${dito}" devia virar null`).toBeNull();
    }
  });

  it("resposta sem ferramenta devolve tudo vazio, não quebra", async () => {
    const create = vi.fn(() => ({
      finalMessage: async () => ({ content: [{ type: "text", text: "sei lá" }] }) as never,
    }));
    const r = await analisarReferencia({ messages: { stream: create } }, IMAGEM);
    expect(r).toEqual({
      titulo: null,
      anotacoes: null,
      marca: null,
      nicho: null,
      plataforma: null,
      formato: null,
      tags: [],
    });
  });
});

describe("vocabulário fechado", () => {
  it("plataforma fora da lista é DESCARTADA, não normalizada", async () => {
    // "Instagram Reels" ao lado de "Reel" quebraria o filtro por facetas, que é
    // o que faz a biblioteca funcionar.
    const { cliente } = clienteQueResponde({ plataforma: "Instagram Reels", tags: [] });
    const r = await analisarReferencia(cliente, IMAGEM);
    expect(r.plataforma).toBeNull();
  });

  it("caixa diferente é aceita — o modelo devolve 'meta' por 'Meta'", async () => {
    const { cliente } = clienteQueResponde({ plataforma: "meta", formato: "reel", tags: [] });
    const r = await analisarReferencia(cliente, IMAGEM);
    expect(r.plataforma).toBe("Meta");
    expect(r.formato).toBe("Reel");
  });

  it("todos os valores da lista passam", async () => {
    for (const p of PLATAFORMAS) {
      const { cliente } = clienteQueResponde({ plataforma: p, tags: [] });
      expect((await analisarReferencia(cliente, IMAGEM)).plataforma).toBe(p);
    }
    for (const f of FORMATOS) {
      const { cliente } = clienteQueResponde({ formato: f, tags: [] });
      expect((await analisarReferencia(cliente, IMAGEM)).formato).toBe(f);
    }
  });
});

describe("tags viram slug", () => {
  it("acento, espaço e maiúscula somem", async () => {
    const { cliente } = clienteQueResponde({ tags: ["Prova Social", "AÇÃO Rápida"] });
    const r = await analisarReferencia(cliente, IMAGEM);
    expect(r.tags).toEqual(["prova-social", "acao-rapida"]);
  });

  it("repetidas entram uma vez só", async () => {
    const { cliente } = clienteQueResponde({ tags: ["escassez", "Escassez", "ESCASSEZ"] });
    expect((await analisarReferencia(cliente, IMAGEM)).tags).toEqual(["escassez"]);
  });

  it("no máximo seis", async () => {
    const { cliente } = clienteQueResponde({
      tags: ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"],
    });
    expect((await analisarReferencia(cliente, IMAGEM)).tags).toHaveLength(6);
  });

  it("tag que vira vazia ao limpar é descartada", async () => {
    const { cliente } = clienteQueResponde({ tags: ["!!!", "---", "ok"] });
    expect((await analisarReferencia(cliente, IMAGEM)).tags).toEqual(["ok"]);
  });
});

describe("falha diz quem resolve", () => {
  it("sem saldo manda preencher à mão", () => {
    expect(motivoLegivel({ message: "credit balance is too low" })).toMatch(/sem saldo/i);
    expect(motivoLegivel({ message: "credit balance is too low" })).toMatch(/à mão/i);
  });

  it("chave recusada aponta o servidor", () => {
    expect(motivoLegivel({ status: 401 })).toMatch(/chave/i);
  });

  it("erro desconhecido diz que nada se perdeu", () => {
    // A pessoa acabou de escolher o arquivo: o pior seria achar que perdeu.
    expect(motivoLegivel({})).toMatch(/nada se perdeu/i);
  });

  it("a falha da API vira ErroDeAnalise com a frase legível", async () => {
    const create = vi.fn(() => ({
      finalMessage: async () => {
        throw Object.assign(new Error("credit balance is too low"), { status: 400 });
      },
    }));
    await expect(analisarReferencia({ messages: { stream: create } }, IMAGEM)).rejects.toThrow(
      /sem saldo/i,
    );
  });
});

describe("o contexto entra no pedido", () => {
  it("nome do arquivo e origem vão para o modelo", async () => {
    // Uma landing page em PDF diz muito mais quando se sabe o domínio.
    const { cliente, create } = clienteQueResponde({ tags: [] });
    await analisarReferencia(cliente, IMAGEM, {
      nomeDoArquivo: "anuncio-black.png",
      origem: "https://facebook.com/ads/library/123",
    });
    const msg = JSON.stringify(create.mock.calls[0]![0].messages);
    expect(msg).toContain("anuncio-black.png");
    expect(msg).toContain("facebook.com");
  });

  it("PDF vai como document, imagem vai como image", async () => {
    const { cliente, create } = clienteQueResponde({ tags: [] });
    await analisarReferencia(cliente, { buffer: Buffer.from("x"), mimeType: "application/pdf" });
    const conteudo = create.mock.calls[0]![0].messages[0]!.content as { type: string }[];
    expect(conteudo[0]!.type).toBe("document");

    const outro = clienteQueResponde({ tags: [] });
    await analisarReferencia(outro.cliente, IMAGEM);
    const c2 = outro.create.mock.calls[0]![0].messages[0]!.content as { type: string }[];
    expect(c2[0]!.type).toBe("image");
  });
});

describe("analisarLink — catalogar sem ver a peça", () => {
  it("manda endereço, Open Graph e a anotação de quem salvou", async () => {
    // A anotação é a única fonte que diz POR QUE aquilo foi salvo — some dela
    // e a catalogação vira descrição de site.
    const { cliente, create } = clienteQueResponde({
      marca: "Human Academy",
      nicho: "educação",
      formato: "Landing page",
      tags: ["escassez", "workshop"],
    });

    const s = await analisarLink(cliente, {
      url: "https://agent.humanacademy.ai/",
      titulo: "Agent Lab Build",
      descricao: "Workshop de 2 dias",
      siteName: "Human Academy",
      notas: "Coisa fina, hein...",
    });

    expect(s.marca).toBe("Human Academy");
    expect(s.formato).toBe("Landing page");

    const enviado = JSON.stringify(create.mock.calls[0]?.[0]);
    expect(enviado).toContain("agent.humanacademy.ai");
    expect(enviado).toContain("Agent Lab Build");
    expect(enviado).toContain("Coisa fina");
  });

  it("avisa o modelo de que ele NÃO está vendo a peça", async () => {
    // Sem esse aviso, "formato: Reel" a partir de uma URL é chute — e chute
    // preenchido é pior que campo vazio, porque a faceta passa a mentir.
    const { cliente, create } = clienteQueResponde({ tags: [] });
    await analisarLink(cliente, { url: "https://exemplo.com/x" });

    const sistema = String(create.mock.calls[0]?.[0]?.system ?? "");
    expect(sistema).toMatch(/NÃO ESTÁ VENDO A PEÇA/i);
  });

  it("inclui a imagem do preview quando ela existe", async () => {
    const { cliente, create } = clienteQueResponde({ tags: [] });
    await analisarLink(
      cliente,
      { url: "https://exemplo.com/lp" },
      { buffer: Buffer.from("fake"), mimeType: "image/png" },
    );

    const msg = create.mock.calls[0]?.[0]?.messages?.[0];
    const tipos = (msg?.content as { type: string }[]).map((c) => c.type);
    expect(tipos).toContain("image");
    // E diz o que a imagem É: o preview é escolhido pelo site, não pelo
    // anunciante, e lê-lo como "o criativo" produz anotação errada.
    expect(JSON.stringify(msg)).toContain("preview que a própria página publica");
  });

  it("descarta plataforma fora do vocabulário fechado", async () => {
    // O modelo sem imagem tende a inventar ("Instagram Reels"). Fora da lista,
    // o valor é DESCARTADO — duas facetas para a mesma coisa quebram o filtro.
    const { cliente } = clienteQueResponde({ plataforma: "Instagram Reels", tags: [] });
    const s = await analisarLink(cliente, { url: "https://instagram.com/p/x" });
    expect(s.plataforma).toBeNull();
    expect(PLATAFORMAS).not.toContain("Instagram Reels");
  });

  it("ignora imagem de tipo que o modelo não enxerga", async () => {
    const { cliente, create } = clienteQueResponde({ tags: [] });
    await analisarLink(
      cliente,
      { url: "https://exemplo.com/x" },
      { buffer: Buffer.from("fake"), mimeType: "image/svg+xml" },
    );
    const msg = create.mock.calls[0]?.[0]?.messages?.[0];
    const tipos = (msg?.content as { type: string }[]).map((c) => c.type);
    expect(tipos).not.toContain("image");
  });
});
