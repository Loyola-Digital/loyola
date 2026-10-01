import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDebriefingSrcDoc,
  clampFrameHeight,
  DEBRIEFING_FRAME_MAX_HEIGHT,
  DEBRIEFING_FRAME_MIN_HEIGHT,
  DEBRIEFING_IFRAME_SANDBOX,
  DEBRIEFING_MSG,
  mensagemDeErroAoSalvar,
} from "@/lib/debriefing-frame";

// Story 49.8 — viewer do Debriefing.
//
// O contrato do serializador (AC4) roda o script-agente REAL dentro de um
// documento jsdom com scripts ligados. jsdom não tem <canvas> de verdade: a
// fixture reproduz as MUTAÇÕES que o Chart.js 4 faz no elemento ao desenhar
// (acquireContext + retinaScale: guarda o estado original em
// `canvas.$chartjs.initial`, grava width/height do bitmap e o tamanho em px no
// style). O desenho de verdade, a reabertura e a contagem de gráficos estão no
// teste em navegador registrado na story (AC3).

// ---------------------------------------------------------------------------
// Fixture mínima (sem rede, sem CDN)
// ---------------------------------------------------------------------------

const FIXTURE = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Fixture 49.8</title></head>
<body>
<h1 id="titulo">Debriefing de teste</h1>
<p id="intacto">Texto que ninguém edita.</p>
<div class="grade">
  <div class="chart-box"><canvas id="cA" data-autor="mantido"></canvas></div>
  <div class="chart-box"><canvas id="cB" width="300" height="150" style="border: 1px solid red;"></canvas></div>
  <canvas id="cSemGrafico" width="10" height="10" style="width: 10px;"></canvas>
