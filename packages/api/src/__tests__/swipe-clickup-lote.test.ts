import { describe, expect, it } from "vitest";
import {
  canalDoLote,
  montarMensagemDeLote,
  type ConfigDoAviso,
  type ItemDoLote,
} from "../services/swipe-clickup-aviso.js";

const URL_BIBLIOTECA = "https://app.loyola.com/swipe-files";
const SEM_CONTEXTO = { autor: null, destino: null };

const item = (over: Partial<ItemDoLote> = {}): ItemDoLote => ({
  titulo: "anuncio-01",
  assetKind: "image",
  ...over,
});

const cfg = (over: Partial<ConfigDoAviso> = {}): ConfigDoAviso => ({
  enabled: true,
  channelId: "geral",
  videoChannelId: "videos",
  mentionUsers: [],
  ...over,
});

describe("montarMensagemDeLote", () => {
  it("abre com a contagem, que é a informação principal", () => {
    const m = montarMensagemDeLote(
      [item(), item(), item()],
      URL_BIBLIOTECA,
      SEM_CONTEXTO,
    );
    expect(m.split("\n")[0]).toContain("3 referências novas");
  });

  it("usa o singular quando é uma só", () => {
    const m = montarMensagemDeLote([item()], URL_BIBLIOTECA, SEM_CONTEXTO);
    expect(m).toContain("1 referência nova");
    expect(m).not.toContain("referências novas");
  });

  it("conta por tipo em vez de listar tudo", () => {
    const itens = [
      item(),
      item(),
      item({ assetKind: "pdf" }),
      item({ assetKind: "video" }),
    ];
    const m = montarMensagemDeLote(itens, URL_BIBLIOTECA, SEM_CONTEXTO);
    expect(m).toContain("🖼️ Imagem 2");
    expect(m).toContain("📄 PDF 1");
    expect(m).toContain("🎬 Vídeo 1");
  });

  it("mostra uma amostra de títulos e resume o resto", () => {
    // O caso que motivou o lote: uma pasta grande. A mensagem não pode virar
    // a mesma enxurrada que ela existe para evitar.
    const itens = Array.from({ length: 60 }, (_, i) =>
      item({ titulo: `peca-${i}` }),
    );
    const m = montarMensagemDeLote(itens, URL_BIBLIOTECA, SEM_CONTEXTO);
    expect(m).toContain("• peca-0");
    expect(m).toContain("• peca-4");
    expect(m).not.toContain("• peca-5");
    expect(m).toContain("e mais 55");
  });

  it("não diz 'e mais' quando tudo coube", () => {
    const m = montarMensagemDeLote(
      [item(), item()],
      URL_BIBLIOTECA,
      SEM_CONTEXTO,
    );
    expect(m).not.toContain("e mais");
  });

  it("diz onde caiu e quem subiu", () => {
    const m = montarMensagemDeLote([item()], URL_BIBLIOTECA, {
      autor: "Lucas",
      destino: "Navarro",
    });
    expect(m).toContain("Em **Navarro**");
    expect(m).toContain("_por Lucas_");
  });

  it("omite destino e autor quando não há", () => {
    const m = montarMensagemDeLote([item()], URL_BIBLIOTECA, SEM_CONTEXTO);
    expect(m).not.toContain("Em **");
    expect(m).not.toContain("_por");
  });

  it("sempre leva o link da biblioteca", () => {
    const m = montarMensagemDeLote([item()], URL_BIBLIOTECA, SEM_CONTEXTO);
    expect(m).toContain(`[Abrir na biblioteca](${URL_BIBLIOTECA})`);
  });
});

describe("canalDoLote", () => {
  it("manda lote só de vídeo para o canal de vídeo", () => {
    const itens = [item({ assetKind: "video" }), item({ assetKind: "video" })];
    expect(canalDoLote(itens, cfg())).toBe("videos");
  });

  it("manda lote misto para o canal geral", () => {
    // Dividir em duas mensagens seria o "avisa item a item" de novo, menor.
    const itens = [item({ assetKind: "video" }), item()];
    expect(canalDoLote(itens, cfg())).toBe("geral");
  });

  it("cai no geral quando não há canal de vídeo configurado", () => {
    const itens = [item({ assetKind: "video" })];
    expect(canalDoLote(itens, cfg({ videoChannelId: null }))).toBe("geral");
  });

  it("lote vazio não vira canal de vídeo por vacuidade", () => {
    // `every` de lista vazia é true — sem a guarda, um lote vazio iria para o
    // canal de vídeo.
    expect(canalDoLote([], cfg())).toBe("geral");
  });
});
