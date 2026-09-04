/**
 * O nome da aba do navegador, conforme a tela aberta.
 *
 * ## Por que não `metadata` do Next
 *
 * O App Router monta o título a partir do `metadata` exportado por cada rota —
 * e `metadata` só existe em Server Component. Todas as telas aqui são
 * `"use client"`, então nenhuma delas pode exportá-lo, e a aba ficava sempre
 * com o `default` do layout raiz: "Loyola X" em tudo.
 *
 * Converter as telas para servidor por causa do título seria o rabo abanando o
 * cachorro. Um mapa de rota para nome, aplicado no cliente, resolve o mesmo
 * problema — e cobre também as rotas dinâmicas, que precisariam de
 * `generateMetadata` uma a uma.
 *
 * ## Por que importa
 *
 * Quem trabalha aqui deixa cinco abas abertas — BI, dois funis, o mapa e o
 * planner. Com todas dizendo "Loyola X", achar a certa é clicar em cada uma.
 */

/** Trecho fixo → nome. A ordem importa: o mais específico vem antes. */
const ROTAS: [prefixo: string, nome: string][] = [
  ["/pessoal", "Pessoal"],
  ["/planner", "Calendário"],
  ["/sprint-dashboard", "Sprint Semanal"],
  ["/funnel-maps", "Mapas de funil"],
  ["/conversations", "Conversations"],
  ["/minds", "Minds"],
  ["/bi", "BI"],
  ["/spy-conteudo", "Spy de Conteúdo"],
  ["/swipe-files", "Swipe Files"],
  ["/settings", "Configurações"],
  ["/tasks", "Tasks Agents"],
  ["/debriefings", "Debriefings"],
  ["/instagram", "Instagram"],
  ["/youtube", "YouTube"],
  ["/traffic", "Tráfego"],
  ["/pdi", "PDI"],
  ["/projects", "Empresas"],
  ["/entrar", "Entrar"],
];

/**
 * O nome da tela a partir do caminho.
 *
 * `null` quando não há um nome melhor que o padrão — a raiz, por exemplo. Quem
 * chama mantém "Loyola X" nesse caso, em vez de inventar rótulo para uma tela
 * que não tem.
 */
export function nomeDaRota(pathname: string): string | null {
  // As rotas de projeto são as mais profundas e a mais específica precisa
  // ganhar: `/projects/x/funnels/y/campaign-log` não é "Empresas".
  if (pathname.includes("/campaign-log")) return "Log de campanha";
  if (pathname.includes("/funnels/")) return "Funil";
  if (pathname.includes("/instagram")) return "Instagram";
  if (pathname.includes("/conversations")) return "Conversations";
  if (pathname.includes("/minds")) return "Minds";

  for (const [prefixo, nome] of ROTAS) {
    if (pathname === prefixo || pathname.startsWith(`${prefixo}/`)) return nome;
  }
  return null;
}

/**
 * O título completo da aba.
 *
 * `contexto` é o que dá utilidade real com várias abas: o nome da empresa, do
 * funil ou do mapa aberto. Sem ele, cinco abas de funil continuam
 * indistinguíveis — só que agora todas dizendo "Funil".
 */
export function tituloDaAba(pathname: string, contexto?: string | null): string {
  const base = nomeDaRota(pathname);
  const nome = contexto?.trim();

  if (nome && base) return `${nome} · ${base} | Loyola X`;
  if (nome) return `${nome} | Loyola X`;
  if (base) return `${base} | Loyola X`;
  return "Loyola X";
}
