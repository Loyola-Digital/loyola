/**
 * Os funis da sidebar, agrupados por tipo SEM desfazer a ordem do servidor.
 *
 * ## Por que o grupo não tem ordem própria
 *
 * Tinha: perpétuo, depois lançamento, depois mobile. E era isso que anulava a
 * ordenação por atividade que a API manda — o grupo vinha primeiro por ser
 * perpétuo, não por ter algo recente dentro.
 *
 * Medido em produção: em "DG & CPDF", `dg-a1` (perpétuo, ARQUIVADO, mexido em
 * maio) encabeçava a lista, enquanto `dg-pg04` — mexido em setembro — ficava
 * abaixo dele. Em "FZ & MFB", `fz-m3-set-26`, editado no dia anterior, caía
 * atrás de `fz-a1`, de dois dias antes.
 *
 * Agora a posição do grupo é a do seu PRIMEIRO funil na lista do servidor.
 * O grupo herda de graça tudo o que o servidor já decide — atividade recente
 * na frente, arquivado no fim — em vez de reimplementar (e contradizer) essas
 * regras aqui.
 *
 * Vive fora do componente para poder ser testado: foi exatamente esta função
 * que desfez, sem ninguém notar, a ordenação recém-entregue.
 */

export interface FunilAgrupavel {
  id: string;
  type: string;
}

export function agruparPorTipo<T extends FunilAgrupavel>(
  funnels: T[],
): { tipo: string; funnels: T[] }[] {
  const porTipo = new Map<string, T[]>();
  for (const f of funnels) {
    const atual = porTipo.get(f.type);
    if (atual) atual.push(f);
    else porTipo.set(f.type, [f]);
  }
  // `Map` preserva a ordem de inserção, e a inserção segue a lista do
  // servidor: o primeiro grupo criado é o do funil mais recente. Tipo novo
  // aparece igual — a função só agrupa, nunca filtra.
  return [...porTipo.entries()].map(([tipo, funnels]) => ({ tipo, funnels }));
}
