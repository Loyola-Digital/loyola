"use client";

/**
 * A carta de PDI, desenhada com os componentes do app.
 *
 * É uma reprodução do documento original, não uma releitura: mesmas medidas
 * (carta de 480px, painéis #1A1A1A sobre #111111), mesmo radar de cinco eixos,
 * mesmos rótulos e a mesma ordem de seções. Quem já recebeu a sua tem que
 * reconhecer o papel.
 *
 * O que muda é só o meio: sai o iframe com uma página inteira dentro, entra
 * markup do próprio app — texto selecionável, achável pelo Ctrl+F da página,
 * e nenhum HTML de terceiro rodando no navegador de quem abre.
 */

import { Inter } from "next/font/google";
import type { AtributoDoPdi, PdiDados } from "@/lib/utils/pdi-dados";

/**
 * A fonte do documento original.
 *
 * Sem ela a carta fica parecida, não igual: a métrica do Inter é mais estreita
 * que a da fonte do sistema, e o texto quebra em outros pontos — o lema saía em
 * uma linha onde o documento usa duas. O Next serve o arquivo do próprio
 * domínio, então não há requisição ao Google em runtime.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

const AMARELO = "#F5C800";
const PRETO = "#111111";
const PAINEL = "#1A1A1A";
const LINHA = "#333333";
const CINZA = "#888888";

/** Usada no SVG, que não herda a classe da fonte pelo `font-family` do texto. */
const FONTE =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// ============================================================
// Radar
// ============================================================

/**
 * Quebra o rótulo em duas linhas pelo ponto mais equilibrado.
 *
 * Mesma regra do documento: até 14 caracteres cabe numa linha; acima disso,
 * procura o corte que deixa as duas metades mais parecidas — "COMUNICAÇÃO DE
 * TAREFAS" quebrado no meio fica melhor que quebrado na primeira palavra.
 */
function quebrarRotulo(rotulo: string): [string, string?] {
  if (rotulo.length <= 14) return [rotulo];
  const palavras = rotulo.split(" ");
  if (palavras.length === 1) return [rotulo];
  let melhor: { a: string; b: string; nota: number } | null = null;
  for (let i = 1; i < palavras.length; i += 1) {
    const a = palavras.slice(0, i).join(" ");
    const b = palavras.slice(i).join(" ");
    const nota = Math.max(a.length, b.length);
    if (!melhor || nota < melhor.nota) melhor = { a, b, nota };
  }
  return [melhor!.a, melhor!.b];
}

const CX = 200;
const CY = 150;
const RAIO = 70;
const RAIO_ROTULO = RAIO + 24;
const NIVEIS = 5;

