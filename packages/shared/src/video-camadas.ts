// ============================================================
// Story 43.8 — o vídeo como três camadas independentes.
//
// A premissa do gestor: cada taxa é CONDICIONAL à anterior, então elas isolam o
// desempenho de partes diferentes do criativo — não do vídeo inteiro. É isso
// que autoriza recombinar abertura de um com promessa de outro.
//
//   abertura  (0-3s)    → play rate         visual, movimento, pattern interrupt
//   promessa  (3-15s)   → conversão do hook copy, gancho, curiosidade
//   corpo     (15-75%)  → retenção do body  ritmo, prova, edição
//
// ## Módulo folha, de propósito
//
// Sem nenhum import — mesmo desenho de `stage-types.ts` e `contract.ts`, e pelo
// mesmo motivo: o webpack do Next não resolve a cadeia NodeNext do `index.ts`, e
// o web consome isto por `@loyola-x/shared/src/video-camadas`.
//
// ## O que a medição de 2026-08-25 estabeleceu
//
// 188 criativos com ≥50 reproduções de 3s:
//
// ```
//                               MEDIANA   MÁXIMO   alvo
//    Play rate    (3s ÷ impr)     23,8%    70,8%   90%
//    Conv. hook   (15s ÷ 3s)      25,9%    72,2%   60%
//    Retenção body (p75 ÷ 3s)     11,4%    49,9%   10%
// ```
//
// ⚠️ O alvo do play rate (90%) está ACIMA do melhor criativo da conta (70,8%).
// Decisão do gestor: manter as fórmulas e os alvos como estão, com o desenho de
// `alvoVigente` (44.9) permitindo que o benchmark da conta entre no lugar. Por
// isso `avaliarContraAlvo` devolve `nenhumAtinge` — a tela precisa poder dizer
// "o alvo pode estar mal calibrado" em vez de deixar o gestor concluir que todo
// o inventário é ruim.
// ============================================================

export type Camada = "abertura" | "promessa" | "corpo";

/** O mínimo que um criativo precisa expor. Contagens, nunca taxas. */
export interface CriativoDeVideo {
  adId: string;
  adName: string;
  impressoes: number;
  /** `video_view` — reproduções de 3s. `null` fora da janela sincronizada. */
  views3s: number | null;
  /** ThruPlay: completou OU assistiu ≥15s. Não existe `video_15_sec` na API. */
  thruplay: number | null;
  /** ⚠️ Inclui quem PULOU até 75%. */
  p75: number | null;
}

export interface TaxasDoVideo {
  /** 3s ÷ impressões. Decisão do gestor (2026-08-25) sobre o denominador. */
  playRate: number | null;
  /** ThruPlay ÷ 3s. */
  conversaoDoHook: number | null;
  /** p75 ÷ 3s. É o `holdRate` que já existia. */
  retencaoDoBody: number | null;
}

/** Os alvos do gestor. Ver o aviso sobre o play rate no topo. */
export const ALVOS: Record<Camada, number> = {
  abertura: 0.9,
  promessa: 0.6,
  corpo: 0.1,
};

/**
 * Piso de reproduções de 3s para a taxa não ser ruído.
 *
 * Com 50, sobram 188 dos 1.214 criativos com vídeo. Sem piso, um criativo com
 * 3 reproduções e 100% de retenção lideraria o ranking do corpo.
 */
export const PISO_DE_REPRODUCOES = 50;

function div(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b <= 0) return null;
  return a / b;
}

export function calcularTaxas(c: CriativoDeVideo): TaxasDoVideo {
  return {
    playRate: div(c.views3s, c.impressoes > 0 ? c.impressoes : null),
    conversaoDoHook: div(c.thruplay, c.views3s),
    retencaoDoBody: div(c.p75, c.views3s),
  };
}

/** A taxa de cada camada, para não repetir o switch em cada consumidor. */
export function taxaDaCamada(t: TaxasDoVideo, camada: Camada): number | null {
  if (camada === "abertura") return t.playRate;
  if (camada === "promessa") return t.conversaoDoHook;
  return t.retencaoDoBody;
}

export const ROTULO_DA_CAMADA: Record<Camada, string> = {
  abertura: "Abertura (0-3s)",
  promessa: "Promessa (3-15s)",
  corpo: "Corpo (até 75%)",
};

