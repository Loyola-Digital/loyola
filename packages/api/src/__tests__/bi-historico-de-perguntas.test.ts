/**
 * O histórico de perguntas do dashboard de BI.
 *
 * Pedido do Lucas: "seria legal ficar um histórico dos prompts pedidos, hoje ele
 * some". Sumia mesmo — a pergunta vivia só no estado da tela.
 */

import { describe, expect, it } from "vitest";
import { MAX_PERGUNTAS, perguntasGuardadas } from "../services/bi/dashboard.js";

const pergunta = (texto: string, extra: Record<string, unknown> = {}) => ({
  texto,
  em: "2026-10-02T12:00:00.000Z",
  por: "Alberto",
  widgets: 2,
  ...extra,
});

describe("perguntasGuardadas", () => {
  it("lê o que está guardado, na ordem em que foi perguntado", () => {
    const r = perguntasGuardadas([pergunta("primeira"), pergunta("segunda")]);
    expect(r.map((p) => p.texto)).toEqual(["primeira", "segunda"]);
  });

  it("a pergunta que FALHOU fica — é a que mais se quer rever", () => {
    const r = perguntasGuardadas([pergunta("deu erro", { widgets: 0, erro: "A IA está sem saldo." })]);
    expect(r[0]).toMatchObject({ widgets: 0, erro: "A IA está sem saldo." });
  });

  it("linha torta é descartada sem derrubar as outras", () => {
    const r = perguntasGuardadas([pergunta("boa"), { texto: 42 }, null, "nada a ver"]);
    expect(r.map((p) => p.texto)).toEqual(["boa"]);
  });

  it("coluna que não é lista vira histórico vazio", () => {
    expect(perguntasGuardadas(null)).toEqual([]);
    expect(perguntasGuardadas({ texto: "oi" })).toEqual([]);
  });

  it("guarda as MAIS RECENTES quando passa do teto", () => {
    const muitas = Array.from({ length: MAX_PERGUNTAS + 10 }, (_, i) => pergunta(`p${i}`));
    const r = perguntasGuardadas(muitas);
    expect(r).toHaveLength(MAX_PERGUNTAS);
    expect(r[r.length - 1]?.texto).toBe(`p${MAX_PERGUNTAS + 9}`);
  });

  it("quem perguntou é opcional — conta apagada não apaga a pergunta", () => {
    const r = perguntasGuardadas([{ texto: "sem dono", em: "2026-10-02T12:00:00.000Z" }]);
    expect(r[0]).toMatchObject({ texto: "sem dono", por: "", widgets: 0 });
  });
});
