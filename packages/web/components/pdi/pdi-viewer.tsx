"use client";

/**
 * Renderiza o documento de PDI.
 *
 * Em `<iframe sandbox srcDoc>` e não inline no DOM, por três motivos que se
 * somam:
 *
 * 1. O documento é uma página inteira, com `body{...}` e `*{margin:0}` no CSS —
 *    injetado inline, ele reescreveria o estilo do app todo.
 * 2. Ele DESENHA a si mesmo por <script> (os dados vêm num
 *    <script type="application/json">). Sanitizar removendo script deixaria o
 *    card em branco, então "limpar o HTML" não é uma opção aqui.
 * 3. `sandbox="allow-scripts"` SEM `allow-same-origin` deixa o script rodar
 *    dentro do iframe mas o mantém em origem opaca: ele não alcança cookie,
 *    localStorage nem o DOM do app. É o isolamento que torna seguro exibir um
 *    HTML que veio de fora.
 */

import { useEffect, useRef, useState } from "react";

const ALTURA_MINIMA = 420;

export function PdiViewer({ html, titulo }: { html: string; titulo: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [altura, setAltura] = useState(ALTURA_MINIMA);

  /**
   * Iframe não cresce sozinho com o conteúdo. Sem origem compartilhada não dá
   * pra medir o documento de fora, então o próprio documento reporta a altura
   * via postMessage — o script injetado abaixo faz isso.
   */
  useEffect(() => {
    function aoReceber(evento: MessageEvent) {
      if (evento.source !== iframeRef.current?.contentWindow) return;
      const dado = evento.data as { tipo?: string; altura?: number } | null;
      if (dado?.tipo !== "pdi:altura" || typeof dado.altura !== "number") return;
      // Teto generoso: documento com bug de layout não pode virar página infinita.
      setAltura(Math.min(Math.max(dado.altura, ALTURA_MINIMA), 20000));
    }
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, []);

  // Medidor anexado ao documento. Vai no fim do body pra rodar depois do script
  // que desenha o card — medir antes daria a altura da página vazia.
  const medidor = `
<script>
(function(){
  function reportar(){
    var d = document.documentElement, b = document.body;
    var h = Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.offsetHeight);
    parent.postMessage({ tipo: "pdi:altura", altura: h }, "*");
  }
  window.addEventListener("load", reportar);
  setTimeout(reportar, 60);
  setTimeout(reportar, 400);
  if (window.ResizeObserver && document.body) {
    new ResizeObserver(reportar).observe(document.body);
  }
})();
</script>`;

  const documento = html.includes("</body>")
    ? html.replace("</body>", `${medidor}</body>`)
    : html + medidor;

  return (
    <iframe
      ref={iframeRef}
      title={titulo}
      srcDoc={documento}
      // allow-scripts sem allow-same-origin: o documento se desenha, mas fica
      // em origem opaca — sem acesso à sessão do app.
      sandbox="allow-scripts"
      className="w-full rounded-xl border border-border/40 bg-white"
      style={{ height: altura }}
    />
  );
}
