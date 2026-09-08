/**
 * Registro de uso do Loyola X — para medir adesão.
 *
 * ## O que é gravado, e o que NÃO é
 *
 * Uma linha por **usuário, área e hora**, com quantas requisições houve. Não
 * guardamos a URL completa, o corpo, o parâmetro nem o registro que foi aberto.
 *
 * A pergunta que isso responde é "o time está usando o produto?" — e ela se
 * responde com área e frequência. Guardar o caminho inteiro responderia
 * "o Fulano abriu o funil do cliente X às 14h32", que é outra coisa: vigiar
 * pessoa em vez de medir produto, e um dado que ninguém quer ter de proteger.
 *
 * ## Por hora, e não por requisição
 *
 * Uma tela faz dezenas de chamadas. Gravar cada uma daria milhões de linhas
 * por ano para responder uma pergunta que se satisfaz com "esteve ativo nesta
 * hora, nesta área". A agregação horária cabe em algumas centenas de linhas
 * por dia e mantém a granularidade que importa: dias ativos e áreas usadas.
 */

/** A área do produto, a partir do caminho da API. */
export interface Area {
  chave: string;
  rotulo: string;
}

/**
 * O prefixo mais específico vence — `/api/funnel-maps` antes de `/api/funnel`.
 * A ordem desta lista É a regra de desempate, e por isso ela não é alfabética.
 */
const AREAS: { prefixos: string[]; chave: string; rotulo: string }[] = [
  { prefixos: ["/api/swipe-files"], chave: "swipe", rotulo: "Swipe Files" },
  { prefixos: ["/api/funnel-maps"], chave: "mapas", rotulo: "Mapas de funil" },
  { prefixos: ["/api/planner"], chave: "planner", rotulo: "Planner" },
  { prefixos: ["/api/sprint-"], chave: "sprint", rotulo: "Sprint" },
  { prefixos: ["/api/debriefings"], chave: "debriefing", rotulo: "Debriefings" },
  { prefixos: ["/api/tasks"], chave: "tasks", rotulo: "Tasks" },
  {
    prefixos: ["/api/minds", "/api/chat", "/api/conversations"],
    chave: "minds",
    rotulo: "Minds e conversas",
  },
  { prefixos: ["/api/pdi"], chave: "pdi", rotulo: "PDI" },
  { prefixos: ["/api/pessoal"], chave: "pessoal", rotulo: "Pessoal" },
  { prefixos: ["/api/bi-", "/api/bi/"], chave: "bi", rotulo: "BI" },
  {
    prefixos: ["/api/instagram", "/api/youtube", "/api/organic-posts"],
    chave: "organico",
    rotulo: "Orgânico",
  },
  {
    prefixos: [
      "/api/meta-ads",
      "/api/google-ads",
      "/api/traffic-analytics",
      "/api/ga4",
      "/api/plausible",
    ],
    chave: "trafego",
    rotulo: "Tráfego",
  },
  {
    prefixos: [
      "/api/sales",
      "/api/kiwify",
      "/api/hotmart",
      "/api/manual-sales",
      "/api/revenuecat",
      "/api/sellers-breakdown",
      "/api/seller-aliases",
    ],
    chave: "vendas",
    rotulo: "Vendas",
  },
  {
    prefixos: ["/api/admin", "/api/api-keys", "/api/invitations", "/api/project-source-rules"],
    chave: "config",
    rotulo: "Configurações",
  },
  // Fica por último: `/api/funnel` e `/api/stage-` pegam muita coisa, e
  // qualquer área mais específica precisa ser testada antes.
  {
    prefixos: [
      "/api/funnel",
      "/api/stage-",
      "/api/projects",
      "/api/lp-campaigns",
      "/api/campaign-log",
    ],
    chave: "funis",
    rotulo: "Funis",
  },
];

/**
 * Caminhos que NÃO contam como uso de gente.
 *
 * Webhook é máquina falando com máquina; `public-*` é a API pública, que tem
 * a própria chave e o próprio dono; health é o monitor. Contá-los inflaria a
 * adesão de quem não abriu o produto uma vez sequer.
 */
const IGNORADOS = ["/api/health", "/api/webhooks", "/api/public-", "/api/mcp"];

export function areaDaRota(caminho: string): Area | null {
  const p = (caminho.split("?")[0] ?? "").toLowerCase();
  if (IGNORADOS.some((i) => p.startsWith(i))) return null;

  for (const a of AREAS) {
    if (a.prefixos.some((pre) => p.startsWith(pre))) {
      return { chave: a.chave, rotulo: a.rotulo };
    }
  }
  // Rota da API que ainda não foi mapeada conta como uso, num balde próprio:
  // sumir com ela faria uma área nova parecer que ninguém usa.
  return p.startsWith("/api/") ? { chave: "outros", rotulo: "Outros" } : null;
}

export const ROTULO_DA_AREA: Record<string, string> = {
  ...Object.fromEntries(AREAS.map((a) => [a.chave, a.rotulo])),
  outros: "Outros",
};

/** A hora cheia de um instante, em UTC — a chave da agregação. */
export function horaCheia(quando: Date): Date {
  const d = new Date(quando);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export interface ContagemAcumulada {
  userId: string;
  area: string;
  hora: Date;
  requisicoes: number;
}

/**
 * O acumulador em memória.
 *
 * Existe porque gravar a cada requisição dobraria a carga do banco para
 * responder uma pergunta que ninguém faz em tempo real. O que se perde num
 * restart é, no máximo, o último minuto de contagem de UMA área — e adesão não
 * se mede em minutos.
 */
export class AcumuladorDeUso {
  private balde = new Map<string, ContagemAcumulada>();

  registrar(userId: string, area: string, quando: Date): void {
    const hora = horaCheia(quando);
    const chave = `${userId}|${area}|${hora.toISOString()}`;
    const atual = this.balde.get(chave);
    if (atual) atual.requisicoes += 1;
    else this.balde.set(chave, { userId, area, hora, requisicoes: 1 });
  }

  /** Entrega o acumulado e ZERA — quem chama assume a responsabilidade de gravar. */
  drenar(): ContagemAcumulada[] {
    const linhas = [...this.balde.values()];
    this.balde.clear();
    return linhas;
  }

  get tamanho(): number {
    return this.balde.size;
  }
}
