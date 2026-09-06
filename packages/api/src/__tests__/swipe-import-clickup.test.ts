/**
 * As fixtures aqui são mensagens REAIS do canal `referências-geral`, copiadas
 * como vieram da API v3 — com os escapes, os cartões de preview e as URLs
 * truncadas que o ClickUp produz. Cada uma cobre um jeito de o parsing errar
 * que só apareceu ao rodar contra o canal de verdade.
 */

import { describe, expect, it } from "vitest";
import {
  ehAvisoDoProprioSwipe,
  ehRuido,
  extensaoDe,
  limparTexto,
  nomeDoAnexo,
  nomeEhGenerico,
  planejarImportacao,
  planejarMensagem,
  type MensagemDoClickUp,
  ehRotuloDeFatia,
} from "../services/swipe-import-clickup.js";

const msg = (content: string, extra: Partial<MensagemDoClickUp> = {}): MensagemDoClickUp => ({
  id: "1",
  content,
  date: 1_700_000_000_000,
  user_id: "3202800",
  ...extra,
});

describe("limparTexto", () => {
  it("não deixa passar o token que vinha numa URL truncada", () => {
    // Real: o ClickUp encurta o link com `\[…\]` e a segunda metade sobrava
    // solta no texto. Aqui ela carregava um `mcp_token` inteiro.
    const bruto =
      "Melhores criativos de Black do Ferrari\n" +
      "[https://drive.google.com/drive/folders/1zhz?mcp\\_token=ey\\[…\\]6MTc2NDAwMzY2OH0.Fnjue9bKYJBVwjfJV72-7sOh3qlqT2ipv67XtPpXto4]" +
      "(https://drive.google.com/drive/folders/1zhz?mcp_token=eyJwaWQi6MTc2NDAwMzY2OH0.Fnjue9bK)";

    const limpo = limparTexto(bruto);
    expect(limpo).toBe("Melhores criativos de Black do Ferrari");
    expect(limpo).not.toMatch(/mcp_token|Fnjue9bK|eyJwaWQi/);
  });

  it("guarda a frase e descarta o cartão de preview inteiro", () => {
    const bruto =
      "Página linda:\n\n[\n\nreservatoriodedopamina.com.br\n\n" +
      "https://reservatoriodedopamina.com.br/pvt-v3?utm\\_source=facebook-ads\n\n" +
      "](https://reservatoriodedopamina.com.br/pvt-v3?utm_source=facebook-ads)\n\nDá pra modelar pro Pacheco.";

    expect(limparTexto(bruto)).toBe("Página linda:\nDá pra modelar pro Pacheco.");
  });

  it("mantém o nome de quem foi mencionado e joga fora o id", () => {
    const bruto =
      "[@Pedro Freitas](#user_mention#87953500) [@Thyago Freitas](#user_mention#3202800) " +
      "começar a fazer uma section assim nas páginas do DG.";

    const limpo = limparTexto(bruto);
    expect(limpo).toContain("@Pedro Freitas");
    expect(limpo).toContain("@Thyago Freitas");
    expect(limpo).not.toMatch(/user_mention|87953500/);
  });

  it("descarta o rótulo que é só o nome do anexo, que já é o título do card", () => {
    const bruto =
      "[Black Friday \\_ Finclass.html](https://t9013556102.p.clickup-attachments.com/t9/a/Black.html)\n" +
      "Parte 1/5";

    expect(limparTexto(bruto)).toBe("Parte 1/5");
  });

  it("tira a ênfase do markdown sem comer a frase", () => {
    expect(limparTexto("**Thread** / Insights Live | _Willian Baldan_ 👇🏻")).toBe(
      "Thread / Insights Live | Willian Baldan 👇🏻",
    );
  });
});

describe("nomes de anexo", () => {
  it("recupera a extensão mesmo com parêntese escapado na URL", () => {
    // `foto (1).jpg` vira `%20\(1\).jpg`. Parar no `)` perdia o `.jpg`, e a
    // imagem era classificada como link.
    const url =
      "https://t9013556102.p.clickup-attachments.com/t9/cf6/242767180_n%20(1).jpg";
    expect(extensaoDe(nomeDoAnexo(url))).toBe("jpg");
  });

  it("decodifica o nome com espaço", () => {
    expect(nomeDoAnexo("https://t9.p.clickup-attachments.com/a/CleanShot%202026.png")).toBe(
      "CleanShot 2026.png",
    );
  });

  it("reconhece os nomes que não identificam nada", () => {
    for (const n of [
      "image.png",
      "File.jpg",
      "CleanShot 2026-08-04 at 17.34.56@2x.png",
      "Screenshot_20260410_172451_Instagram.jpg",
      "b862cacd-cb8b-4292-b0e4-1d83ad14b830.pdf",
      "screencapture-kodland-org-br-2026-07-31.png",
    ]) {
      expect(nomeEhGenerico(n), n).toBe(true);
    }
  });

  it("aceita como título o nome que descreve a página", () => {
    for (const n of [
      "Black Friday _ Finclass.html",
      "PLAYBOOK Black friday 2025.pdf",
      "Imersão Executiva no Vale do Silício _ Academia Lendária.html",
    ]) {
      expect(nomeEhGenerico(n), n).toBe(false);
    }
  });
});

