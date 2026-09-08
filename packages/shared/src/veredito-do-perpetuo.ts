/**
 * Story 44.30 (AC2) — o veredito 🟢/🟡/🔴 do Resumão, por regra.
 *
 * ## Por que isto é código, e não uma instrução no prompt
 *
 * O Resumão de 06/09/2026 chamou de *"no ar e saudável"* uma operação com ROAS
 * de 7 dias em 1,47x contra meta de 2x, 30 dias em 1,86x e três dias negativos
 * na semana. Nenhuma regra foi violada — não havia regra. O agente julgou, e
 * julgou pelo que estava mais visível (connect rate de 90%), não pelo que
 * decide verba.
 *
 * Uma instrução em prosa não conserta isso: um LLM lendo "avalie a saúde da
 * operação" produz julgamento diferente a cada dia, e nenhum teste alcança essa
 * variação. **Determinístico e testável só existe em código.** O veredito vem
 * pronto no payload; o agente reporta a cor, não a escolhe.
 *
 * ## A regra é a do §3.4 do briefing, literal
 *
 * | cor | condição |
 * |---|---|
 * | 🟢 Saudável | ROAS 7d ≥ meta **e** ROAS 30d ≥ meta |
 * | 🟡 Atenção | uma das duas janelas abaixo da meta (não as duas); ou margem 7d entre 0 e 20% |
 * | 🔴 Alerta | ROAS 7d **e** 30d abaixo da meta; ou margem 7d ≤ 0; ou ≥ 3 dias negativos nos últimos 7 |
 *
 * ⚠️ **Uma divergência deliberada do briefing, e ela está aqui declarada.** O
 * texto lista as cores "na ordem", o que sugere avaliar 🟢 primeiro. Tomado ao
 * pé da letra, uma operação com as duas janelas na meta **e margem negativa**
 * sairia 🟢 — as condições de 🟢 e de 🔴 podem coexistir. Margem negativa é
 * queimar caixa, e chamar isso de saudável é a mesma classe de defeito que a
 * story existe para corrigir. **Aqui as condições de 🔴 dominam.** Se o dono do
 * produto preferir a ordem literal, é uma linha — mas a escolha fica explícita.
 *
 * ## A meta é 2x, constante, e o texto diz isso
 *
 * Decisão do dono do produto (08/09/2026). O briefing manda "ler do KPI set da
 * etapa", mas esse KPI set **não existe**: `[BBE-A1] KPIs Aquisição` é o nome da
 * planilha de vendas, e a meta de 2x é `target={2}` no dashboard. As três saídas
 * foram medidas; a escolha foi a constante, por dois motivos:
 *
 * 1. **2x é o número que o painel já mostra.** O Resumão passa a concordar com
 *    a tela, que é o ponto do Epic 44 inteiro.
 * 2. Derivar do ponto de equilíbrio responde a outra pergunta. Medido em 08/09:
 *    o `fz` a 1,471x fica **verde** por equilíbrio (1,205x) e **vermelho**
 *    contra a meta. "Não estou perdendo dinheiro" não é "bati a meta".
 *
 * `fonteDaMeta: "constante"` viaja no payload para o texto poder dizer que ela é
 * fixa, e não configurada por funil.
 *
 * ## O equilíbrio viaja junto, e não decide a cor
 *
 * `roasDeEquilibrio` = `1 ÷ (1 − taxas)`: abaixo dele cada venda sai no
 * prejuízo. Sem ele, "abaixo da meta" cobre tanto o `fz` (1,47x, lucrando)
 * quanto o `pps` (0,91x, queimando caixa) com a mesma cor — e são situações que
 * pedem ações opostas. Ele é **contexto**, acrescentado por decisão do dono do
 * produto; a cor continua saindo da regra do §3.4.
 */

/** As taxas que incidem em toda venda. Reembolso NÃO entra (é estimativa). */
export interface TaxasDaPlataforma {
  plataforma: number;
  imposto: number;
  outros: number;
}