export const ROTULO_DA_TAXA: Record<Camada, string> = {
  abertura: "Play rate",
  promessa: "Conversão do hook",
  corpo: "Retenção do body",
};

export interface CriativoAvaliado extends CriativoDeVideo {
  taxas: TaxasDoVideo;
  /** Abaixo do piso: fica fora de ranking e de sugestão (AC3). */
  amostraBaixa: boolean;
  /** O ângulo inferido do nome — base da checagem de coerência (AC6). */
  angulo: string | null;
}

/**
 * O "ângulo" de um criativo, a partir do nome.
 *
 * Convenção desta conta: os nomes carregam o tema depois do último `--`, como
 * em `ad21-dg-pg04-jul26--delegue-60_-da-sua-produção`. É heurística, não
 * verdade — e é por isso que a coerência vira ALERTA, nunca bloqueio (AC6).
 */
export function anguloDoNome(adName: string): string | null {
  const partes = adName.split("--").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const ultimo = partes[partes.length - 1];
  return ultimo.length >= 4 ? ultimo.toLowerCase() : null;
}

export function avaliar(criativos: CriativoDeVideo[]): CriativoAvaliado[] {
  return criativos.map((c) => ({
    ...c,
    taxas: calcularTaxas(c),
    amostraBaixa: (c.views3s ?? 0) < PISO_DE_REPRODUCOES,
    angulo: anguloDoNome(c.adName),
  }));
}

/**
 * Ranking por camada, INDEPENDENTE em cada uma (AC4).
 *
 * O campeão de abertura pode não ser o de corpo — é justamente essa divergência
 * que autoriza a remontagem.
 */
export function ranquearPorCamada(
  avaliados: CriativoAvaliado[],
  camada: Camada,
): CriativoAvaliado[] {
  return avaliados
    .filter((c) => !c.amostraBaixa && taxaDaCamada(c.taxas, camada) !== null)
    .sort((a, b) => (taxaDaCamada(b.taxas, camada) ?? 0) - (taxaDaCamada(a.taxas, camada) ?? 0));
}