describe("planejarMensagem", () => {
  const anexo = (nome: string) => `https://t9013556102.p.clickup-attachments.com/t9/abc/${nome}`;

  it("o link vira a ORIGEM do print, não um card separado", () => {
    // Metade do canal é "olha essa página" + o print dela. Dois cards para a
    // mesma coisa é o que esta regra evita.
    const itens = planejarMensagem(
      msg(
        `Olha essa section\n![print.png](${anexo("print.png")})\n` +
          "[\n\nvendatodosantodia.com.br\n\nhttps://vendatodosantodia.com.br/x\n\n](https://vendatodosantodia.com.br/x)",
      ),
    );

    expect(itens).toHaveLength(1);
    expect(itens[0]!.kind).toBe("image");
    expect(itens[0]!.origem).toBe("https://vendatodosantodia.com.br/x");
  });

  it("sem anexo, o link vira card próprio", () => {
    const itens = planejarMensagem(msg("Que página linda: https://atlas.overlens.com.br/"));
    expect(itens).toHaveLength(1);
    expect(itens[0]!.kind).toBe("link");
    expect(itens[0]!.anexo).toBeNull();
    expect(itens[0]!.origem).toBe("https://atlas.overlens.com.br/");
  });

  it("classifica por extensão e só manda ao bucket o que ele aceita", () => {
    const itens = planejarMensagem(
      msg(
        `[a.png](${anexo("a.png")}) [b.mp4](${anexo("b.mp4")}) ` +
          `[c.pdf](${anexo("c.pdf")}) [d.html](${anexo("d.html")})`,
      ),
    );

    const porKind = Object.fromEntries(itens.map((i) => [i.kind, i]));
    expect(porKind.image!.anexo?.mime).toBe("image/png");
    expect(porKind.video!.anexo?.mime).toBe("video/mp4");
    expect(porKind.pdf!.anexo?.mime).toBe("application/pdf");
    // HTML não sobe: entra como link para o anexo, que é público e não expira.
    expect(porKind.link!.anexo).toBeNull();
    expect(porKind.link!.origem).toBe(anexo("d.html"));
  });

  it("o nome descritivo vence a frase da mensagem", () => {
    // A pessoa escreveu "Parte 1/5"; o arquivo diz de que página se trata.
    const itens = planejarMensagem(
      msg(`Parte 1/5\n[Black Friday \\_ Finclass.html](${anexo("Black%20Friday%20_%20Finclass.html")})`),
    );
    expect(itens[0]!.titulo).toBe("Black Friday _ Finclass");
    expect(itens[0]!.notas).toBe("Parte 1/5");
  });

  it("numera só quando o nome não distingue", () => {
    const comNomeRuim = planejarMensagem(
      msg(`Iman Ghadzi\n![image.png](${anexo("image.png")})\n![File.jpg](${anexo("File.jpg")})`),
    );
    expect(comNomeRuim.map((i) => i.titulo)).toEqual(["Iman Ghadzi (1/2)", "Iman Ghadzi (2/2)"]);

    const comNomeBom = planejarMensagem(
      msg(`Refs\n[Nexus Vendas.pdf](${anexo("Nexus%20Vendas.pdf")})\n[Ponto Cego.pdf](${anexo("Ponto%20Cego.pdf")})`),
    );
    expect(comNomeBom.map((i) => i.titulo)).toEqual(["Nexus Vendas", "Ponto Cego"]);
  });

  it("não corta o título numa abreviação", () => {
    const itens = planejarMensagem(msg("Ref. produto margem 3X: https://instagram.com/p/abc"));
    expect(itens[0]!.titulo).toBe("Ref. produto margem 3X");
  });

  it("lê a thread pelo contexto, mas não cria card por resposta", () => {
    const itens = planejarMensagem(
      msg(`Olha isso\n![a.png](${anexo("a.png")})`, {
        respostas: [{ content: "Esse é o upsell 2" }],
      }),
    );
    expect(itens).toHaveLength(1);
    expect(itens[0]!.notas).toContain("Esse é o upsell 2");
  });

  it("ignora o aviso que o próprio Swipe Files postou", () => {
    // Sem isto a biblioteca se reimporta: cada referência salva virou uma
    // mensagem aqui, e cada mensagem viraria um card "Nova referência…".
    const aviso =
      "**Nova referência no Swipe Files** — 📄 PDF\n\n**BP Odisseia**\n> Gancho de escassez\n\n" +
      "[Abrir na biblioteca](https://x.loyoladigital.com/swipe-files)\n_por Lucas Vital_";

    expect(ehAvisoDoProprioSwipe(aviso)).toBe(true);
    expect(planejarMensagem(msg(aviso))).toEqual([]);
  });

  it("ignora entradas e saídas do canal", () => {
    expect(ehRuido("@kaytafaria1@gmail.com entrou no canal")).toBe(true);
    expect(planejarMensagem(msg("@fulano saiu do canal"))).toEqual([]);
  });
});

