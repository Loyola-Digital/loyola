/**
 * As regras de edição de um widget.
 *
 * Ficam fora do componente porque a parte difícil não é o formulário: é o que
 * precisa acontecer **junto** quando uma métrica sai. Trocar `spec.metrics` e
 * esquecer da ordenação, das séries do gráfico ou de uma coluna derivada deixa o
 * widget com referência morta — e referência morta não dá erro, dá gráfico
 * vazio, que é bem pior de descobrir.
 */

import type { CampoDoCatalogo, Operador, QuerySpec, TipoDeWidget, Widget } from "./tipos";

// ============================================================
// Operadores por tipo
// ============================================================

const OPERADORES_DE_TEXTO: Operador[] = [
  "$eq",
  "$neq",
  "$in",
  "$nin",
  "$like",
  "$ncontains",
  "$isnull",
  "$isnotnull",
];
const OPERADORES_DE_DATA: Operador[] = ["$between", "$gte", "$lte", "$eq"];
const OPERADORES_DE_NUMERO: Operador[] = [
  "$eq",
  "$neq",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$between",
  "$isnull",
  "$isnotnull",
];

export const ROTULO_DO_OPERADOR: Record<Operador, string> = {
  $eq: "é igual a",
  $neq: "é diferente de",
  $gt: "é maior que",
  $gte: "é maior ou igual a",
  $lt: "é menor que",
  $lte: "é menor ou igual a",
  $in: "está entre os valores",
  $nin: "não está entre os valores",
  $like: "corresponde ao padrão",
  $ncontains: "não contém",
  $between: "está entre",
  $isnull: "está vazio",
  $isnotnull: "está preenchido",
};

/**
 * Os operadores que fazem sentido para o tipo do campo.
 *
 * Oferecer `$gt` para nome de campanha e `$like` para gasto é a diferença entre
 * um construtor de filtro usável e uma lista de treze itens que a pessoa testa
 * um por um.
 */
export function operadoresPara(semanticType: string): Operador[] {
  if (semanticType === "text") return OPERADORES_DE_TEXTO;
  if (semanticType === "date") return OPERADORES_DE_DATA;
  return OPERADORES_DE_NUMERO;
}

/** Quantos valores o operador consome — a tela desenha um campo, dois ou nenhum. */
export function aridade(operador: Operador): 0 | 1 | 2 | "lista" {
  if (operador === "$isnull" || operador === "$isnotnull") return 0;
  if (operador === "$between") return 2;
  if (operador === "$in" || operador === "$nin") return "lista";
  return 1;
}

// ============================================================
// Pickers agrupados
// ============================================================

const GRUPO_DA_METRICA: Record<string, string> = {
  currency: "Dinheiro",
  percent: "Taxas",
  number: "Contagens",
};

export interface Grupo {
  titulo: string;
  campos: CampoDoCatalogo[];
}

/** Normaliza para busca: sem acento e sem caixa. */
export function chaveDeBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function agrupar(campos: CampoDoCatalogo[], grupoDe: (c: CampoDoCatalogo) => string): Grupo[] {
  const mapa = new Map<string, CampoDoCatalogo[]>();
  for (const c of campos) {
    const g = grupoDe(c);
    mapa.set(g, [...(mapa.get(g) ?? []), c]);
  }
  return [...mapa.entries()].map(([titulo, lista]) => ({ titulo, campos: lista }));
}

/**
 * Métricas agrupadas por tipo, dimensões por natureza.
 *
 * Uma lista plana de quarenta campos não é escolhível — o agrupamento é o que
 * faz o picker funcionar.
 */
export function metricasAgrupadas(campos: CampoDoCatalogo[], busca = ""): Grupo[] {
  return agrupar(filtrar(campos, busca), (c) => GRUPO_DA_METRICA[c.semanticType] ?? "Outras");
}

export function dimensoesAgrupadas(campos: CampoDoCatalogo[], busca = ""): Grupo[] {
  return agrupar(filtrar(campos, busca), (c) => (c.semanticType === "date" ? "Tempo" : "Atributos"));
}

