"use client";

/**
 * De onde vem cada número desta página — e o que ainda não vem.
 *
 * Toda tela de dados carrega um combinado invisível: "isto aqui é automático,
 * aquilo alguém digitou, aquele outro ninguém mede". Quando o combinado fica
 * só na cabeça de quem montou, o time cobra decisão de um número que não
 * existe. Escrito, ele vira a lista do que falta ligar.
 */

type Situacao = "automatico" | "parcial" | "manual" | "faltando";

const CORES: Record<Situacao, string> = {
  automatico: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  parcial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  manual: "bg-muted text-muted-foreground",
  faltando: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const FONTES: { nome: string; situacao: Situacao; rotulo: string; detalhe: string }[] = [
  {
    nome: "Insights do Instagram",
    situacao: "automatico",
    rotulo: "Automático",
    detalhe:
      "Posts, alcance, salvamentos, compartilhamentos, gancho de 3 s, tempo médio e audiência chegam pela Graph API. A Meta guarda 2 anos; o histórico aqui começa quando a conta foi ligada.",
  },
  {
    nome: "Prévia e link dos posts",
    situacao: "automatico",
    rotulo: "Automático",
    detalhe: "Miniatura e permalink vêm do Instagram. O vínculo com etapa do funil é o botão na tabela de posts.",
  },
  {
    nome: "Seguidores por Reels",
    situacao: "manual",
    rotulo: "Digitado",
    detalhe:
      "A Meta não entrega seguidores por Reels — só por foto e carrossel. Na tabela, a célula é editável: o número vem do painel do Instagram.",
  },
  {
    nome: "Tema do conteúdo",
    situacao: "parcial",
    rotulo: "Sugerido e revisado",
    detalhe:
      "A IA lê a legenda e sugere uma etiqueta; o social media confirma ou corrige na coluna Tema da tabela de posts. Em itálico é o que ainda não passou por revisão.",
  },
  {
    nome: "Tipo de chamada (CTA)",
    situacao: "faltando",
    rotulo: "Não existe ainda",
    detalhe:
      "Grupo, isca, publi ou sem chamada — sairia da legenda como o tema. Sem isso não dá para dizer qual chamada converte.",
  },
  {
    nome: "Leads por origem",
    situacao: "faltando",
    rotulo: "Falta ligar",
    detalhe:
      "O funil da Visão geral vai até o clique na bio e para ali. Fechar até o lead exige link rastreado na bio, para casar o clique com as etapas de lead do funil.",
  },
  {
    nome: "Stories",
    situacao: "parcial",
    rotulo: "Parcial",
    detalhe:
      "O Instagram guarda 24 h. Medir exige fotografar a cada poucas horas; hoje a tela mostra os stories ativos no momento da consulta.",
  },
  {
    nome: "Metas do mês",
    situacao: "manual",
    rotulo: "Digitado",
    detalhe:
      "Definidas no botão Editar metas, aqui mesmo nesta aba, por mês e por formato. Mês sem meta aparece sem cor: o sistema não inventa o que se esperava.",
  },
  {
    nome: "Impulsionamentos",
    situacao: "manual",
    rotulo: "Digitado",
    detalhe: "Lidos do painel de anúncios. A API de anúncios da Meta traz valor e resultado por post — ainda não ligada aqui.",
  },
];

export function DeOndeVemODado() {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60">
      <div className="border-b border-border/40 p-4">
        <h3 className="text-base font-semibold">De onde vem cada dado</h3>
        <p className="text-xs text-muted-foreground">
          O que já chega sozinho, o que ainda é digitado e o que ninguém mede.
        </p>
      </div>
      <ul className="divide-y divide-border/40">
        {FONTES.map((f) => (
          <li key={f.nome} className="grid gap-1 p-3 sm:grid-cols-[minmax(0,13rem)_7rem_1fr] sm:items-baseline sm:gap-3">
            <span className="text-sm font-medium">{f.nome}</span>
            <span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CORES[f.situacao]}`}>
                {f.rotulo}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{f.detalhe}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