export interface EntradaDoVeredito {
  /** ROAS dos últimos 7 dias. `null` = não medido — nunca `0` por ausência. */
  roas7d: number | null;
  /** ROAS dos últimos 30 dias. */
  roas30d: number | null;
  /** Margem de 7 dias em PONTOS PERCENTUAIS (14.89 = 14,89%). `null` = não medida. */
  margem7dPct: number | null;
  /** Quantos dos últimos 7 dias fecharam com margem negativa. `null` = não medido. */
  diasNegativosEm7: number | null;
  taxas: TaxasDaPlataforma;
}

export type Cor = "verde" | "amarelo" | "vermelho" | "semDado";

export interface Veredito {
  cor: Cor;
  /** "Saudável" · "Atenção" · "Alerta" · "Sem dado". */
  rotulo: string;
  /** A frase que explica a cor, sem jargão e sem código interno. */
  motivo: string;
  /**
   * A condição que disparou — o §5.4 do briefing exige dizer qual foi.
   * `null` só em `semDado`.
   */
  condicao:
    | "duasJanelasNaMeta"
    | "duasJanelasAbaixoDaMeta"
    | "margemNegativa"
    | "tresDiasNegativos"
    | "umaJanelaAbaixoDaMeta"
    | "margemApertada"
    | null;
  metaDeRoas: number;
  fonteDaMeta: "constante";
  /** `null` quando as taxas não permitem calcular. */
  roasDeEquilibrio: number | null;
  /** `true` = o ROAS de 7d está abaixo do equilíbrio (prejuízo por venda). */
  abaixoDoEquilibrio: boolean | null;
}

/**
 * A meta, fixa. Espelha `target={2}` do dashboard perpétuo — se um dia virar
 * configuração, os dois lados mudam juntos ou voltam a divergir.
 */
export const META_DE_ROAS = 2;

/** Teto da margem "apertada" que o §3.4 marca como 🟡. */
const MARGEM_APERTADA_PCT = 20;

/** A partir de quantos dias negativos em 7 o §3.4 manda 🔴. */
const DIAS_NEGATIVOS_PARA_ALERTA = 3;

export function roasDeEquilibrio(t: TaxasDaPlataforma): number | null {
  const soma = t.plataforma + t.imposto + t.outros;
  if (!(soma >= 0) || soma >= 1) return null;
  return 1 / (1 - soma);
}

