/**
 * Quem é uma pessoa na lista do evento, quando ela não tem e-mail.
 *
 * ## Por que existe
 *
 * O mapa monta a lista de participantes com o e-mail como chave: é por ele que
 * a venda, o status marcado pelo closer e o vendedor atribuído se ligam ao
 * participante. Linha sem e-mail era simplesmente DESCARTADA.
 *
 * Medido na Leads-Evento do BBE-PR2-OUT/26 (23/09/2026): das 70 linhas, 31 não
 * têm e-mail — as 2 cortesias, 3 dos 4 VIPs e quase todos os parceiros e
 * fornecedores. Eles estão na planilha, vão ao evento, e não apareciam em
 * lugar nenhum.
 *
 * Agora o celular vale como chave, e o nome como último recurso (é o caso das
 * cadeiras ainda sem dono: "A Informar (Coca-Cola 2/5)"). O prefixo deixa claro
 * que não é e-mail para quem for ler a tabela de status depois.
 *
 * Módulo puro: sem DB, sem rede.
 */

/** Só os 8 últimos dígitos: pega o mesmo número com e sem DDI/DDD/9º dígito. */
function soDigitos(telefone: string): string {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 8 ? d.slice(-8) : "";
}

function chaveDeTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * A chave do participante: e-mail, senão celular, senão nome. `""` quando a
 * linha não tem nenhum dos três — aí não há pessoa nenhuma para mostrar.
 */
export function chaveDoParticipante(email: string, telefone: string, nome: string): string {
  const e = (email ?? "").trim().toLowerCase();
  if (e) return e;
  const tel = soDigitos(telefone);
  if (tel) return `sem-email:tel:${tel}`;
  const n = chaveDeTexto(nome ?? "");
  return n ? `sem-email:nome:${n}` : "";
}

/** A chave é um e-mail de verdade, ou uma inventada para quem não tem? */
export function ehChaveSemEmail(chave: string): boolean {
  return chave.startsWith("sem-email:");
}
