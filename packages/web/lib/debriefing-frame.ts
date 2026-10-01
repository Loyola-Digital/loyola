// Story 37.2 — comunicação com o iframe sandbox do debriefing.
//
// O doc HTML roda em <iframe sandbox> SEM allow-same-origin (permissões em
// DEBRIEFING_IFRAME_SANDBOX), então o parent NÃO acessa o DOM do iframe. Toda
// a integração é feita por um script-agente injetado no srcDoc que conversa
// via postMessage:
//   - reporta a altura real do documento (auto-altura, sem scroll interno);
//   - em modo edição, liga document.designMode = "on" (WYSIWYG nativo);
//   - a pedido do parent, serializa o documento (removendo a si mesmo,
//     desfazendo o tamanho que o Chart.js gravou nos <canvas> e preservando o
//     DOCTYPE) e devolve o HTML editado para salvar.

/**
 * Story 49.8 — permissões do `sandbox` do iframe do viewer.
 *
 * - `allow-scripts`: o doc roda o próprio JS (Chart.js, abas) e o script-agente.
 * - `allow-popups` + `allow-popups-to-escape-sandbox`: links `target="_blank"`
 *   (o do Ads Manager com `selected_ad_ids`, exigido pela Fase 9 da skill)
 *   abrem numa aba normal. Sem `allow-popups` o Chrome bloqueia com "Blocked
 *   opening … 'allow-popups' permission is not set" (testado em 2026-09-30).
 *
 * `allow-same-origin` fica FORA de propósito (regra do Epic 37): com ele o doc
 * enviado teria a origem do app — leria storage/cookies do Loyola X e poderia
 * desligar o próprio sandbox. Um teste unitário trava este valor.
 */
export const DEBRIEFING_IFRAME_SANDBOX =
  "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/** Altura mínima do iframe (px). */
export const DEBRIEFING_FRAME_MIN_HEIGHT = 400;
/**
 * Teto da altura do iframe (px). Acima dele o viewer NÃO corta em silêncio:
 * `clampFrameHeight` devolve `truncada: true` e a página mostra o aviso com o
 * "abrir em nova aba" (Story 49.8, AC6).
 */
export const DEBRIEFING_FRAME_MAX_HEIGHT = 20000;
/** Margem que o pai soma à altura reportada pelo doc (folga de borda/sombra). */
export const DEBRIEFING_FRAME_MARGIN = 24;

/**
 * Altura do iframe a partir da altura reportada pelo doc: soma a margem e
 * prende entre o mínimo e o teto. `truncada` diz se o doc passa do teto (o
 * conteúdo além dele fica inalcançável, porque o iframe usa `scrolling="no"`).
 * Entrada não finita (NaN, ±Infinity) vira o mínimo, sem truncar.
 */
export function clampFrameHeight(reportada: number): {
  height: number;
  truncada: boolean;
} {
  if (!Number.isFinite(reportada)) {
    return { height: DEBRIEFING_FRAME_MIN_HEIGHT, truncada: false };
  }
  const desejada = reportada + DEBRIEFING_FRAME_MARGIN;
  if (desejada > DEBRIEFING_FRAME_MAX_HEIGHT) {
    return { height: DEBRIEFING_FRAME_MAX_HEIGHT, truncada: true };
  }
  return {
    height: Math.max(desejada, DEBRIEFING_FRAME_MIN_HEIGHT),
    truncada: false,
  };
}

/**
 * Teto do HTML salvo, em MB — espelha `MAX_HTML_BYTES` de
 * `api/src/routes/debriefings.ts` (vale para o upload e para o salvar).
 */
export const DEBRIEFING_MAX_HTML_MB = 5;

/**
 * Mensagem do toast quando o Salvar da edição inline falha. Story 49.8 (AC5):
 * 413 (corpo/HTML acima do teto) diz o limite em vez do "Erro ao salvar"
 * genérico — inclusive quando o 413 vem sem corpo JSON (de um proxy), caso em
 * que a mensagem do api-client seria só "API error: 413".
 */
export function mensagemDeErroAoSalvar(erro: unknown): string {
  const status =
    typeof erro === "object" && erro !== null
      ? (erro as { status?: unknown }).status
      : undefined;
  if (status === 413) {
    return `Documento muito grande para salvar. Máximo: ${DEBRIEFING_MAX_HTML_MB}MB.`;
  }
  if (erro instanceof Error && erro.message) return erro.message;
  return "Erro ao salvar";
}