function filtrar(campos: CampoDoCatalogo[], busca: string): CampoDoCatalogo[] {
  const termo = chaveDeBusca(busca.trim());
  if (!termo) return campos;
  return campos.filter((c) => chaveDeBusca(`${c.label} ${c.description} ${c.key}`).includes(termo));
}

// ============================================================
// Editabilidade
// ============================================================

export interface Permissao {
  pode: boolean;
  /** Por que não — a tela mostra o motivo, não só o campo cinza. */
  motivo?: string;
}

/**
 * Widget com colunas derivadas ou mais de uma consulta não tem métricas livres.
 *
 * Mexer nelas quebraria a expressão que as combina, e a quebra é silenciosa: a
 * coluna derivada passaria a devolver vazio sem nenhum erro.
 */
export function podeEditarMetricas(widget: Pick<Widget, "derivadas" | "specsExtras">): Permissao {
  if ((widget.derivadas?.length ?? 0) > 0) {
    return {
      pode: false,
      motivo:
        "Este widget tem colunas calculadas que usam estas métricas. Remova as colunas calculadas para poder mexer.",
    };
  }
  if ((widget.specsExtras?.length ?? 0) > 0) {
    return {
      pode: false,
      motivo: "Este widget combina mais de uma consulta. Edite cada consulta separadamente.",
    };
  }
  return { pode: true };
}

export function podeEditarDimensoes(
  widget: Pick<Widget, "derivadas" | "specsExtras" | "mergeKey">,
): Permissao {
  const porLinha = widget.derivadas?.some((d) => d.mode === "row") ?? false;
  if (porLinha && widget.mergeKey) {
    return {
      pode: false,
      motivo: `As consultas deste widget se casam por "${widget.mergeKey}". Trocar as dimensões desfaria esse encaixe.`,
    };
  }
  return { pode: true };
}

// ============================================================
// Renomeação em cascata
// ============================================================

/** As referências `qN.coluna` de uma expressão, sem avaliar nada. */
export function referenciasNaExpressao(expressao: string): { query: number; coluna: string }[] {
  // Varredura, não avaliação: quem avalia é o parser do servidor. Aqui só se
  // quer saber quais colunas a expressão menciona, para não deixá-las órfãs.
  const saida: { query: number; coluna: string }[] = [];
  const padrao = /q(\d+)\.([a-zA-Z_][a-zA-Z0-9_.]*)/g;
  for (const m of expressao.matchAll(padrao)) {
    saida.push({ query: Number(m[1]), coluna: m[2]! });
  }
  return saida;
}

export interface ResultadoDaEdicao {
  widget: Widget;
  /** O que a edição arrastou junto — a tela mostra antes de salvar. */
  avisos: string[];
}

/**
 * Troca as métricas do widget e arruma tudo o que dependia delas.
 *
 * Os três pontos que precisam mudar **juntos**: a ordenação (que pode apontar
 * para a métrica removida), as séries do gráfico e as colunas derivadas. Mexer
 * só no primeiro deixa o widget com referência morta — e referência morta não dá
 * erro, dá gráfico vazio.
 */
export function atualizarMetricas(widget: Widget, metrics: string[]): ResultadoDaEdicao {
  const avisos: string[] = [];
  const removidas = widget.spec.metrics.filter((m) => !metrics.includes(m));

  const spec: QuerySpec = {
    ...widget.spec,
    metrics,
    order_by: widget.spec.order_by.filter((o) => {
      const some = removidas.includes(o.field);
      if (some) avisos.push(`A ordenação por "${o.field}" foi removida junto com a métrica.`);
      return !some;
    }),
  };

  // As séries do gráfico apontam para chaves de coluna: as que sumiram saem.
  const opcoes = { ...widget.opcoes };
  const series = opcoes.series;
  if (Array.isArray(series)) {
    const sobrando = series.filter((s) => typeof s !== "string" || !removidas.includes(s));
    if (sobrando.length !== series.length) {
      avisos.push("Séries do gráfico que usavam a métrica removida foram tiradas.");
    }
    opcoes.series = sobrando;
  }

  // Coluna derivada que menciona a métrica removida sai também: mantê-la
  // devolveria vazio todo dia, sem erro nenhum.
  const derivadas = (widget.derivadas ?? []).filter((d) => {
    const usa = referenciasNaExpressao(d.expression).some((r) => removidas.includes(r.coluna));
    if (usa) avisos.push(`A coluna calculada "${d.label}" usava a métrica removida e foi tirada.`);
    return !usa;
  });

  return { widget: { ...widget, spec, opcoes, derivadas }, avisos };
}

