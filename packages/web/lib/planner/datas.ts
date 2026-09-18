/**
 * As contas de data do Planner, no cliente.
 *
 * ## Por que existe uma cópia do servidor
 *
 * Arrastar uma barra recalcula datas a cada movimento do mouse. Perguntar ao
 * servidor a cada pixel seria absurdo, e esperar a resposta para desenhar faria
 * a barra andar depois do cursor. A tela precisa das mesmas contas localmente.
 *
 * O servidor continua sendo a autoridade: ele normaliza tudo que recebe. Se as
 * duas divergirem, vale a dele — e o resultado dele volta na resposta.
 *
 * ## O truque do meio-dia
 *
 * Ao virar `Date` para somar dias, a hora é 12:00. Num dia de mudança de
 * horário de verão, meia-noite pode não existir ou existir duas vezes, e somar
 * 24h a partir dali erra o dia. Ao meio-dia sobram doze horas de folga.
 */

export interface Fase {
  id: string;
  name: string;
  /** ISO `YYYY-MM-DD`, ou `""` quando ainda não foi definida. */
  start: string;
  end: string;
  /**
   * O evento correspondente na agenda do Google.
   *
   * Declarado aqui para que o campo ATRAVESSE a tela intacto: uma fase editada
   * volta ao servidor com o vínculo, e o espelhamento sabe que evento mexer.
   */
  googleEventId?: string;
}

export interface Campanha {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  projectId: string | null;
  phases: Fase[];
  /** Agenda do Google que espelha esta campanha. `null` = vive só aqui. */
  googleCalendarId?: string | null;
}

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

export function ehData(iso: string): boolean {
  if (!FORMATO.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a!, m! - 1, d!, 12);
  // Rejeita 31 de fevereiro: o `Date` aceita e rola para março em silêncio.
  return dt.getFullYear() === a && dt.getMonth() === m! - 1 && dt.getDate() === d;
}

export function paraData(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, d!, 12, 0, 0);
}

export function paraIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dias entre duas datas, exclusivo: `08→11` = 3, como se lê num cronograma. */
export function dias(inicio: string, fim: string): number {
  return Math.round((paraData(fim).getTime() - paraData(inicio).getTime()) / 86_400_000);
}

export function somarDias(iso: string, n: number): string {
  const d = paraData(iso);
  d.setDate(d.getDate() + n);
  return paraIso(d);
}

/** `2026-09-08` → `08/09/26`. */
export function br(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

export function hojeIso(): string {
  return paraIso(new Date());
}

/** O intervalo da campanha inteira, ou `null` sem fase datada. */
export function periodo(fases: Fase[]): { inicio: string; fim: string } | null {
  const datadas = fases.filter((f) => f.start);
  if (datadas.length === 0) return null;
  let inicio = datadas[0]!.start;
  let fim = datadas[0]!.end || datadas[0]!.start;
  for (const f of datadas) {
    if (f.start < inicio) inicio = f.start;
    // `end || start`: uma campanha cuja última fase está em aberto termina, para
    // efeito de desenho, no dia em que essa fase começou.
    const seuFim = f.end || f.start;
    if (seuFim > fim) fim = seuFim;
  }
  return { inicio, fim };
}

/**
 * A fase cruza este mês?
 *
 * Cruza, e não "começa em": uma fase de 08/09 a 15/11 pertence a setembro,
 * outubro E novembro. Contar pelo início faria outubro parecer vazio no meio de
 * um lançamento em andamento.
 */
export function cruzaMes(f: Fase, ano: number, mes: number): boolean {
  if (!f.start) return false;
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimo = paraIso(new Date(ano, mes, 0, 12));
  return f.start <= ultimo && (f.end || f.start) >= primeiro;
}

export interface ItemComFaixa {
  campanha: Campanha;
  fase: Fase;
  start: string;
  fim: string;
  faixa: number;
}

/**
 * Empilha as barras em faixas, sem sobreposição.
 *
 * *First-fit*, com a ordenação que produz o desenho esperado: por início,
 * depois por duração DECRESCENTE. As barras longas ficam embaixo formando a
 * base, e as curtas se acomodam por cima. Ordenar ao contrário espalha as
 * longas por faixas altas e deixa buracos no meio.
 *
 * O nome desempata para o resultado ser idêntico entre renders — uma tela que
 * se reordena sozinha é impossível de ler.
 */
export function emFaixas(itens: { campanha: Campanha; fase: Fase }[]): ItemComFaixa[] {
  const validos = itens
    .filter((i) => i.fase.start)
    .map((i) => ({ ...i, start: i.fase.start, fim: i.fase.end || i.fase.start }))
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        dias(b.start, b.fim) - dias(a.start, a.fim) ||
        a.campanha.name.localeCompare(b.campanha.name),
    );

  const faixas: { s: string; e: string }[][] = [];
  return validos.map((i) => {
    let n = 0;
    // Encostar em um único dia já é colisão: as duas ocupam aquele dia na tela.
    while (faixas[n]?.some((r) => !(i.fim < r.s || i.start > r.e))) n++;
    (faixas[n] ??= []).push({ s: i.start, e: i.fim });
    return { ...i, faixa: n };
  });
}

