/**
 * Story 19.15 — como cada tipo de etapa se chama na tela.
 *
 * ## Por que um módulo, e não texto no componente
 *
 * O mesmo rótulo era escrito à mão em **três** lugares: a tela de criar etapa
 * (`funnels/[funnelId]/page.tsx`), a de editar o tipo
 * (`stages/[stageId]/page.tsx`) e o card da etapa na lista (`stage-card.tsx`).
 * Três cópias derivam — e já tinham derivado: `application` era "Formulário +
 * venda" numa tela e "Formulário + venda por UTM" na outra. Aqui fica a versão
 * completa, e as três leem daqui.
 *
 * ## Por que em `lib/utils/`
 *
 * É o único lugar que o runner de teste do `web` coleta
 * (`vitest.config.ts` → `include: ["lib/utils/**\/*.test.ts", ...]`). Um teste
 * ao lado do componente nunca rodaria — mesma razão de
 * `top-criativos-visoes.ts`.
 *
 * ## O que esta story resolve
 *
 * Num funil **perpétuo**, a etapa de aquisição é gravada como `free` e a tela
 * a chamava de "Gratuita — Captação orgânica". O dashboard perpétuo já abria
 * certo (ele é escolhido por `funnel.type`, não pelo tipo da etapa); só o
 * rótulo mentia. Aqui ele passa a dizer "Perpétuo".
 *
 * ⚠️ **O valor gravado continua `free`.** Um `stage_type` novo desligaria, em
 * silêncio, as abas Cadeia CAC/Panorama (`classificarFamilia` → `null`), a
 * venda manual Pix, a entrada no CRM comercial e o sync diário — todos leem a
 * lista literal que inclui `"free"`. Ver a story para a tabela dos quatro.
 */

export interface RotuloDeEtapa {
  /** Nome do tipo, como aparece no botão e no badge do card. */
  titulo: string;
  /** Linha de apoio embaixo do título. Vazia quando o tipo é desconhecido. */
  descricao: string;
  /** Sugestão de nome ao criar a etapa. */
  placeholder: string;
}

const ROTULOS: Record<string, RotuloDeEtapa> = {
  free: {
    titulo: "Gratuita",
    descricao: "Captação orgânica",
    placeholder: "ex: Captação Orgânica",
  },
  paid: {
    titulo: "Paga",
    descricao: "Captação + tráfego",
    placeholder: "ex: Captação Paga",
  },
  application: {
    // A tela de criar dizia só "Formulário + venda"; a de editar, a versão
    // completa. Unificado na completa — ver o cabeçalho.
    titulo: "Aplicação",
    descricao: "Formulário + venda por UTM",
    placeholder: "ex: Aplicação Mentoria",
  },
  sales: {
    titulo: "Vendas",
    descricao: "Só planilha de vendas",
    placeholder: "ex: Vendas Produto Principal",
  },
  cpl: {
    titulo: "CPL",
    descricao: "Reuniões Zoom + retenção",
    placeholder: "ex: CPL Aula 1",
  },
  event: {
    titulo: "Evento Presencial",
    descricao: "Vendas no local + MemberKit",
    placeholder: "ex: Imersão Presencial",
  },
  event_capture: {
    titulo: "Captação de Evento",
    descricao: "Tráfego + ingressos",
    placeholder: "ex: Captação Imersão SP",
  },
  debriefing: {
    titulo: "Debriefing",
    descricao: "Docs HTML + comentários",
    placeholder: "ex: Debriefing DGPG-03",
  },
  mapa: {
    titulo: "Mapa",
    descricao: "Desenho do funil em blocos",
    placeholder: "ex: Mapa do Lançamento",
  },
  comercial: {
    titulo: "Comercial",
    descricao: "CRM kanban de compradores",
    placeholder: "ex: Comercial Upsell",
  },
  lyrio: {
    // Não é criável pelas telas — nasce do funil mobile. Está aqui porque o
    // card da etapa precisa saber desenhá-lo.
    titulo: "Lyrio",
    descricao: "App mobile — Meta + RevenueCat",
    placeholder: "ex: Lyrio",
  },
};

/** O que `free` vira quando o funil é perpétuo. */
const PERPETUO: RotuloDeEtapa = {
  titulo: "Perpétuo",
  descricao: "Aquisição contínua",
  placeholder: "ex: Aquisição",
};

/**
 * O rótulo de um tipo de etapa, no contexto do funil que o contém.
 *
 * Só `free` muda, e só em funil perpétuo. Os outros dez respondem igual em
 * qualquer funil — a etapa Comercial de um perpétuo é a mesma de um lançamento.
 *
 * Tipo desconhecido devolve **o próprio valor recebido**, não "Gratuita". O
 * `stage-card.tsx` fazia o contrário (cadeia de ternários com `: "Gratuita"` no
 * fim), e isso transformava dado estranho em rótulo plausível — o pior jeito de
 * errar, porque não dá para perceber olhando.
 */
export function rotuloDoTipoDeEtapa(
  stageType: string | null | undefined,
  funnelType: string | null | undefined,
): RotuloDeEtapa {
  if (!stageType) return { titulo: "—", descricao: "", placeholder: "ex: Etapa" };
  if (stageType === "free" && funnelType === "perpetual") return PERPETUO;
  return (
    ROTULOS[stageType] ?? { titulo: stageType, descricao: "", placeholder: "ex: Etapa" }
  );
}
