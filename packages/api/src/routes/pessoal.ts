/**
 * Pessoal (RH) — ficha, férias e ausências.
 *
 * Quem preenche é admin; quem é dono da ficha lê a sua. A separação está em
 * cada rota, não num middleware genérico, porque as duas visões devolvem
 * campos diferentes: as observações da liderança não voltam para a própria
 * pessoa.
 *
 * A ficha é 1:1 com `users` e guarda só o que não cabe lá. A lista sai de
 * `users`, não de `people_records`: pessoa recém-admitida ainda não tem ficha,
 * e ela precisa aparecer no painel justamente para alguém preencher.
 */

import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  peopleAbsences,
  peopleRecords,
  pdiDocuments,
  users,
} from "../db/schema.js";
import { soDigitos, validarCnpj, validarCpf } from "../services/documentos.js";

const ID = z.string().uuid();

const fichaSchema = z.object({
  nomeCompleto: z.string().max(255).nullable().optional(),
  foto: z
    .string()
    .max(800_000)
    .refine((v) => v === "" || /^data:image\/[a-z+]+;base64,/i.test(v), {
      message: "A foto precisa ser uma imagem embutida (data: URI).",
    })
    .nullable()
    .optional(),
  nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  telefone: z.string().max(40).nullable().optional(),
  emailContato: z.string().max(255).nullable().optional(),
  emergenciaNome: z.string().max(255).nullable().optional(),
  emergenciaTelefone: z.string().max(40).nullable().optional(),
  emergenciaParentesco: z.string().max(80).nullable().optional(),
  cargo: z.string().max(120).nullable().optional(),
  entradaEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  ajusteSaldoDias: z.number().int().min(-365).max(365).optional(),
  observacoes: z.string().max(4000).nullable().optional(),

  /**
   * Documentos de pagamento.
   *
   * Chegam mascarados da tela e entram como dígitos — o `transform` roda ANTES
   * do `refine`, então a conferência do dígito verificador vê o mesmo número
   * que vai para o banco.
   *
   * Vazio é apagar, não erro: quem preencheu errado precisa poder limpar o
   * campo sem que a validação segure o formulário inteiro.
   */
  cpf: z
    .string()
    .transform(soDigitos)
    .refine((v) => v === "" || validarCpf(v), {
      message: "CPF inválido — confira os dígitos.",
    })
    .nullable()
    .optional(),
  cnpj: z
    .string()
    .transform(soDigitos)
    .refine((v) => v === "" || validarCnpj(v), {
      message: "CNPJ inválido — confira os dígitos.",
    })
    .nullable()
    .optional(),
  /**
   * A chave PIX NÃO é validada além do tamanho.
   *
   * São cinco formatos aceitos pelo Banco Central, e o único jeito de saber se
   * uma chave existe é tentar pagar. Recusar aqui significaria inventar uma
   * regra mais estrita que a do banco e travar alguém com uma chave legítima —
   * o oposto do que este campo serve para fazer.
   */
  chavePix: z.string().max(140).nullable().optional(),
  endereco: z.string().max(500).nullable().optional(),
});

/**
 * O que a PRÓPRIA pessoa pode mudar na ficha dela.
 *
 * Três campos ficam de fora, e não por desconfiança:
 *
 * - `entradaEm` e `ajusteSaldoDias` alimentam o cálculo de férias
 *   (`calcularSaldo`). Quem edita esses dois se dá férias — deixá-los aqui
 *   transformaria uma tela de perfil num formulário de auto-aprovação.
 * - `observacoes` são notas do RH SOBRE a pessoa. Ela nem as recebe em
 *   `/me`; poder gravá-las sem ver o que havia antes apagaria o registro de
 *   outra pessoa.
 *
 * `cargo` fica DENTRO: é o campo que o diretório do time exibe, é o que a
 * pessoa sabe descrever melhor que o RH, e um cargo errado é visível para
 * todo mundo e corrigível por qualquer admin.
 */
export const fichaDaPropriaPessoa = fichaSchema.pick({
  nomeCompleto: true,
  foto: true,
  nascimento: true,
  telefone: true,
  emailContato: true,
  emergenciaNome: true,
  emergenciaTelefone: true,
  emergenciaParentesco: true,
  cargo: true,
  // Os dados de pagamento são DA pessoa: quem sabe o CNPJ certo é o dono dele,
  // não o RH transcrevendo de um print. Errar aqui atrasa o próprio pagamento,
  // o que já é o incentivo certo.
  cpf: true,
  cnpj: true,
  chavePix: true,
  endereco: true,
});