/** O mesmo, para dimensões — incluindo a chave de merge, que é uma delas. */
export function atualizarDimensoes(widget: Widget, dimensions: string[]): ResultadoDaEdicao {
  const avisos: string[] = [];
  const removidas = widget.spec.dimensions.filter((d) => !dimensions.includes(d));

  const spec: QuerySpec = {
    ...widget.spec,
    dimensions,
    order_by: widget.spec.order_by.filter((o) => {
      const some = removidas.includes(o.field);
      if (some) avisos.push(`A ordenação por "${o.field}" foi removida junto com a dimensão.`);
      return !some;
    }),
  };

  let mergeKey = widget.mergeKey;
  if (mergeKey && removidas.includes(mergeKey)) {
    // Sem a dimensão que casava as consultas, a coluna por linha não tem como
    // encontrar o par — e devolveria `null` em toda linha, calada.
    avisos.push(`A chave que casava as consultas ("${mergeKey}") saiu junto com a dimensão.`);
    mergeKey = undefined;
  }

  return { widget: { ...widget, spec, mergeKey }, avisos };
}

// ============================================================
// A frase
// ============================================================

/**
 * A descrição em português do que o widget mostra.
 *
 * Muito retorno por pouco código: é o que deixa a pessoa conferir o que montou
 * sem ler JSON — e o que denuncia o filtro esquecido de outra vez.
 */
export function descrever(
  spec: QuerySpec,
  rotulo: (chave: string) => string,
  periodo?: { start: string; end: string },
): string {
  const metricas = spec.metrics.map(rotulo);
  const partes: string[] = [lista(metricas) || "Sem métrica"];

  if (spec.dimensions.length > 0) {
    const porGranularidade =
      spec.date_granularity === "week"
        ? " por semana"
        : spec.date_granularity === "month"
          ? " por mês"
          : "";
    partes[0] += ` por ${lista(spec.dimensions.map(rotulo))}${porGranularidade}`;
  }

  const chaveDeData = `${spec.entity}.date`;
  const filtros = Object.entries(spec.filters).filter(([k]) => k !== chaveDeData);
  for (const [chave, filtro] of filtros) {
    partes.push(`${rotulo(chave)} ${ROTULO_DO_OPERADOR[filtro.operator]} ${valorEmTexto(filtro.value)}`.trim());
  }

  const data = spec.filters[chaveDeData];
  if (periodo) partes.push(`de ${periodo.start} a ${periodo.end}`);
  else if (data && Array.isArray(data.value) && data.value.length === 2) {
    partes.push(`de ${data.value[0]} a ${data.value[1]}`);
  }

  if (spec.order_by.length > 0) {
    const o = spec.order_by[0]!;
    partes.push(`ordenado por ${rotulo(o.field)} ${o.direction === "desc" ? "↓" : "↑"}`);
  }

  return partes.join(", ");
}