</div>
<script>
const D = {"serie":[1,2,3]};
// Mesmo que o Chart.js 4 faz no canvas ao criar o gráfico numa tela de 1400 px.
function desenhar(c) {
  var st = c.style;
  c.$chartjs = { initial: {
    height: c.getAttribute("height"),
    width: c.getAttribute("width"),
    style: { display: st.display, height: st.height, width: st.width }
  } };
  st.display = st.display || "block";
  st.boxSizing = st.boxSizing || "border-box";
  c.setAttribute("width", "1836");
  c.setAttribute("height", "500");
  st.height = "250px";
  st.width = "918px";
  c.setAttribute("data-desenhado", "sim");
}
desenhar(document.getElementById("cA"));
desenhar(document.getElementById("cB"));
</script>
</body></html>`;

const abertos: JSDOM[] = [];
afterEach(() => {
  // fecha as janelas (o agente agenda timeouts de altura)
  while (abertos.length) abertos.pop()!.window.close();
});

/** Carrega o srcDoc com o agente, roda os scripts e devolve a janela. */
function abrir(html: string, editable = true): JSDOM {
  const dom = new JSDOM(buildDebriefingSrcDoc(html, { editable }), {
    runScripts: "dangerously",
  });
  abertos.push(dom);
  return dom;
}

/** Pede o HTML ao agente como o parent faz (postMessage requestHtml). */
function serializar(dom: JSDOM): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = dom.window;
    const timer = setTimeout(() => reject(new Error("agente não respondeu")), 2000);
    w.addEventListener("message", (ev: MessageEvent) => {
      if (ev.data?.type === DEBRIEFING_MSG.html) {
        clearTimeout(timer);
        resolve(ev.data.html as string);
      }
    });
    w.postMessage({ type: DEBRIEFING_MSG.requestHtml }, "*");
  });
}

/** Lê o HTML salvo sem rodar scripts (só para inspecionar o markup). */
function inspecionar(html: string): Document {
  return new JSDOM(html).window.document;
}

// ---------------------------------------------------------------------------
// AC4 — contrato do serializador
// ---------------------------------------------------------------------------

describe("serializador do agente (Story 49.8, AC4)", () => {
  it("devolve o DOCTYPE e NÃO leva o script-agente", async () => {
    const html = await serializar(abrir(FIXTURE));

    expect(html.startsWith("<!DOCTYPE html>\n")).toBe(true);
    expect(html).not.toContain("__loyola_debriefing_agent__");
    expect(html).not.toContain(DEBRIEFING_MSG.requestHtml);
  });

  it("grava o texto editado e mantém intacto o que não foi editado", async () => {
    const dom = abrir(FIXTURE);
    // designMode: editar é mutar o DOM vivo
    dom.window.document.getElementById("titulo")!.textContent =
      "Debriefing de teste EDITADO";

    const salvo = inspecionar(await serializar(dom));

    expect(salvo.getElementById("titulo")!.textContent).toBe(
      "Debriefing de teste EDITADO",
    );
    expect(salvo.getElementById("intacto")!.textContent).toBe(
      "Texto que ninguém edita.",
    );
  });

  it("não grava pixels do canvas e preserva o `const D` que redesenha na reabertura", async () => {
    const html = await serializar(abrir(FIXTURE));

    expect(html).not.toMatch(/data:image\//);
    expect(html).toContain('const D = {"serie":[1,2,3]};');
    // nada duplicado: os mesmos 3 canvas da fixture
    expect(inspecionar(html).querySelectorAll("canvas")).toHaveLength(3);
  });

  it("desfaz no HTML salvo o tamanho que o Chart.js gravou no <canvas>", async () => {
    const salvo = inspecionar(await serializar(abrir(FIXTURE)));

    // cA não tinha width/height nem style: volta sem tamanho em px
    const cA = salvo.getElementById("cA") as HTMLCanvasElement;
    expect(cA.hasAttribute("width")).toBe(false);
    expect(cA.hasAttribute("height")).toBe(false);
    expect(cA.style.width).toBe("");
    expect(cA.style.height).toBe("");
    expect(cA.style.display).toBe("");
    // atributos que não são do tamanho ficam como estão
    expect(cA.getAttribute("data-autor")).toBe("mantido");
    expect(cA.getAttribute("data-desenhado")).toBe("sim");

    // cB tinha width/height e style do autor: voltam os do autor
    const cB = salvo.getElementById("cB") as HTMLCanvasElement;
    expect(cB.getAttribute("width")).toBe("300");
    expect(cB.getAttribute("height")).toBe("150");
    expect(cB.style.border).toBe("1px solid red");
    expect(cB.style.width).toBe("");
    expect(cB.style.height).toBe("");
  });

  it("canvas sem gráfico (sem $chartjs) sai como estava", async () => {
    const salvo = inspecionar(await serializar(abrir(FIXTURE)));
    const c = salvo.getElementById("cSemGrafico") as HTMLCanvasElement;

    expect(c.getAttribute("width")).toBe("10");
    expect(c.getAttribute("height")).toBe("10");
    expect(c.style.width).toBe("10px");
  });

  it("serializar não mexe no documento vivo (os gráficos na tela seguem como estão)", async () => {
    const dom = abrir(FIXTURE);
    await serializar(dom);

    const vivo = dom.window.document.getElementById("cA") as HTMLCanvasElement;
    expect(vivo.getAttribute("width")).toBe("1836");
    expect(vivo.style.width).toBe("918px");
    expect(
      dom.window.document.getElementById("__loyola_debriefing_agent__"),
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC1 — sandbox
// ---------------------------------------------------------------------------

describe("DEBRIEFING_IFRAME_SANDBOX (Story 49.8, AC1)", () => {
  it("é exatamente scripts + popups + popups escapando do sandbox", () => {
    expect(DEBRIEFING_IFRAME_SANDBOX).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
  });

  it("NÃO tem allow-same-origin (o doc enviado não ganha a origem do app)", () => {
    const tokens = DEBRIEFING_IFRAME_SANDBOX.split(/\s+/);
    expect(tokens).not.toContain("allow-same-origin");
    expect(tokens.sort()).toEqual(
      ["allow-popups", "allow-popups-to-escape-sandbox", "allow-scripts"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// AC6 — teto de altura
// ---------------------------------------------------------------------------

describe("clampFrameHeight (Story 49.8, AC6)", () => {
  it("abaixo do mínimo vira o mínimo", () => {
    expect(clampFrameHeight(100)).toEqual({ height: 400, truncada: false });
    expect(clampFrameHeight(375)).toEqual({ height: 400, truncada: false });
  });

  it("soma a margem de 24 px", () => {
    expect(clampFrameHeight(7509)).toEqual({ height: 7533, truncada: false });
  });

  it("19.976 + 24 = 20.000: no teto, sem truncar", () => {
    expect(clampFrameHeight(19976)).toEqual({ height: 20000, truncada: false });
  });

  it("19.977 + 24 = 20.001: preso no teto e marcado como truncado", () => {
    expect(clampFrameHeight(19977)).toEqual({ height: 20000, truncada: true });
    expect(clampFrameHeight(25000)).toEqual({ height: 20000, truncada: true });
  });

  it("valores não finitos ou negativos não quebram", () => {
    const minimo = { height: DEBRIEFING_FRAME_MIN_HEIGHT, truncada: false };
    expect(clampFrameHeight(Number.NaN)).toEqual(minimo);
    expect(clampFrameHeight(Number.POSITIVE_INFINITY)).toEqual(minimo);
    expect(clampFrameHeight(Number.NEGATIVE_INFINITY)).toEqual(minimo);
    expect(clampFrameHeight(-500)).toEqual(minimo);
  });

  it("os limites são 400 e 20.000", () => {
    expect(DEBRIEFING_FRAME_MIN_HEIGHT).toBe(400);
    expect(DEBRIEFING_FRAME_MAX_HEIGHT).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// AC5 — mensagem do salvar
// ---------------------------------------------------------------------------

describe("mensagemDeErroAoSalvar (Story 49.8, AC5)", () => {
  function erroHttp(status: number, message: string) {
    return Object.assign(new Error(message), { status });
  }

  it("413 diz o limite, mesmo quando o corpo não trouxe mensagem", () => {
    expect(mensagemDeErroAoSalvar(erroHttp(413, "API error: 413"))).toBe(
      "Documento muito grande para salvar. Máximo: 5MB.",
    );
    expect(
      mensagemDeErroAoSalvar(erroHttp(413, "Arquivo muito grande. Máximo: 5MB")),
    ).toContain("Máximo: 5MB");
  });

  it("outros erros mostram a mensagem da API", () => {
    expect(mensagemDeErroAoSalvar(erroHttp(404, "debriefing não encontrado"))).toBe(
      "debriefing não encontrado",
    );
  });

  it("sem mensagem cai no genérico", () => {
    expect(mensagemDeErroAoSalvar(undefined)).toBe("Erro ao salvar");
    expect(mensagemDeErroAoSalvar(new Error(""))).toBe("Erro ao salvar");
  });
});
