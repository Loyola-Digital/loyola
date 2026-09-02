/**
 * O Planner — as contas de data que o calendário e a timeline desenham.
 *
 * ## Datas são texto, e há um motivo
 *
 * Tudo aqui é `YYYY-MM-DD` ou `""`. Um `Date` persistido carrega hora e fuso,
 * e a pergunta do planner nunca tem hora: "a captação começa dia 8" é o mesmo
 * dia em qualquer fuso. Guardar texto elimina a classe inteira de bugs em que a
 * fase pula um dia porque alguém abriu a tela de outro país.
 *
 * ## O truque do meio-dia
 *
 * Quando é preciso virar `Date` para somar dias, a hora é 12:00 e não 00:00.
 * Num dia de mudança de horário de verão, meia-noite pode não existir ou
 * existir duas vezes, e somar 24h a partir dali erra o dia. Ao meio-dia sobram
 * doze horas de folga para os dois lados.
 *
 * ## `diff` é exclusivo
 *
 * De 08/09 a 11/09 são **3** dias, não 4 — é a duração, como se lê num
 * cronograma. A barra no calendário, essa sim, ocupa `diff + 1` células, porque
 * desenha o dia inicial e o final.
 */

/** Uma fase da campanha. `end` vazio = fim em aberto. */
export interface FaseDoPlanner {
  id: string;
  name: string;
  /** ISO `YYYY-MM-DD`, ou `""` quando ainda não foi definida. */
  start: string;
  end: string;
  /**
   * O evento correspondente na agenda do Google.
   *
   * Presente tanto em fase importada de lá quanto em fase criada aqui e
   * espelhada para lá — é o que liga as duas pontas nas duas direções.
   */
  googleEventId?: string;
  /**
   * A edição desta fase não chegou ao Google.
   *
   * Existe por causa da sincronização automática. Sem a marca, o cenário é:
   * alguém move a fase, a escrita falha (rede, permissão), e o job de
   * importação traz do Google a data ANTIGA e desfaz a edição — em silêncio,
   * como se ninguém tivesse mexido. Marcada, a fase é preservada na importação
   * e reenviada antes dela.
   */
  googleSyncPendente?: boolean;
}

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

export function ehDataValida(iso: string): boolean {
  if (!FORMATO.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a!, m! - 1, d!, 12);
  // Rejeita 31 de fevereiro: o `Date` aceita e rola para março em silêncio.
  return dt.getFullYear() === a && dt.getMonth() === m! - 1 && dt.getDate() === d;
}

/** ISO → `Date` ao meio-dia. Ver o cabeçalho para o porquê da hora. */
export function paraData(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, d!, 12, 0, 0);
}

export function paraIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dias entre duas datas, exclusivo. `08→11` = 3. */
export function diasEntre(inicio: string, fim: string): number {
  return Math.round((paraData(fim).getTime() - paraData(inicio).getTime()) / 86_400_000);
}

export function somarDias(iso: string, dias: number): string {
  const d = paraData(iso);
  d.setDate(d.getDate() + dias);
  return paraIso(d);
}

/**
 * Arruma a fase antes de gravar.
 *
 * Três correções, todas silenciosas de propósito — são erros de digitação, não
 * decisões que valha interromper alguém para confirmar:
 *
 * 1. Data ilegível vira `""`. Guardar `31/02` ou `2026-13-01` faria o
 *    calendário desenhar em lugar nenhum e ninguém entenderia por quê.
 * 2. Fim antes do início vira fim IGUAL ao início. Inverter os dois seria
 *    adivinhar qual dos campos a pessoa errou.
 * 3. Fim sem início vira `""`. Uma fase que termina e nunca começou não
 *    aparece em nenhuma visão temporal — melhor deixar as duas vazias, que é
 *    um estado que a tela sabe mostrar.
 */
export function normalizarFase(fase: FaseDoPlanner): FaseDoPlanner {
  const start = ehDataValida(fase.start) ? fase.start : "";
  let end = ehDataValida(fase.end) ? fase.end : "";

  if (!start) end = "";
  else if (end && end < start) end = start;

  return { ...fase, name: fase.name.trim().slice(0, 200), start, end };
}

