// Story 37.2 — comunicação com o iframe sandbox do debriefing.
//
// O doc HTML roda em <iframe sandbox="allow-scripts"> SEM allow-same-origin,
// então o parent NÃO acessa o DOM do iframe. Toda a integração é feita por um
// script-agente injetado no srcDoc que conversa via postMessage:
//   - reporta a altura real do documento (auto-altura, sem scroll interno);
//   - em modo edição, liga document.designMode = "on" (WYSIWYG nativo);
//   - a pedido do parent, serializa o documento (removendo a si mesmo e
//     preservando o DOCTYPE) e devolve o HTML editado para salvar.

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
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.type !== "${DEBRIEFING_MSG.requestHtml}") return;
    var clone = document.documentElement.cloneNode(true);
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