export function vereditoDoPerpetuo(e: EntradaDoVeredito): Veredito {
  const equilibrio = roasDeEquilibrio(e.taxas);
  const base = {
    metaDeRoas: META_DE_ROAS,
    fonteDaMeta: "constante" as const,
    roasDeEquilibrio: equilibrio,
    abaixoDoEquilibrio:
      equilibrio === null || e.roas7d === null ? null : e.roas7d < equilibrio,
  };

  // ── Ausência ────────────────────────────────────────────────
  // Sem as duas janelas não há regra a aplicar, e pintar de qualquer cor
  // afirmaria uma medição que não houve (regra 7.4 da spec).
  if (e.roas7d === null || e.roas30d === null) {
    /**
     * ⚠️ O texto diz QUAL janela faltou, e cita a que existe.
     *
     * Medido no `pps` em 08/09: 7 dias sem nenhum investimento e 30 dias em
     * 0,91x. "Sem dado" sozinho manda o leitor a lugar nenhum — e o fato de a
     * mídia ter PARADO é informação de gestão, não ausência de informação. A
     * regra do §3.4 exige as duas janelas para dar cor, e ela é respeitada; o
     * que muda é a frase não jogar fora o que se sabe.
     */
    const qual =
      e.roas7d === null && e.roas30d === null
        ? "Não houve investimento de mídia nas duas janelas (7 e 30 dias)"
        : e.roas7d === null
          ? "Não houve investimento de mídia nos últimos 7 dias"
          : "Não houve investimento de mídia nos últimos 30 dias";
    const oQueSeSabe =
      e.roas7d === null && e.roas30d !== null
        ? ` Nos 30 dias, o ROAS foi de ${fmt(e.roas30d)}x contra meta de ${fmt(META_DE_ROAS)}x.`
        : e.roas30d === null && e.roas7d !== null
          ? ` Nos 7 dias, o ROAS foi de ${fmt(e.roas7d)}x contra meta de ${fmt(META_DE_ROAS)}x.`
          : "";
    return {
      ...base,
      cor: "semDado",
      rotulo: "Sem dado",
      condicao: null,
      motivo: `${qual}, então não há veredito a dar.${oQueSeSabe}`,
    };
  }

  const sete = e.roas7d >= META_DE_ROAS;
  const trinta = e.roas30d >= META_DE_ROAS;
  const janelas = `ROAS de ${fmt(e.roas7d)}x em 7 dias e ${fmt(e.roas30d)}x em 30, contra meta de ${fmt(META_DE_ROAS)}x`;

  // ── 🔴, e ele domina ────────────────────────────────────────
  // Ver a nota do cabeçalho: a ordem literal do briefing deixaria margem
  // negativa passar por "saudável" quando as duas janelas batessem a meta.
  if (e.margem7dPct !== null && e.margem7dPct <= 0) {
    return {
      ...base,
      cor: "vermelho",
      rotulo: "Alerta",
      condicao: "margemNegativa",
      motivo: `A margem dos últimos 7 dias está negativa (${fmt(e.margem7dPct)}%). ${cap(janelas)}.`,
    };
  }

  if (e.diasNegativosEm7 !== null && e.diasNegativosEm7 >= DIAS_NEGATIVOS_PARA_ALERTA) {
    return {
      ...base,
      cor: "vermelho",
      rotulo: "Alerta",
      condicao: "tresDiasNegativos",
      motivo: `${e.diasNegativosEm7} dos últimos 7 dias fecharam com margem negativa. ${cap(janelas)}.`,
    };
  }

  if (!sete && !trinta) {
    return {
      ...base,
      cor: "vermelho",
      rotulo: "Alerta",
      condicao: "duasJanelasAbaixoDaMeta",
      motivo: `${cap(janelas)} — as duas janelas abaixo.`,
    };
  }

  // ── 🟡 pela margem ──────────────────────────────────────────
  // ⚠️ **Antes do 🟢, e de propósito.** No §3.4 a margem apertada é gatilho
  // INDEPENDENTE de amarelo ("...; ou margem 7d entre 0 e 20%"), não um
  // desempate entre as janelas. Checá-la depois do verde faria uma operação com
  // as duas janelas na meta e margem de 15% sair 🟢 — que é o contrário do que
  // o briefing pede, e a primeira versão desta função fazia isso.
  if (e.margem7dPct !== null && e.margem7dPct < MARGEM_APERTADA_PCT) {
    return {
      ...base,
      cor: "amarelo",
      rotulo: "Atenção",
      condicao: "margemApertada",
      motivo: `A margem dos últimos 7 dias está em ${fmt(e.margem7dPct)}%, apertada. ${cap(janelas)}.`,
    };
  }

  // ── 🟢 ──────────────────────────────────────────────────────
  if (sete && trinta) {
    return {
      ...base,
      cor: "verde",
      rotulo: "Saudável",
      condicao: "duasJanelasNaMeta",
      motivo: `${cap(janelas)} — as duas janelas na meta.`,
    };
  }

  return {
    ...base,
    cor: "amarelo",
    rotulo: "Atenção",
    condicao: "umaJanelaAbaixoDaMeta",
    motivo: `${cap(janelas)} — ${sete ? "os 30 dias" : "os 7 dias"} abaixo.`,
  };
}

/** Duas casas, vírgula decimal — o texto vai para gente, não para máquina. */
function fmt(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
