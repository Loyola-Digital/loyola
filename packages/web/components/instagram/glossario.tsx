"use client";

/**
 * O que cada palavra da tela significa.
 *
 * Fica fechado: quem lê a página todo dia não precisa dele, e quem recebe o
 * relatório pela primeira vez precisa muito. Esconder atrás de um clique é o
 * que deixa as duas pessoas usarem a mesma tela.
 */

const TERMOS: [string, string][] = [
  ["Alcance", "Quantas contas diferentes viram o conteúdo. Cada conta conta uma vez."],
  ["Visualizações", "Quantas vezes o conteúdo foi exibido. Maior que o alcance, porque a mesma conta pode ver mais de uma vez."],
  ["Interações", "Curtidas, comentários, compartilhamentos e salvamentos somados."],
  ["Engajamento", "Interações divididas pelo alcance. Mostra quanto do público reagiu."],
  ["Compartilhamento", "Alguém enviou o conteúdo para outra pessoa. Quando é alto, o conteúdo está se espalhando sozinho."],
  ["Salvamento", "Alguém guardou para ver depois. Indica conteúdo útil."],
  ["Não seguidores", "Parcela do alcance que ainda não seguia a conta. É a medida de público novo."],
  ["Visitas ao perfil", "Quantas vezes alguém abriu o perfil. É o primeiro passo depois de gostar do conteúdo."],
  ["Cliques na bio", "Toques no link do perfil. É o caminho para o grupo, a lista e a oferta."],
  ["Gancho de 3 segundos", "Só Reels: parcela de quem continuou assistindo depois dos 3 primeiros segundos."],
  ["Tempo médio", "Quanto tempo, em média, as pessoas assistiram ao Reels."],
  ["Interesse por mil", "Compartilhamentos mais salvamentos para cada mil contas alcançadas. Serve para comparar posts de tamanhos diferentes."],
  ["Status do post", "Forte: entre os 25% melhores do mesmo formato em interesse por mil. Fraco: entre os 25% piores. Na linha: o meio."],
  ["Tema do conteúdo", "O assunto de que o post trata — não o formato nem o objetivo. A IA sugere a partir da legenda e o social media revisa."],
  ["Mediana", "O valor do meio. Usamos no lugar da média porque um post viral puxa a média para cima."],
  ["Saídas sobre entradas", "De cada 100 seguidores que entraram, quantos saíram no mesmo período."],
];

export function Glossario() {
  return (
    <details className="rounded-xl border border-border/40 bg-card/60 p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Glossário: o que cada palavra significa
      </summary>
      <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {TERMOS.map(([termo, definicao]) => (
          <div key={termo}>
            <dt className="text-xs font-semibold">{termo}</dt>
            <dd className="text-xs text-muted-foreground">{definicao}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