const ausenciaSchema = z.object({
  kind: z.enum(["ferias", "folga", "ausencia", "licenca"]),
  status: z.enum(["programada", "aprovada", "concluida", "cancelada"]),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coberturaUserId: ID.nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
});

/** Dias corridos do período, contando as duas pontas: 10 a 10 é um dia. */
export function diasDoPeriodo(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fim}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Períodos aquisitivos completos (12 meses cada) desde a entrada. */
export function periodosCompletos(
  entrada: string | null,
  hoje = new Date(),
): number {
  if (!entrada) return 0;
  const d = new Date(`${entrada}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 0;
  let meses =
    (hoje.getUTCFullYear() - d.getUTCFullYear()) * 12 +
    (hoje.getUTCMonth() - d.getUTCMonth());
  if (hoje.getUTCDate() < d.getUTCDate()) meses -= 1;
  return Math.max(0, Math.floor(meses / 12));
}

export interface SaldoDeFerias {
  /** 30 dias por período aquisitivo completo. */
  direito: number;
  /** Dias já aprovados ou concluídos. */
  gozados: number;
  ajuste: number;
  disponivel: number;
  periodos: number;
}

/**
 * Saldo de férias.
 *
 * Conta simples e declarada: 30 dias por ano completo de casa, menos o que já
 * foi aprovado ou concluído, mais o ajuste manual. Nenhum cálculo automático
 * cobre acordo, venda de dias ou período anterior ao sistema — por isso o
 * ajuste existe, e por isso a resposta devolve as PARCELAS, não só o total: um
 * número solto que ninguém consegue conferir vira número em que ninguém confia.
 */
export function calcularSaldo(
  entrada: string | null,
  ausencias: { kind: string; status: string; inicio: string; fim: string }[],
  ajuste: number,
): SaldoDeFerias {
  const periodos = periodosCompletos(entrada);
  const direito = periodos * 30;
  const gozados = ausencias
    .filter(
      (a) =>
        a.kind === "ferias" &&
        (a.status === "aprovada" || a.status === "concluida"),
    )
    .reduce((n, a) => n + diasDoPeriodo(a.inicio, a.fim), 0);
  return {
    direito,
    gozados,
    ajuste,
    disponivel: direito - gozados + ajuste,
    periodos,
  };
}

/**
 * Retrato guardado dentro do PDI da pessoa.
 *
 * O documento traz a foto embutida no markup, e sete pessoas já têm um. Sem
 * isto o painel abriria com dezenove silhuetas cinzas esperando alguém subir
 * uma imagem que a empresa já tem.
 */
function retratoDoPdi(html: string): string | null {
  const bloco = html.match(
    /class=["'][^"']*portrait-wrap[^"']*["'][\s\S]{0,400}?<img[^>]*>/i,
  );
  const alvo = bloco ? bloco[0] : html.match(/<img[^>]*>/i)?.[0];
  if (!alvo) return null;
  const src = alvo.match(
    /src=["'](data:image\/[a-z+]+;base64,[A-Za-z0-9+/=\s]+)["']/i,
  );
  return src ? src[1].replace(/\s+/g, "") : null;
}

export default fp(async function pessoalRoutes(fastify) {
  const ehAdmin = (role: string | undefined) => role === "admin";

  /** Retratos vindos do PDI, para os userIds pedidos. */
  async function retratosDosPdis(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    if (userIds.length === 0) return mapa;
    const docs = await fastify.db
      .select({ userId: pdiDocuments.userId, html: pdiDocuments.html })
      .from(pdiDocuments)
      .where(inArray(pdiDocuments.userId, userIds))
      .orderBy(desc(pdiDocuments.createdAt));
    for (const d of docs) {
      // O mais recente vence: o orderBy é decrescente e só o primeiro entra.
      if (mapa.has(d.userId)) continue;
      const foto = retratoDoPdi(d.html);
      if (foto) mapa.set(d.userId, foto);
    }
    return mapa;
  }

  async function fichaDe(userId: string) {
    const [f] = await fastify.db
      .select()
      .from(peopleRecords)
      .where(eq(peopleRecords.userId, userId))
      .limit(1);
    return f ?? null;
  }

  async function ausenciasDe(userId: string) {
    return fastify.db
      .select()
      .from(peopleAbsences)
      .where(eq(peopleAbsences.userId, userId))
      .orderBy(desc(peopleAbsences.inicio));
  }

  function formaAusencia(a: typeof peopleAbsences.$inferSelect) {
    return {
      id: a.id,
      userId: a.userId,
      kind: a.kind,
      status: a.status,
      inicio: a.inicio,
      fim: a.fim,
      dias: diasDoPeriodo(a.inicio, a.fim),
      coberturaUserId: a.coberturaUserId,
      observacao: a.observacao,
    };
  }

  /**
   * Monta a resposta da ficha.
   *
   * `completo` liga as observações da liderança. A pessoa lê a própria ficha,
   * mas não o que anotaram sobre ela.
   */
  function formaFicha(
    u: { id: string; name: string; email: string; role: string },
    f: typeof peopleRecords.$inferSelect | null,
    fotoDoPdi: string | null,
    completo: boolean,
  ) {
    return {
      userId: u.id,
      nome: u.name,
      email: u.email,
      role: u.role,
      nomeCompleto: f?.nomeCompleto ?? null,
      foto: f?.foto ?? fotoDoPdi ?? null,
      /** true = a foto veio do PDI, não da ficha. A tela avisa. */
      fotoDoPdi: !f?.foto && !!fotoDoPdi,
      nascimento: f?.nascimento ?? null,
      telefone: f?.telefone ?? null,
      emailContato: f?.emailContato ?? null,
      emergenciaNome: f?.emergenciaNome ?? null,
      emergenciaTelefone: f?.emergenciaTelefone ?? null,
      emergenciaParentesco: f?.emergenciaParentesco ?? null,
      cargo: f?.cargo ?? null,
      entradaEm: f?.entradaEm ?? null,
      ajusteSaldoDias: f?.ajusteSaldoDias ?? 0,
      // Vão nas DUAS visões: a pessoa confere os próprios, e admin precisa
      // deles para pagar. Fora daqui, só o diretório do time lê a tabela — e
      // ele nomeia as colunas que traz.
      cpf: f?.cpf ?? null,
      cnpj: f?.cnpj ?? null,
      chavePix: f?.chavePix ?? null,
      endereco: f?.endereco ?? null,
      ...(completo ? { observacoes: f?.observacoes ?? null } : {}),
      temFicha: f !== null,
    };
  }

  // ---- Lista (admin) ----
  /**
   * O time inteiro, no recorte que TODO MUNDO pode ver.
   *
   * ## Por que uma rota separada, e não a de admin com menos campos
   *
   * `/api/pessoal` devolve telefone pessoal, contato de emergência, saldo de
   * férias e observações da liderança. Filtrar isso na tela deixaria os dados
   * trafegando de qualquer forma — quem abre o inspetor vê tudo. Recortar no
   * servidor é a única forma que resiste.
   *
   * ## O que entra
   *
   * Nome, foto, cargo e desde quando está na casa. É o que responde "quem é
   * essa pessoa e o que ela faz" — a pergunta de quem está entrando agora, que
   * foi o motivo do pedido.
   *
   * ## O que NÃO entra, e por quê
   *
   * Telefone, nascimento, contato de emergência: são dados de RH, não de
   * apresentação. Saldo e ausências: dizer que alguém está fora hoje parece
   * inofensivo, mas ausência também é licença médica, e o motivo não cabe num
   * diretório aberto ao time inteiro.
   */
  fastify.get("/api/pessoal/time", async (request, reply) => {
    // Convidado não vê o time: ele é de fora, e o diretório é interno.
    if (request.userRole === "guest")
      return reply.code(403).send({ error: "Acesso negado" });

    const pessoas = await fastify.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.status, "active"), eq(users.listed, true)))
      .orderBy(asc(users.name));
    const internos = pessoas.filter((u) => u.role !== "guest");
    const ids = internos.map((u) => u.id);
    if (ids.length === 0) return { pessoas: [] };

    const [fichas, fotos] = await Promise.all([
      fastify.db
        .select({
          userId: peopleRecords.userId,
          cargo: peopleRecords.cargo,
          entradaEm: peopleRecords.entradaEm,
          foto: peopleRecords.foto,
          nomeCompleto: peopleRecords.nomeCompleto,
        })
        .from(peopleRecords)
        .where(inArray(peopleRecords.userId, ids)),
      retratosDosPdis(ids),
    ]);
    const porUsuario = new Map(fichas.map((f) => [f.userId, f]));

    return {
      pessoas: internos.map((u) => {
        const f = porUsuario.get(u.id);
        const doPdi = fotos.get(u.id) ?? null;
        return {
          userId: u.id,
          nome: u.name,
          nomeCompleto: f?.nomeCompleto ?? null,
          email: u.email,
          cargo: f?.cargo ?? null,
          entradaEm: f?.entradaEm ?? null,
          // A foto da ficha manda; a do PDI entra quando não há outra. Quem
          // acabou de chegar costuma ter só a do PDI, e é justamente quem o
          // time precisa reconhecer.
          foto: f?.foto ?? doPdi,
          /** Sem ficha preenchida: a tela mostra o nome e diz que falta. */
          temFicha: Boolean(f),
        };
      }),
    };
  });

  fastify.get("/api/pessoal", async (request, reply) => {
    if (!ehAdmin(request.userRole))
      return reply.code(403).send({ error: "Acesso negado" });

    // Sai de `users` porque recém-admitido ainda não tem ficha — e é ele que
    // mais precisa aparecer, para alguém preencher.
    const pessoas = await fastify.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.status, "active"), eq(users.listed, true)))
      .orderBy(asc(users.name));
    const internos = pessoas.filter((u) => u.role !== "guest");
    const ids = internos.map((u) => u.id);
    if (ids.length === 0) return { pessoas: [] };

    const [fichas, ausencias, fotos] = await Promise.all([
      fastify.db
        .select()
        .from(peopleRecords)
        .where(inArray(peopleRecords.userId, ids)),
      fastify.db
        .select()
        .from(peopleAbsences)
        .where(inArray(peopleAbsences.userId, ids))
        .orderBy(asc(peopleAbsences.inicio)),
      retratosDosPdis(ids),
    ]);
    const porUsuario = new Map(fichas.map((f) => [f.userId, f]));
    const hoje = new Date().toISOString().slice(0, 10);

    return {
      pessoas: internos.map((u) => {
        const f = porUsuario.get(u.id) ?? null;
        const minhas = ausencias.filter((a) => a.userId === u.id);
        const ativas = minhas.filter((a) => a.status !== "cancelada");
        return {
          ...formaFicha(u, f, fotos.get(u.id) ?? null, true),
          saldo: calcularSaldo(
            f?.entradaEm ?? null,
            minhas.map((a) => ({
              kind: a.kind,
              status: a.status,
              inicio: a.inicio,
              fim: a.fim,
            })),
            f?.ajusteSaldoDias ?? 0,
          ),
          /** Fora HOJE — é o que o painel precisa responder de relance. */
          ausenteAgora: ativas.some((a) => a.inicio <= hoje && a.fim >= hoje),
          /** O próximo período que ainda não terminou. */
          proxima:
            ativas.filter((a) => a.fim >= hoje).map(formaAusencia)[0] ?? null,
          totalAusencias: ativas.length,
        };
      }),
    };
  });

  // ---- A própria ficha ----
  fastify.get("/api/pessoal/me", async (request, reply) => {
    if (request.userRole === "guest")
      return reply.code(403).send({ error: "Acesso negado" });

    const [u] = await fastify.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    if (!u) return reply.code(404).send({ error: "Usuário não encontrado" });

    const [f, ausencias, fotos] = await Promise.all([
      fichaDe(u.id),
      ausenciasDe(u.id),
      retratosDosPdis([u.id]),
    ]);
    return {
      ficha: formaFicha(u, f, fotos.get(u.id) ?? null, false),
      saldo: calcularSaldo(
        f?.entradaEm ?? null,
        ausencias.map((a) => ({
          kind: a.kind,
          status: a.status,
          inicio: a.inicio,
          fim: a.fim,
        })),
        f?.ajusteSaldoDias ?? 0,
      ),
      ausencias: ausencias.map(formaAusencia),
    };
  });

  // ---- Ficha de alguém (admin) ----
  fastify.get("/api/pessoal/:userId", async (request, reply) => {
    if (!ehAdmin(request.userRole))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ userId: ID }).safeParse(request.params);
    if (!p.success)
      return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [u] = await fastify.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, p.data.userId))
      .limit(1);
    if (!u) return reply.code(404).send({ error: "Pessoa não encontrada" });

    const [f, ausencias, fotos] = await Promise.all([
      fichaDe(u.id),
      ausenciasDe(u.id),
      retratosDosPdis([u.id]),
    ]);
    return {
      ficha: formaFicha(u, f, fotos.get(u.id) ?? null, true),
      saldo: calcularSaldo(
        f?.entradaEm ?? null,
        ausencias.map((a) => ({
          kind: a.kind,
          status: a.status,
          inicio: a.inicio,
          fim: a.fim,
        })),
        f?.ajusteSaldoDias ?? 0,
      ),
      ausencias: ausencias.map(formaAusencia),
    };
  });

  // ---- Salvar ficha (admin) ----
  /**
   * Salvar a ficha — admin de qualquer pessoa, cada um da sua.
   *
   * Quem melhor sabe o telefone, o contato de emergência e como descrever o
   * próprio trabalho é a pessoa. Concentrar isso num admin faz o diretório
   * envelhecer: ninguém abre um chamado para corrigir o próprio sobrenome, e o
   * campo fica errado para sempre.
   *
   * O QUE cada um pode mudar é que difere — ver `fichaDaPropriaPessoa`.
   */
  fastify.put("/api/pessoal/:userId", async (request, reply) => {
    const p = z.object({ userId: ID }).safeParse(request.params);
    if (!p.success)
      return reply.code(400).send({ error: "Parâmetros inválidos" });

    const admin = ehAdmin(request.userRole);
    const ehAPropria = request.userId === p.data.userId;
    // Convidado não tem ficha nem time: o diretório é interno.
    if (request.userRole === "guest")
      return reply.code(403).send({ error: "Acesso negado" });
    if (!admin && !ehAPropria)
      return reply.code(403).send({ error: "Acesso negado" });

    /**
     * O Zod DESCARTA o que não está no schema, e é o que protege aqui.
     *
     * Uma tela antiga que mandasse a ficha inteira não quebra: os campos de RH
     * simplesmente não chegam ao banco. Rejeitar a requisição seria mais
     * barulhento e menos seguro — quem tenta de novo com o campo removido
     * consegue o mesmo efeito.
     */
    const body = (admin ? fichaSchema : fichaDaPropriaPessoa).safeParse(
      request.body,
    );
    if (!body.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: body.error.flatten().fieldErrors,
      });
    }

    const [u] = await fastify.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, p.data.userId))
      .limit(1);
    if (!u) return reply.code(404).send({ error: "Pessoa não encontrada" });

    // Campo em branco vira NULL: guardar "" faria a tela mostrar um valor vazio
    // como se fosse preenchido.
    const limpo = Object.fromEntries(
      Object.entries(body.data).map(([k, v]) => [k, v === "" ? null : v]),
    );

    await fastify.db
      .insert(peopleRecords)
      .values({ userId: p.data.userId, ...limpo, updatedBy: request.userId })
      .onConflictDoUpdate({
        target: peopleRecords.userId,
        set: { ...limpo, updatedBy: request.userId, updatedAt: new Date() },
      });

    return { ok: true };
  });

  // ---- Ausências (admin) ----
  fastify.post("/api/pessoal/:userId/ausencias", async (request, reply) => {
    if (!ehAdmin(request.userRole))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ userId: ID }).safeParse(request.params);
    const body = ausenciaSchema.safeParse(request.body);
    if (!p.success || !body.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: body.success ? undefined : body.error.flatten().fieldErrors,
      });
    }
    if (body.data.fim < body.data.inicio) {
      return reply
        .code(400)
        .send({ error: "O fim não pode ser antes do início." });
    }

    const [criada] = await fastify.db
      .insert(peopleAbsences)
      .values({
        userId: p.data.userId,
        ...body.data,
        createdBy: request.userId,
      })
      .returning();
    return reply.code(201).send({ ausencia: formaAusencia(criada) });
  });

  fastify.put("/api/pessoal/ausencias/:id", async (request, reply) => {
    if (!ehAdmin(request.userRole))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: ID }).safeParse(request.params);
    const body = ausenciaSchema.partial().safeParse(request.body);
    if (!p.success || !body.success)
      return reply.code(400).send({ error: "Dados inválidos" });

    const [atual] = await fastify.db
      .select()
      .from(peopleAbsences)
      .where(eq(peopleAbsences.id, p.data.id))
      .limit(1);
    if (!atual)
      return reply.code(404).send({ error: "Registro não encontrado" });

    // Valida contra o que a linha FICARÁ, não contra o que veio no corpo: uma
    // edição que muda só o início pode inverter o período sem o corpo conter os
    // dois campos.
    const inicio = body.data.inicio ?? atual.inicio;
    const fim = body.data.fim ?? atual.fim;
    if (fim < inicio)
      return reply
        .code(400)
        .send({ error: "O fim não pode ser antes do início." });

    const [linha] = await fastify.db
      .update(peopleAbsences)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(peopleAbsences.id, p.data.id))
      .returning();
    return { ausencia: formaAusencia(linha) };
  });

  fastify.delete("/api/pessoal/ausencias/:id", async (request, reply) => {
    if (!ehAdmin(request.userRole))
      return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: ID }).safeParse(request.params);
    if (!p.success)
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    await fastify.db
      .delete(peopleAbsences)
      .where(eq(peopleAbsences.id, p.data.id));
    return reply.code(204).send();
  });
});