describe("planejarImportacao", () => {
  const url = "https://t9013556102.p.clickup-attachments.com/t9/abc/ref.png";

  it("o mesmo anexo em duas mensagens entra uma vez só", () => {
    const itens = planejarImportacao([
      msg(`Contexto original\n![ref.png](${url})`, { id: "1" }),
      msg(`Reencaminhando\n![ref.png](${url})`, { id: "2" }),
    ]);

    expect(itens).toHaveLength(1);
    // O primeiro ganha: é onde está o contexto de quem salvou.
    expect(itens[0]!.notas).toBe("Contexto original");
  });

  it("a chave é estável, para retomar a importação sem duplicar", () => {
    const uma = planejarImportacao([msg(`![ref.png](${url})`)]);
    const outra = planejarImportacao([msg(`![ref.png](${url})`)]);
    expect(uma[0]!.importKey).toBe(outra[0]!.importKey);
    expect(uma[0]!.importKey).toBe(url);
  });
});

describe("nomes de baixador de anúncio", () => {
  // Importa mais para VÍDEO: a IA não lê vídeo, então o nome do arquivo é o
  // título definitivo. Estes vieram dos canais `referências-videos` e
  // `refs-videos`, onde enchiam a grade.
  it("reconhece o que saiu de baixador ou é hash puro", () => {
    for (const n of [
      "SaveClip.App_004F4F9235E8FDCB40D102173B0B7AA0_video_dashinit.mp4",
      "9C4844A5DF8539FA7B164C034AE1FEA7_video_dashinit.mp4",
      "476831031_2845743875604430_8976576407387461233_n.mp4",
      "462894214_1047973083446926_2554204716373321950_n.jpg",
      "An9V4EpxVBe4vBaBAdBK-6SmBXHmclFPJ9SbwVlL-1X5BQRYwmUkRqIy3ApFb7YafRLoWQUq3H-WjPqCzfdLNpoN.mp4",
    ]) {
      expect(nomeEhGenerico(n), n).toBe(true);
    }
  });

  it("não confunde com nome que alguém escreveu", () => {
    for (const n of [
      "Ícaro - Década.mp4",
      "Teaser Oficial Subido Ao Vivo 2023.mp4",
      "PLAYBOOK Black friday 2025.pdf",
      "Alex Hormozi Books.zip",
      "Black_Friday_Finclass.html",
    ]) {
      expect(nomeEhGenerico(n), n).toBe(false);
    }
  });
});

/**
 * O rótulo de fatia da importação.
 *
 * O que protege: "Parte 2/5" pode ser sobrescrito pela catalogação, e as
 * anotações humanas curtas do acervo — "Que página linda", "Ref Workshop
 * pago" — não podem.
 */
describe("ehRotuloDeFatia", () => {
  it("reconhece o rótulo em qualquer forma que a importação produziu", () => {
    for (const v of ["Parte 2/5", "parte 1/3", "  Parte 10 / 12  ", "PARTE 5/5"]) {
      expect(ehRotuloDeFatia(v)).toBe(true);
    }
  });

  it("NÃO toca em anotação humana curta — são as quatro reais do acervo", () => {
    for (const v of [
      "Que página linda",
      "Coisa fina, hein...",
      "Ref Workshop pago",
      "Ref. produto margem 3X:",
    ]) {
      expect(ehRotuloDeFatia(v)).toBe(false);
    }
  });

  it("não confunde com anotação que MENCIONA uma parte", () => {
    expect(ehRotuloDeFatia("A parte 2/5 da página é a melhor")).toBe(false);
  });

  it("vazio e nulo não são rótulo", () => {
    expect(ehRotuloDeFatia(null)).toBe(false);
    expect(ehRotuloDeFatia("")).toBe(false);
  });
});