function lista(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

function valorEmTexto(valor: unknown): string {
  if (valor === undefined) return "";
  if (Array.isArray(valor)) {
    if (valor.length <= 3) return valor.join(", ");
    return `${valor.slice(0, 3).join(", ")} e mais ${valor.length - 3}`;
  }
  return String(valor);
}

/** O tipo de gráfico que combina com a forma da consulta. */
export function tipoSugerido(spec: QuerySpec): TipoDeWidget {
  if (spec.dimensions.length === 0) return "kpi";
  if (spec.dimensions.length > 1 || spec.metrics.length > 3) return "tabela";
  return spec.dimensions[0]!.endsWith(".date") ? "linha" : "barra";
}

// ============================================================
// Auto-split entre entidades
// ============================================================

/** A dimensão equivalente noutra entidade — `trafego.date` → `vendas.date`. */
function equivalente(chave: string, entidade: string): string {
  return `${entidade}.${chave.split(".").slice(1).join(".")}`;
}

/**
 * A chave que casa as linhas das consultas do widget.
 *
 * A data primeiro, porque toda entidade tem a dela — é o que faz "receita por
 * dia menos gasto por dia" funcionar sem ninguém explicar nada.
 */
export function chaveDeMergeSugerida(dimensoesPorQuery: string[][]): string | undefined {
  const [primeira, ...resto] = dimensoesPorQuery;
  if (!primeira?.length) return undefined;
  const sufixo = (k: string) => k.split(".").slice(1).join(".");
  const comuns = primeira.filter((k) =>
    resto.every((outras) => outras.some((o) => sufixo(o) === sufixo(k))),
  );
  return comuns.find((k) => sufixo(k) === "date") ?? comuns[0];
}

/**
 * Acrescenta uma métrica de OUTRA entidade, criando a consulta dela sozinho.
 *
 * O dossiê manda copiar isto sem pensar muito, e a razão é boa: é o que torna
 * multi-entidade usável sem interface de join. A pessoa escolhe "Receita" num
 * widget de tráfego e o sistema monta a segunda consulta, espelha as dimensões e
 * escolhe a chave que casa as duas.
 */
export function adicionarMetricaDeOutraEntidade(
  widget: Widget,
  campo: CampoDoCatalogo,
): ResultadoDaEdicao {
  const avisos: string[] = [];
  const extras = [...(widget.specsExtras ?? [])];
  const jaExiste = extras.findIndex((s) => s.entity === campo.entity);

  if (jaExiste >= 0) {
    const alvo = extras[jaExiste]!;
    if (alvo.metrics.includes(campo.key)) return { widget, avisos };
    extras[jaExiste] = { ...alvo, metrics: [...alvo.metrics, campo.key] };
    avisos.push(`"${campo.label}" entrou na consulta de ${campo.entity} que o widget já tinha.`);
  } else {
    if (extras.length >= 3) {
      return {
        widget,
        avisos: ["Um widget combina no máximo quatro consultas. Remova uma para adicionar outra."],
      };
    }
    // As dimensões são espelhadas: sem isso, a segunda consulta devolveria um
    // total só e não teria como casar linha a linha.
    const dimensions = widget.spec.dimensions.map((d) => equivalente(d, campo.entity));
    const chaveDeData = `${campo.entity}.date`;
    extras.push({
      entity: campo.entity as Widget["spec"]["entity"],
      metrics: [campo.key],
      dimensions,
      // O período real é injetado pelo dashboard; aqui só a chave precisa existir.
      filters: { [chaveDeData]: { operator: "$between", value: ["", ""] } },
      order_by: [],
      limit: widget.spec.limit,
      date_granularity: widget.spec.date_granularity,
    });
    avisos.push(
      `"${campo.label}" é de outra entidade, então virou uma segunda consulta (q${extras.length}).`,
    );
  }

  const mergeKey =
    widget.mergeKey ??
    chaveDeMergeSugerida([widget.spec.dimensions, ...extras.map((s) => s.dimensions)]);
  if (mergeKey && mergeKey !== widget.mergeKey) {
    // Mostrado, não escondido: a chave decide o que casa com o quê, e a pessoa
    // precisa poder discordar dela.
    avisos.push(`As consultas vão se casar por "${mergeKey}".`);
  }

  return { widget: { ...widget, specsExtras: extras, mergeKey }, avisos };
}

/** Remove uma consulta extra e as derivadas que dependiam dela. */
export function removerConsultaExtra(widget: Widget, indice: number): ResultadoDaEdicao {
  const avisos: string[] = [];
  const q = indice + 1;
  const extras = (widget.specsExtras ?? []).filter((_, i) => i !== indice);

  const derivadas = (widget.derivadas ?? []).filter((d) => {
    const usa = referenciasNaExpressao(d.expression).some((r) => r.query === q);
    if (usa) avisos.push(`A coluna calculada "${d.label}" usava a q${q} e foi removida junto.`);
    return !usa;
  });

  return {
    widget: {
      ...widget,
      specsExtras: extras,
      derivadas,
      // Sem segunda consulta não há o que casar.
      mergeKey: extras.length ? widget.mergeKey : undefined,
    },
    avisos,
  };
}