export interface Periodo {
  inicio: string;
  fim: string;
}

/**
 * O intervalo que a campanha inteira ocupa, ou `null` sem nenhuma fase datada.
 *
 * O fim considera `end || start`: uma campanha cuja última fase está em aberto
 * termina, para efeito de desenho, no dia em que essa fase começou. Ignorá-la
 * encurtaria a campanha para antes de algo que já está acontecendo.
 */
export function periodoDaCampanha(fases: FaseDoPlanner[]): Periodo | null {
  const datadas = fases.filter((f) => f.start);
  if (datadas.length === 0) return null;

  let inicio = datadas[0]!.start;
  let fim = datadas[0]!.end || datadas[0]!.start;
  for (const f of datadas) {
    if (f.start < inicio) inicio = f.start;
    const seuFim = f.end || f.start;
    if (seuFim > fim) fim = seuFim;
  }
  return { inicio, fim };
}

/**
 * A fase cruza este mês?
 *
 * Cruza, e não "começa em": uma fase de 08/09 a 15/11 pertence a setembro,
 * outubro E novembro. Contar só pelo início faria outubro parecer um mês vazio
 * no meio de um lançamento em andamento.
 */
export function cruzaMes(fase: FaseDoPlanner, ano: number, mes: number): boolean {
  if (!fase.start) return false;
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimo = paraIso(new Date(ano, mes, 0, 12));
  const fim = fase.end || fase.start;
  return fase.start <= ultimo && fim >= primeiro;
}

/**
 * Empilha as barras em faixas, sem sobreposição.
 *
 * *First-fit*: cada fase entra na primeira faixa onde não encosta em ninguém.
 * A ordenação antes importa — por início, depois por duração DECRESCENTE — e é
 * o que produz o desenho que se espera: as barras longas embaixo, formando a
 * base, e as curtas acomodadas por cima. Ordenar ao contrário espalha as longas
 * por faixas altas e deixa buracos no meio.
 *
 * O nome desempata para o resultado ser o mesmo entre execuções: uma tela que
 * reordena sozinha a cada render é impossível de ler.
 */
export function distribuirEmFaixas<T extends { start: string; end: string; nome: string }>(
  itens: T[],
): (T & { faixa: number })[] {
  const ordenados = [...itens]
    .filter((i) => i.start)
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        diasEntre(b.start, b.end || b.start) - diasEntre(a.start, a.end || a.start) ||
        a.nome.localeCompare(b.nome),
    );

  const faixas: { start: string; fim: string }[][] = [];
  const saida: (T & { faixa: number })[] = [];

  for (const item of ordenados) {
    const fim = item.end || item.start;
    let i = 0;
    // Encosta = compartilha ao menos um dia. Duas fases em que uma termina no
    // dia em que a outra começa OCUPAM o mesmo dia na tela, então colidem.
    while (faixas[i]?.some((r) => !(fim < r.start || item.start > r.fim))) i++;
    (faixas[i] ??= []).push({ start: item.start, fim });
    saida.push({ ...item, faixa: i });
  }

  return saida;
}

/**
 * Os meses que a lista lateral mostra.
 *
 * Do primeiro ao último mês com fase, SEM buracos: um mês vazio no meio de um
 * lançamento é informação ("não planejamos nada em outubro"), e escondê-lo faria
 * a lista mentir sobre a continuidade. O mês corrente entra sempre, porque é
 * por onde a tela abre.
 *
 * O teto de 600 meses é rede de segurança: alguém digita `2099` num campo de
 * data e a lista tentaria desenhar 900 itens.
 */
