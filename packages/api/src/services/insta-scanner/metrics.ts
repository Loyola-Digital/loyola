/**
 * Spy de Conteúdo — todas as métricas do relatório, calculadas EM CÓDIGO.
 *
 * A divisão é proposital: nenhum número aqui vem do LLM. A Claude recebe estas
 * métricas já prontas e só faz a leitura qualitativa em cima — sem espaço pra
 * alucinar estatística. Portado 1:1 de `src/metrics.js` do CLI.
 */

import type { ScanMetrics, ScanPost, ScanProfile } from "./types.js";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const FAIXAS = [
  { label: "00–06h", from: 0, to: 6 },
  { label: "06–09h", from: 6, to: 9 },
  { label: "09–12h", from: 9, to: 12 },
  { label: "12–15h", from: 12, to: 15 },
  { label: "15–18h", from: 15, to: 18 },
  { label: "18–21h", from: 18, to: 21 },
  { label: "21–24h", from: 21, to: 24 },
];

const avg = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Engajamento absoluto. null quando as DUAS contagens estão ocultas. */
export function engagement(post: ScanPost): number | null {
  if (post.likesCount === null && post.commentsCount === null) return null;
  return (post.likesCount ?? 0) + (post.commentsCount ?? 0);
}

/** Timestamp do Instagram vem em UTC; converte pro fuso escolhido. */
function localParts(timestamp: string, tzOffset: number) {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  const shifted = new Date(ms + tzOffset * 3_600_000);
  return {
    ms,
    hora: shifted.getUTCHours(),
    diaSemana: shifted.getUTCDay(),
    mes: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

type Enriched = ScanPost & { ms: number; hora: number; diaSemana: number; mes: string; engajamento: number | null };

export function computeMetrics(
  profile: ScanProfile,
  posts: ScanPost[],
  options: { tzOffset?: number } = {},
): ScanMetrics {
  const tzOffset = options.tzOffset ?? -3;
  const valid = posts.filter((p) => p.timestamp);

  const enriched: Enriched[] = valid
    .map((p) => {
      const parts = localParts(p.timestamp as string, tzOffset);
      if (!parts) return null;
      return { ...p, ...parts, engajamento: engagement(p) };
    })
    .filter((p): p is Enriched => p !== null);

  const comEngajamento = enriched.filter((p) => p.engajamento !== null);
  const likes = enriched.map((p) => p.likesCount).filter((v): v is number => v !== null);
  const comentarios = enriched.map((p) => p.commentsCount).filter((v): v is number => v !== null);
  const engajamentos = comEngajamento.map((p) => p.engajamento as number);

  const timestamps = enriched.map((p) => p.ms).sort((a, b) => a - b);
  const primeiro = timestamps[0] ?? null;
  const ultimo = timestamps[timestamps.length - 1] ?? null;
  const dias = primeiro && ultimo ? Math.max(1, (ultimo - primeiro) / 86_400_000) : 0;

  const reels = enriched.filter((p) => p.formato === "Reel");
  const views = reels.map((p) => p.videoViewCount).filter((v): v is number => v !== null && v > 0);
  const duracoes = reels.map((p) => p.videoDuration).filter((v): v is number => v !== null && v > 0);

  const followers = profile.followersCount || 0;
  const mediaEngajamento = avg(engajamentos);

  return {
    tzOffset,
    janela: {
      primeiro: primeiro ? new Date(primeiro).toISOString() : null,
      ultimo: ultimo ? new Date(ultimo).toISOString() : null,
      dias: Math.round(dias),
    },
    totais: {
      analisados: enriched.length,
      reels: reels.length,
      carrosseis: enriched.filter((p) => p.formato === "Carrossel").length,
      imagens: enriched.filter((p) => p.formato === "Imagem").length,
      patrocinados: enriched.filter((p) => p.isSponsored).length,
      comEngajamentoVisivel: comEngajamento.length,
    },
    frequencia: {
      porSemana: dias ? +((enriched.length / dias) * 7).toFixed(2) : 0,
      porMes: dias ? +((enriched.length / dias) * 30).toFixed(1) : 0,
      intervaloMedioDias: enriched.length > 1 ? +(dias / (enriched.length - 1)).toFixed(1) : null,
    },
    engajamento: {
      mediaCurtidas: Math.round(avg(likes)),
      medianaCurtidas: Math.round(median(likes)),
      mediaComentarios: Math.round(avg(comentarios)),
      medianaComentarios: Math.round(median(comentarios)),
      media: Math.round(mediaEngajamento),
      mediana: Math.round(median(engajamentos)),
      taxaPorSeguidor: followers ? +((mediaEngajamento / followers) * 100).toFixed(2) : null,
      razaoComentarioCurtida:
        avg(likes) > 0 ? +((avg(comentarios) / avg(likes)) * 100).toFixed(2) : null,
    },
    reels: {
      total: reels.length,
      mediaViews: views.length ? Math.round(avg(views)) : null,
      medianaViews: views.length ? Math.round(median(views)) : null,
      duracaoMediaSeg: duracoes.length ? +avg(duracoes).toFixed(1) : null,
      taxaEngajamentoPorView:
        views.length && reels.length
          ? +(
              (avg(reels.filter((p) => p.engajamento !== null).map((p) => p.engajamento as number)) /
                avg(views)) *
              100
            ).toFixed(2)
          : null,
      alcanceVsSeguidores: views.length && followers ? +(avg(views) / followers).toFixed(2) : null,
    },
    formatos: buildFormatos(enriched),
    topPosts: [...comEngajamento]
      .sort((a, b) => (b.engajamento as number) - (a.engajamento as number))
      .slice(0, 10)
      .map((p) => ({ ...p, engajamento: p.engajamento as number })),
    hashtags: buildHashtags(enriched),
    porMes: buildPorMes(enriched),
    porDiaSemana: buildPorDiaSemana(enriched),
    porFaixaHorario: buildPorFaixa(enriched),
    legenda: buildLegenda(enriched),
  };
}

function buildFormatos(posts: Enriched[]) {
  const grupos = new Map<string, Enriched[]>();
  for (const p of posts) {
    if (!grupos.has(p.formato)) grupos.set(p.formato, []);
    (grupos.get(p.formato) as Enriched[]).push(p);
  }
  return [...grupos.entries()]
    .map(([formato, itens]) => {
      const eng = itens.map((p) => p.engajamento).filter((v): v is number => v !== null);
      return {
        formato,
        posts: itens.length,
        share: +((itens.length / posts.length) * 100).toFixed(1),
        engajamentoMedio: Math.round(avg(eng)),
      };
    })
    .sort((a, b) => b.posts - a.posts);
}

function buildHashtags(posts: Enriched[]) {
  const mapa = new Map<string, Enriched[]>();
  for (const p of posts) {
    for (const tag of new Set(p.hashtags)) {
      if (!mapa.has(tag)) mapa.set(tag, []);
      (mapa.get(tag) as Enriched[]).push(p);
    }
  }
  return [...mapa.entries()]
    .map(([tag, itens]) => {
      const eng = itens.map((p) => p.engajamento).filter((v): v is number => v !== null);
      return { tag, usos: itens.length, engajamentoMedio: Math.round(avg(eng)) };
    })
    .sort((a, b) => b.usos - a.usos || b.engajamentoMedio - a.engajamentoMedio)
    .slice(0, 15);
}

function buildPorMes(posts: Enriched[]) {
  const mapa = new Map<string, Enriched[]>();
  for (const p of posts) {
    if (!mapa.has(p.mes)) mapa.set(p.mes, []);
    (mapa.get(p.mes) as Enriched[]).push(p);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, itens]) => {
      const eng = itens.map((p) => p.engajamento).filter((v): v is number => v !== null);
      return { mes, posts: itens.length, engajamentoMedio: Math.round(avg(eng)) };
    });
}