export interface AvaliacaoContraAlvo {
  camada: Camada;
  alvo: number;
  /** Mediana da conta — o benchmark que o desenho da 44.9 usa de alternativa. */
  medianaDaConta: number | null;
  quantosAtingem: number;
  total: number;
  /**
   * Ninguém atinge o alvo. A tela precisa dizer isso: um painel todo vermelho
   * significa "alvo mal calibrado" com a mesma frequência que "inventário ruim",
   * e só quem definiu o alvo pode decidir qual dos dois é.
   */
  nenhumAtinge: boolean;
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function avaliarContraAlvo(
  avaliados: CriativoAvaliado[],
  camada: Camada,
  alvoConfigurado?: number | null,
): AvaliacaoContraAlvo {
  // Mesmo desenho de `alvoVigente` (44.9): o configurado tem precedência, e a
  // conta entra como referência quando não há um.
  const alvo = alvoConfigurado ?? ALVOS[camada];
  const taxas = avaliados
    .filter((c) => !c.amostraBaixa)
    .map((c) => taxaDaCamada(c.taxas, camada))
    .filter((v): v is number => v !== null);
  const quantosAtingem = taxas.filter((v) => v >= alvo).length;
  return {
    camada,
    alvo,
    medianaDaConta: mediana(taxas),
    quantosAtingem,
    total: taxas.length,
    nenhumAtinge: taxas.length > 0 && quantosAtingem === 0,
  };
}

export type ClasseDoCriativo = "padrao_ouro" | "fraco_nos_tres" | "recombinavel";

/**
 * Classifica o criativo (AC7).
 *
 * `padrao_ouro` e `fraco_nos_tres` NÃO são matéria-prima de remontagem: o
 * primeiro já funciona inteiro, e o segundo não tem de onde tirar parte boa.
 *
 * A régua é a mediana da conta, não o alvo: com o alvo do play rate acima do
 * melhor criativo, NENHUM vídeo seria padrão-ouro e a categoria ficaria vazia
 * para sempre.
 */
export function classificar(
  c: CriativoAvaliado,
  medianas: Record<Camada, number | null>,
): ClasseDoCriativo {
  const camadas: Camada[] = ["abertura", "promessa", "corpo"];
  let acima = 0;
  let comparadas = 0;
  for (const cam of camadas) {
    const v = taxaDaCamada(c.taxas, cam);
    const med = medianas[cam];
    if (v === null || med === null) continue;
    comparadas++;
    if (v >= med) acima++;
  }
  if (comparadas < 3) return "recombinavel";
  if (acima === 3) return "padrao_ouro";
  if (acima === 0) return "fraco_nos_tres";
  return "recombinavel";
}

export interface Remontagem {
  abertura: CriativoAvaliado;
  promessa: CriativoAvaliado;
  corpo: CriativoAvaliado;
  /** Os três vêm do mesmo ângulo? */
  coerente: boolean;
  /** A nota do AC6 — por que é coerente, ou o alerta de incompatibilidade. */
  nota: string;
}

/**
 * Sugestões de remontagem (AC5/AC6).
 *
 * Cruza os campeões de cada camada. Uma sugestão em que os três vêm do mesmo
 * vídeo não é remontagem — é o padrão-ouro, e sai da lista.
 *
 * ## Por que a coerência não é filtro
 *
 * Observação do gestor: a promessa do hook cria uma expectativa que o corpo
 * precisa pagar. Um corpo campeão de retenção porque conta uma história
 * específica pode não fazer sentido colado a um hook que promete outra coisa.
 *
 * Mas o ângulo é inferido do NOME, por convenção — heurística, não verdade.
 * Descartar combinações por ela esconderia sugestões boas cujo nome não segue o
 * padrão. Então toda combinação aparece, com a nota dizendo o que se sabe.
 */
export function sugerirRemontagens(
  avaliados: CriativoAvaliado[],
  limite = 3,
): Remontagem[] {
  const rAbertura = ranquearPorCamada(avaliados, "abertura");
  const rPromessa = ranquearPorCamada(avaliados, "promessa");
  const rCorpo = ranquearPorCamada(avaliados, "corpo");
  if (!rAbertura.length || !rPromessa.length || !rCorpo.length) return [];

  const out: Remontagem[] = [];
  const vistos = new Set<string>();

  for (let i = 0; i < limite; i++) {
    const a = rAbertura[i];
    const p = rPromessa[i];
    const c = rCorpo[i];
    if (!a || !p || !c) break;
    // Os três iguais = padrão-ouro, não remontagem.
    if (a.adId === p.adId && p.adId === c.adId) continue;
    const chave = `${a.adId}|${p.adId}|${c.adId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    /**
     * A coerência que importa é entre PROMESSA e CORPO.
     *
     * Nota do gestor: a abertura é visual — movimento, pattern interrupt — e
     * "quase não depende do que está sendo dito". Já a promessa cria uma
     * expectativa que o corpo precisa pagar. Exigir os três do mesmo ângulo
     * descartaria combinações legítimas: uma abertura que só prende o olho
     * funciona sobre qualquer promessa.
     */
    const parCritico = p.angulo !== null && c.angulo !== null && p.angulo === c.angulo;
    const coerente = parCritico;
    const aberturaDivergente = parCritico && a.angulo !== null && a.angulo !== p.angulo;

    let nota: string;
    if (parCritico && !aberturaDivergente) {
      nota = `A promessa e o corpo tratam do mesmo ângulo ("${p.angulo}") — o corpo paga a expectativa que o hook cria.`;
    } else if (parCritico) {
      nota = `A promessa e o corpo tratam do mesmo ângulo ("${p.angulo}"), que é o par que precisa bater. A abertura vem de outro criativo ("${a.angulo}") — como ela é visual, isso costuma ser aceitável.`;
    } else if (p.angulo === null || c.angulo === null) {
      nota =
        "Não foi possível inferir o ângulo pelo nome. Confira se a promessa do hook e a história do corpo tratam da mesma oferta antes de montar.";
    } else {
      nota = `⚠️ A promessa fala de "${p.angulo}" e o corpo de "${c.angulo}". O corpo pode não pagar a expectativa que o hook cria — verifique antes de montar.`;
    }
    out.push({ abertura: a, promessa: p, corpo: c, coerente, nota });
  }
  return out;
}