export function mesesDoPeriodo(
  fases: FaseDoPlanner[],
  hoje: Date,
  teto = 600,
): { ano: number; mes: number }[] {
  const chaves = new Set<string>();
  const anotar = (iso: string) => chaves.add(iso.slice(0, 7));

  for (const f of fases) {
    if (!f.start) continue;
    anotar(f.start);
    anotar(f.end || f.start);
  }
  anotar(paraIso(hoje));

  const ordenadas = [...chaves].sort();
  const [primeiroAno, primeiroMes] = ordenadas[0]!.split("-").map(Number);
  const [ultimoAno, ultimoMes] = ordenadas[ordenadas.length - 1]!.split("-").map(Number);

  const saida: { ano: number; mes: number }[] = [];
  let ano = primeiroAno!;
  let mes = primeiroMes!;
  while (saida.length < teto) {
    saida.push({ ano, mes });
    if (ano === ultimoAno && mes === ultimoMes) break;
    mes += 1;
    if (mes > 12) {
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
 * no escuro, e o que decide não é o tema — é o brilho da cor escolhida. Amarelo
 * pede texto escuro em qualquer fundo; roxo pede claro.
 */
export function corDoTextoSobre(hex: string): "#101216" | "#ffffff" {
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
  const luminancia = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return (luminancia + 0.05) / 0.05 > 4.5 ? "#101216" : "#ffffff";
}

// ============================================================
// Sincronia com a agenda do Google
// ============================================================

export interface AcaoNoGoogle {
  criar: FaseDoPlanner[];
  atualizar: { fase: FaseDoPlanner; eventId: string }[];
  apagar: string[];
}

/**
 * O que fazer na agenda depois de salvar a campanha.
 *
 * Função pura, e é o ponto: decidir "criar, atualizar ou apagar" olhando duas
 * listas de fases é onde mora o erro caro — um `apagar` a mais some com o
 * evento de todo mundo, e um `criar` a mais duplica a fase na agenda do time.
 * Aqui isso é testável sem tocar no Google.
 *
 * ## Fase que perdeu a data é apagada, não deixada para trás
 *
 * "Sem data" é um estado normal do planejamento: a fase existe, ninguém sabe
 * quando. No Planner ela some das visões temporais; na agenda ela não tem onde
 * ficar. Deixar o evento no lugar antigo seria pior que apagá-lo — o time
 * continuaria vendo uma data que já não vale.
 *
 * ## Renomear a campanha mexe em TODOS os eventos
 *
 * O título no Google é `CAMPANHA - Fase`. Trocar o nome da campanha muda o
 * título de cada fase dela, mesmo as que ninguém tocou.
 */
export function planejarSincronia(entrada: {
  nomeAntes: string;
  nomeDepois: string;
  fasesAntes: FaseDoPlanner[];
  fasesDepois: FaseDoPlanner[];
}): AcaoNoGoogle {
  const { nomeAntes, nomeDepois, fasesAntes, fasesDepois } = entrada;
  const renomeou = nomeAntes.trim() !== nomeDepois.trim();

  const antesPorId = new Map(fasesAntes.map((f) => [f.id, f]));
  const idsDepois = new Set(fasesDepois.map((f) => f.id));

  const acao: AcaoNoGoogle = { criar: [], atualizar: [], apagar: [] };

  for (const fase of fasesDepois) {
    const antes = antesPorId.get(fase.id);
    const temData = Boolean(fase.start);

    if (!fase.googleEventId) {
      // Fase nova, ou que nunca chegou à agenda porque uma escrita anterior
      // falhou. Sem data não há evento a criar — nem erro: ela existe aqui.
      if (temData) acao.criar.push(fase);
      continue;
    }

    if (!temData) {
      acao.apagar.push(fase.googleEventId);
      continue;
    }

    const mudou =
      renomeou ||
      !antes ||
      antes.name !== fase.name ||
      antes.start !== fase.start ||
      antes.end !== fase.end;
    if (mudou) acao.atualizar.push({ fase, eventId: fase.googleEventId });
  }

  // Fase que sumiu da campanha: o evento dela não tem mais dono.
  for (const fase of fasesAntes) {
    if (fase.googleEventId && !idsDepois.has(fase.id)) acao.apagar.push(fase.googleEventId);
  }

  return acao;
}