function buildPorDiaSemana(posts: Enriched[]) {
  return DIAS.map((dia, index) => {
    const itens = posts.filter((p) => p.diaSemana === index);
    const eng = itens.map((p) => p.engajamento).filter((v): v is number => v !== null);
    return { dia, curto: dia.slice(0, 3), posts: itens.length, engajamentoMedio: Math.round(avg(eng)) };
  });
}

function buildPorFaixa(posts: Enriched[]) {
  return FAIXAS.map(({ label, from, to }) => {
    const itens = posts.filter((p) => p.hora >= from && p.hora < to);
    const eng = itens.map((p) => p.engajamento).filter((v): v is number => v !== null);
    return { faixa: label, posts: itens.length, engajamentoMedio: Math.round(avg(eng)) };
  });
}

function buildLegenda(posts: Enriched[]) {
  const tamanhos = posts.map((p) => p.caption.length);
  const buckets = [
    { label: "Até 120", min: 0, max: 120 },
    { label: "121–400", min: 121, max: 400 },
    { label: "401–900", min: 401, max: 900 },
    { label: "900+", min: 901, max: Infinity },
  ];
  return {
    mediaCaracteres: Math.round(avg(tamanhos)),
    medianaCaracteres: Math.round(median(tamanhos)),
    buckets: buckets.map(({ label, min, max }) => {
      const itens = posts.filter((p) => p.caption.length >= min && p.caption.length <= max);
      const eng = itens.map((p) => p.engajamento).filter((v): v is number => v !== null);
      return { faixa: label, posts: itens.length, engajamentoMedio: Math.round(avg(eng)) };
    }),
  };
}