/**
 * Os meses da lista lateral: do primeiro ao último com fase, sem buracos.
 *
 * Um mês vazio no meio de um lançamento é informação ("não planejamos nada em
 * outubro"), e escondê-lo faria a lista mentir sobre a continuidade. O mês
 * corrente entra sempre, porque é por onde a tela abre. O teto de 600 é rede
 * contra alguém digitar 2099 num campo de data.
 */
export function mesesDoPeriodo(campanhas: Campanha[], hoje = new Date()): { ano: number; mes: number }[] {
  const chaves = new Set<string>();
  for (const c of campanhas) {
    for (const f of c.phases) {
      if (!f.start) continue;
      chaves.add(f.start.slice(0, 7));
      chaves.add((f.end || f.start).slice(0, 7));
    }
  }
  chaves.add(paraIso(hoje).slice(0, 7));

  const ordenadas = [...chaves].sort();
  const [a0, m0] = ordenadas[0]!.split("-").map(Number);
  const [a1, m1] = ordenadas.at(-1)!.split("-").map(Number);

  const saida: { ano: number; mes: number }[] = [];
  let ano = a0!;
  let mes = m0!;
  while (saida.length < 600) {
    saida.push({ ano, mes });
    if (ano === a1 && mes === m1) break;
    if (++mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return saida;
}

/**
 * A cor do texto sobre a cor da campanha.
 *
 * Luminância relativa (WCAG): a mesma paleta precisa funcionar no tema claro e
 * no escuro, e quem decide não é o tema — é o brilho da cor. Amarelo pede texto
 * escuro em qualquer fundo; roxo pede claro.
 */
export function corDoTexto(hex: string): string {
  const limpo = hex.replace("#", "");
  const cheio =
    limpo.length === 3
      ? limpo
          .split("")
          .map((c) => c + c)
          .join("")
      : limpo;
  if (cheio.length !== 6) return "#ffffff";
  const canal = (i: number) => {
    const v = Number.parseInt(cheio.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return (l + 0.05) / 0.05 > 4.5 ? "#101216" : "#ffffff";
}

/** Corrige o que a pessoa digitou, do mesmo jeito que o servidor. */
export function normalizar(f: Fase): Fase {
  const start = ehData(f.start) ? f.start : "";
  let end = ehData(f.end) ? f.end : "";
  if (!start) end = "";
  // Fim antes do início vira igual ao início: inverter seria adivinhar qual
  // dos dois campos a pessoa errou.
  else if (end && end < start) end = start;
  return { ...f, start, end };
}

export const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

export const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** Um id curto para fase nova, no formato do planner original. */
let contador = 0;
export function novoId(): string {
  return `p${(++contador).toString(36)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * A fase já terminou?
 *
 * O fim é `end || start`: uma fase em aberto que começou ontem NÃO terminou —
 * ela está acontecendo, e é justamente a que não pode sumir da tela.
 */
export function faseTerminou(f: Fase, hoje = hojeIso()): boolean {
  if (!f.start) return false;
  // Fase em aberto NUNCA terminou, tenha começado quando tiver: "sem fim
  // marcado" significa que ainda está acontecendo. Usar o início como fim
  // sumiria com a fase em andamento — que é a mais importante da tela.
  if (!f.end) return false;
  return f.end < hoje;
}

/**
 * A campanha inteira já passou?
 *
 * Exige ao menos uma fase datada. Campanha sem data nenhuma não é "concluída":
 * é não planejada — some-la esconderia justamente a que está esperando alguém
 * preencher.
 */
export function campanhaConcluida(c: Campanha, hoje = hojeIso()): boolean {
  const datadas = c.phases.filter((f) => f.start);
  if (datadas.length === 0) return false;
  return datadas.every((f) => faseTerminou(f, hoje));
}

/**
 * Devolve à lista editada as fases que estavam ESCONDIDAS da tela.
 *
 * ## O defeito que isto fecha
 *
 * Com "esconder o que já terminou" ligado (o padrão), os cards recebem a
 * campanha sem as fases passadas — e salvavam a partir dessa lista. Renomear,
 * mudar data, reordenar ou adicionar uma fase gravava a campanha SEM as
 * terminadas: o servidor entendia que tinham sido excluídas e apagava os
 * eventos delas no Google.
 *
 * Esconder é coisa da tela; o que vai para o banco é sempre a campanha
 * inteira. Cada escondida volta na posição em que estava.
 *
 * Fase VISÍVEL que sumiu da lista foi excluída de propósito e não volta.
 */
export function restaurarOcultas(
  editadas: Fase[],
  todas: Fase[],
  oculta: (f: Fase) => boolean,
): Fase[] {
  const ids = new Set(editadas.map((f) => f.id));
  const out = [...editadas];
  todas.forEach((f, i) => {
    if (oculta(f) && !ids.has(f.id)) out.splice(Math.min(i, out.length), 0, f);
  });
  return out;
}
