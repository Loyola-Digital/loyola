/**
 * O aviso no ClickUp quando entra referência nova.
 *
 * Os dois testes que mais importam: o aviso **nunca derruba o cadastro**, e a
 * mensagem **não vira uma lista de traços** quando os campos estão vazios.
 */

import { describe, expect, it, vi } from "vitest";
import {
  avisarNoClickUp,
  canalDoAviso,
  montarMensagem,
  type ConfigDoAviso,
  type ReferenciaNova,
} from "../services/swipe-clickup-aviso.js";

const URL_BIBLIOTECA = "https://x.loyoladigital.com/swipe-files";

const ref = (over: Partial<ReferenciaNova> = {}): ReferenciaNova => ({
  id: "r1",
  titulo: "Anúncio da Black com prova social",
  assetKind: "image",
  autor: "Danilo",
  notas: "Abre com o depoimento antes da oferta.",
  marca: "BBE",
  nicho: "finanças",
  plataforma: "Meta",
  formato: "Feed",
  tags: ["prova-social", "black"],
  origem: "https://facebook.com/ads/library/1",
  ...over,
});

const cfg = (over: Partial<ConfigDoAviso> = {}): ConfigDoAviso => ({
  enabled: true,
  channelId: "8ckzww6-2433",
  videoChannelId: null,
  mentionUsers: [],
  ...over,
});

describe("para qual canal vai", () => {
  it("vídeo vai para o canal de vídeo quando existe", () => {
    // O time já separou os canais no ClickUp; mandar vídeo para o geral seria
    // ignorar uma decisão que já foi tomada.
    const c = cfg({ videoChannelId: "8ckzww6-2473" });
    expect(canalDoAviso("video", c)).toBe("8ckzww6-2473");
  });

  it("sem canal de vídeo, vídeo vai para o padrão", () => {
    // Aviso no canal errado é melhor que aviso nenhum.
    expect(canalDoAviso("video", cfg())).toBe("8ckzww6-2433");
  });

  it("os outros tipos vão sempre para o padrão", () => {
    const c = cfg({ videoChannelId: "8ckzww6-2473" });
    for (const k of ["image", "pdf", "link"] as const) {
      expect(canalDoAviso(k, c)).toBe("8ckzww6-2433");
    }
  });
});

describe("a mensagem", () => {
  it("traz o que decide se vale abrir", () => {
    const m = montarMensagem(ref(), URL_BIBLIOTECA);
    expect(m).toContain("Anúncio da Black com prova social");
    expect(m).toContain("depoimento antes da oferta");
    expect(m).toContain("Danilo");
    expect(m).toContain(URL_BIBLIOTECA);
    expect(m).toContain("#prova-social");
  });

  it("campo vazio NÃO vira linha", () => {
    // Uma mensagem com quatro "—" empurra o que interessa para fora da tela.
    const m = montarMensagem(
      ref({
        notas: null,
        marca: null,
        nicho: null,
        plataforma: null,
        formato: null,
        tags: [],
        origem: null,
        autor: null,
      }),
      URL_BIBLIOTECA,
    );
    expect(m).not.toContain("—\n");
    expect(m).not.toContain("null");
    expect(m).not.toContain("undefined");
    // Mas o essencial continua lá.
    expect(m).toContain("Anúncio da Black com prova social");
    expect(m).toContain(URL_BIBLIOTECA);
  });

  it("o tipo aparece com ícone, para bater o olho no canal", () => {
    expect(montarMensagem(ref({ assetKind: "video" }), URL_BIBLIOTECA)).toContain("Vídeo");
    expect(montarMensagem(ref({ assetKind: "pdf" }), URL_BIBLIOTECA)).toContain("PDF");
  });

  it("nota gigante é cortada — o canal não é lugar de ensaio", () => {
    const m = montarMensagem(ref({ notas: "x".repeat(900) }), URL_BIBLIOTECA);
    expect(m.length).toBeLessThan(900);
  });

  it("quebra de linha na nota vira espaço, para não estourar a citação", () => {
    const m = montarMensagem(ref({ notas: "linha 1\n\nlinha 2" }), URL_BIBLIOTECA);
    expect(m).toContain("> linha 1 linha 2");
  });
});

describe("o aviso nunca derruba o cadastro", () => {
  function fastifyFalso(over: Record<string, unknown> = {}) {
    const enviar = vi.fn(async (_canal: string, _texto: string) => {});
    return {
      fastify: {
        db: {
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [cfg()] }) }) }),
        },
        clickupService: { isConfigured: () => true, sendChatMessage: enviar },
        log: { warn: vi.fn(), info: vi.fn() },
        config: { CORS_ORIGIN: "https://x.loyoladigital.com" },
        ...over,
      } as never,
      enviar,
    };
  }

  it("ClickUp fora do ar não lança — vira motivo", async () => {
    const { fastify } = fastifyFalso({
      clickupService: {
        isConfigured: () => true,
        sendChatMessage: async () => {
          throw new Error("502 do ClickUp");
        },
      },
    });
    const r = await avisarNoClickUp(fastify, ref());
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("falha-no-envio");
  });

  it("ClickUp não configurado não tenta enviar", async () => {
    const { fastify, enviar } = fastifyFalso({
      clickupService: { isConfigured: () => false, sendChatMessage: vi.fn() },
    });
    const r = await avisarNoClickUp(fastify, ref());
    expect(r.motivo).toBe("clickup-nao-configurado");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sem configuração salva, não envia — e diz isso", async () => {
    const { fastify } = fastifyFalso({
      db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) },
    });
    const r = await avisarNoClickUp(fastify, ref());
    expect(r.motivo).toBe("aviso-desligado");
  });

  it("no caminho feliz, envia com o link do app montado", async () => {
    const { fastify, enviar } = fastifyFalso();
    const r = await avisarNoClickUp(fastify, ref());
    expect(r.enviado).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]![1]).toContain("https://x.loyoladigital.com/swipe-files");
  });
});