function RadarDeAtributos({ atributos }: { atributos: AtributoDoPdi[] }) {
  const n = atributos.length;
  const anguloDe = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pontoDe = (i: number, r: number): [number, number] => {
    const a = anguloDe(i);
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };

  const teias = Array.from({ length: NIVEIS }, (_, l) => {
    const r = (RAIO * (l + 1)) / NIVEIS;
    return Array.from({ length: n }, (_, i) => pontoDe(i, r).join(",")).join(" ");
  });
  const dados = atributos.map((a, i) => pontoDe(i, RAIO * (a.value / 10)));

  return (
    <svg
      viewBox="0 0 400 310"
      className="block h-auto w-full max-w-[400px]"
      role="img"
      aria-label={`Radar: ${atributos.map((a) => `${a.label} ${a.value} de 10`).join(", ")}`}
    >
      {teias.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke={LINHA} strokeWidth={1} />
      ))}
      {atributos.map((_, i) => {
        const [x, y] = pontoDe(i, RAIO);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke={LINHA} strokeWidth={1} />;
      })}
      <polygon
        points={dados.map((p) => p.join(",")).join(" ")}
        fill={AMARELO}
        fillOpacity={0.3}
        stroke={AMARELO}
        strokeWidth={2}
      />
      {dados.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill={AMARELO} />
      ))}
      {atributos.map((a, i) => {
        const [lx, ly] = pontoDe(i, RAIO_ROTULO);
        // Rótulo à esquerda do centro ancora pela direita (e vice-versa), senão
        // o texto invade o desenho.
        const ancora = lx < CX - 15 ? "end" : lx > CX + 15 ? "start" : "middle";
        const [l1, l2] = quebrarRotulo(a.label);
        return (
          <text
            key={a.label}
            x={lx}
            y={ly}
            textAnchor={ancora}
            fontFamily={FONTE}
            fontSize={10}
            fontWeight={700}
            fill="#FFFFFF"
          >
            <tspan x={lx} dy={0}>
              {l1}
            </tspan>
            {l2 && (
              <tspan x={lx} dy={11}>
                {l2}
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}

// ============================================================
// Peças da carta
// ============================================================

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mb-2.5 block text-xs font-bold uppercase"
      style={{ color: AMARELO, letterSpacing: "2px" }}
    >
      {children}
    </span>
  );
}

/** Item com o quadradinho amarelo — pontos fortes e conquistas. */
function LinhaDaPilha({ texto }: { texto: string }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-md px-3.5 py-2.5"
      style={{ background: PAINEL }}
    >
      <span className="h-1.5 w-1.5 shrink-0" style={{ background: AMARELO }} aria-hidden />
      <span className="text-sm leading-[1.35] text-white">{texto}</span>
    </div>
  );
}

function Regua() {
  return <hr className="border-0" style={{ height: 1, background: LINHA }} />;
}

// ============================================================
// Carta
// ============================================================

export function PdiCard({ dados }: { dados: PdiDados }) {
  return (
    <div className="flex justify-center">
      <article
        className={`${inter.className} flex w-full max-w-[480px] flex-col gap-5 rounded-2xl p-5 sm:p-7`}
        style={{
          background: PRETO,
          color: "#FFFFFF",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.45), 0 2px 10px rgba(0,0,0,0.2)",
        }}
      >
        {/* Cabeçalho: retrato + identificação */}
        <header className="grid grid-cols-[100px_1fr] gap-5">
          {dados.foto ? (
            <div
              className="h-[100px] w-[100px] overflow-hidden rounded-full p-0.5"
              style={{ background: AMARELO, border: `3px solid ${AMARELO}` }}
            >
              {/* <img> puro, não next/image: a origem é um data: URI embutido
                  no documento, e não há o que o otimizador otimize. Sem
                  eslint-disable de propósito: a regra @next/next/* não está
                  registrada nesta config, e desabilitar regra inexistente é
                  erro de lint — o gate que derruba o build na Vercel. */}
              <img
                src={dados.foto}
                alt={dados.name}
                className="block h-full w-full rounded-full object-cover"
              />
            </div>
          ) : (
            // Sem retrato, a inicial ocupa o lugar — o grid de duas colunas
            // desmontaria se a primeira ficasse vazia.
            <div
              className="flex h-[100px] w-[100px] items-center justify-center rounded-full text-3xl font-extrabold"
              style={{ background: AMARELO, color: PRETO }}
              aria-hidden
            >
              {dados.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex min-w-0 flex-col">
            <span
              className="text-[11px] font-semibold uppercase"
              style={{ color: CINZA, letterSpacing: "0.14em" }}
            >
              {dados.eyebrow}
            </span>
            {dados.levelBadge && (
              <span
                className="mt-2 inline-flex self-start rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: AMARELO, color: PRETO }}
              >
                {dados.levelBadge}
              </span>
            )}
            <h2
              className="mt-2 text-[32px] font-extrabold leading-[1.05]"
              style={{ letterSpacing: "-0.5px" }}
            >
              {dados.name}
            </h2>
            {dados.role && (
              <p className="mt-1 text-sm font-bold" style={{ color: AMARELO }}>
                {dados.role}
              </p>
            )}
            {dados.company && (
              <p className="mt-[3px] text-[11px]" style={{ color: CINZA }}>
                {dados.company}
              </p>
            )}
          </div>
        </header>

        <Regua />

        {dados.motto && (
          <p
            className="rounded-lg px-4 py-3 text-[13px] italic leading-[1.4]"
            style={{ background: PAINEL, borderLeft: `3px solid ${AMARELO}` }}
          >
            “{dados.motto}”
          </p>
        )}

        <div>
          <Rotulo>Características Principais</Rotulo>
          <div
            className="flex flex-col items-center rounded-xl px-2 pb-1.5 pt-3"
            style={{ background: PAINEL }}
          >
            <RadarDeAtributos atributos={dados.attributes} />
            <p className="mt-0.5 text-center text-[10px] italic" style={{ color: AMARELO }}>
              Posicionamento em desenvolvimento ↑
            </p>
          </div>
        </div>

        {dados.strengths.length > 0 && (
          <div>
            <Rotulo>✦ Pontos Fortes</Rotulo>
            <div className="flex flex-col gap-1.5">
              {dados.strengths.map((t) => (
                <LinhaDaPilha key={t} texto={t} />
              ))}
            </div>
          </div>
        )}

        {dados.achievements.length > 0 && (
          <div>
            <Rotulo>◆ Conquistas do Mês</Rotulo>
            <div className="flex flex-col gap-1.5">
              {dados.achievements.map((t) => (
                <LinhaDaPilha key={t} texto={t} />
              ))}
            </div>
          </div>
        )}

        {(dados.improvements.length > 0 || dados.studies.length > 0) && (
          <div className="grid grid-cols-2 gap-2.5">
            {dados.improvements.length > 0 && (
              <div className="rounded-lg p-3" style={{ background: PAINEL }}>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-white">
                  <span style={{ color: AMARELO }}>→</span> PONTOS DE MELHORIA
                </div>
                <ul className="flex flex-col gap-1.5">
                  {dados.improvements.map((t) => (
                    <li
                      key={t}
                      className="relative pl-3.5 text-[13px] leading-[1.35] text-white"
                    >
                      <span
                        className="absolute left-0 top-0 text-[11px] font-bold"
                        style={{ color: AMARELO }}
                        aria-hidden
                      >
                        →
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dados.studies.length > 0 && (
              <div className="rounded-lg p-3" style={{ background: PAINEL }}>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-white">
                  □ ESTUDOS
                </div>
                <ul className="flex flex-col gap-1.5">
                  {dados.studies.map((t) => (
                    <li
                      key={t}
                      className="relative pl-3.5 text-[13px] leading-[1.35] text-white"
                    >
                      <span
                        className="absolute left-0 top-[5px] h-[5px] w-[5px]"
                        style={{ background: AMARELO }}
                        aria-hidden
                      />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* O ciclo mora dentro dos objetivos, como no documento: a barra é o
            andamento dos 90 dias, não uma seção separada. */}
        {(dados.goals.length > 0 || dados.cycle.label) && (
          <div>
            <Rotulo>Objetivos · Próximos 90 Dias</Rotulo>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-white">{dados.cycle.label}</span>
              <span className="shrink-0 text-[10px]" style={{ color: CINZA }}>
                {dados.cycle.monthOf}
              </span>
            </div>
            <div
              className="mb-3 h-1.5 overflow-hidden rounded-full"
              style={{ background: LINHA }}
              role="progressbar"
              aria-valuenow={dados.cycle.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={dados.cycle.label || "Progresso do ciclo"}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${dados.cycle.percent}%`, background: AMARELO }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {dados.goals.map((t, i) => (
                <div
                  key={t}
                  className="flex items-center gap-3.5 rounded-md px-3.5 py-2.5"
                  style={{ background: PAINEL }}
                >
                  <span className="shrink-0 text-sm font-extrabold" style={{ color: AMARELO }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="w-px shrink-0 self-stretch" style={{ background: LINHA }} />
                  <span className="text-sm leading-[1.35] text-white">{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Regua />

        <footer className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold"
              style={{ background: AMARELO, color: PRETO, letterSpacing: "-0.03em" }}
            >
              KL
            </span>
            <span className="text-xs font-bold text-white">LOYOLA DIGITAL</span>
          </div>
          <div className="text-right">
            <p className="text-[11px]" style={{ color: CINZA }}>
              {dados.issued}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-white">{dados.cardNumber}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