export const DEBRIEFING_MSG = {
  height: "debriefing:height",
  html: "debriefing:html",
  requestHtml: "debriefing:request-html",
} as const;

const AGENT_ID = "__loyola_debriefing_agent__";

// Sem "</script>" literal dentro do código do agente (fecharia a tag na
// injeção). Mantido em ES5 para rodar em qualquer doc.
const AGENT_CODE = `
(function () {
  var EDITABLE = document.currentScript && document.currentScript.dataset.editable === "true";
  function post(msg) { window.parent.postMessage(msg, "*"); }
  function reportHeight() {
    var body = document.body;
    var root = document.documentElement;
    var h = Math.max(
      root ? root.scrollHeight : 0,
      root ? root.offsetHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0
    );
    if (h > 0) post({ type: "${DEBRIEFING_MSG.height}", height: h });
  }
  window.addEventListener("load", reportHeight);
  setTimeout(reportHeight, 100);
  setTimeout(reportHeight, 600);
  setTimeout(reportHeight, 2000);
  if (typeof ResizeObserver !== "undefined" && document.documentElement) {
    new ResizeObserver(reportHeight).observe(document.documentElement);
  }
  if (EDITABLE) {
    document.designMode = "on";
  }
  // Story 49.8 — desfaz no CLONE o que o Chart.js gravou no <canvas> ao
  // desenhar (width/height do bitmap e style com o tamanho em px da tela de
  // quem salvou). Sem isto o doc salvo numa tela larga reabre numa estreita
  // com os gráficos presos à largura antiga (estouram a grade e a lateral
  // some, porque o iframe usa scrolling="no"). Os valores originais vêm do
  // próprio Chart.js (canvas.$chartjs.initial, o mesmo que o releaseContext
  // dele usa para devolver o canvas, inclusive deixando o box-sizing que ele
  // mesmo põe de volta ao desenhar); canvas sem gráfico fica como está.
  function restaurarCanvas(vivo, copia) {
    var ini = vivo && vivo.$chartjs && vivo.$chartjs.initial;
    if (!ini) return;
    var attrs = ["width", "height"];
    for (var i = 0; i < attrs.length; i++) {
      var v = ini[attrs[i]];
      if (v === null || v === undefined) copia.removeAttribute(attrs[i]);
      else copia.setAttribute(attrs[i], v);
    }
    var st = ini.style || {};
    copia.style.display = st.display || "";
    copia.style.height = st.height || "";
    copia.style.width = st.width || "";
    if (!copia.getAttribute("style")) copia.removeAttribute("style");
  }
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.type !== "${DEBRIEFING_MSG.requestHtml}") return;
    var clone = document.documentElement.cloneNode(true);
    var vivos = document.documentElement.getElementsByTagName("canvas");
    var copias = clone.getElementsByTagName("canvas");
    for (var c = 0; c < vivos.length && c < copias.length; c++) {
      // nunca deixa a restauração impedir o salvar
      try { restaurarCanvas(vivos[c], copias[c]); } catch (e) {}
    }
    var self = clone.querySelector("#${AGENT_ID}");
    if (self && self.parentNode) self.parentNode.removeChild(self);
    var doctype = document.doctype ? "<!DOCTYPE html>\\n" : "";
    post({ type: "${DEBRIEFING_MSG.html}", html: doctype + clone.outerHTML });
  });
})();
`;

/**
 * Monta o srcDoc do iframe: HTML original + script-agente injetado antes de
 * </body> (ou no final, se o doc não tiver body explícito).
 */
export function buildDebriefingSrcDoc(
  html: string,
  opts: { editable: boolean },
): string {
  const tag = `<script id="${AGENT_ID}" data-editable="${opts.editable}">${AGENT_CODE}</script>`;
  const closeBody = /<\/body>/i.exec(html);
  if (closeBody) {
    const i = closeBody.index;
    return html.slice(0, i) + tag + html.slice(i);
  }
  return html + tag;
}

export type DebriefingFrameMessage =
  | { type: typeof DEBRIEFING_MSG.height; height: number }
  | { type: typeof DEBRIEFING_MSG.html; html: string };

/** Type-guard para as mensagens vindas do iframe do debriefing. */
export function isDebriefingFrameMessage(
  data: unknown,
): data is DebriefingFrameMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as { type?: unknown; height?: unknown; html?: unknown };
  if (d.type === DEBRIEFING_MSG.height) return typeof d.height === "number";
  if (d.type === DEBRIEFING_MSG.html) return typeof d.html === "string";
  return false;
}
