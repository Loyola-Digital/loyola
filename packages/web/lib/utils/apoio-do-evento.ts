/**
 * Quem está no evento por patrocínio ou acordo, e não como comprador.
 *
 * A lista do mapa é de quem o closer vai abordar. Patrocinador, fornecedor e as
 * equipes deles entram por cortesia — no BBE-PR2-OUT/26 são 35 das 70 pessoas,
 * e elas empurravam os compradores para a segunda página. Ficam fora por
 * padrão, com um botão para mostrar.
 *
 * Olha o ingresso E o tipo: a planilha põe "Empreendedor" na categoria do
 * ingresso e "Fornecedor"/"Parceiro" no tipo, e outra planilha pode escrever
 * "Patrocinador" em qualquer um dos dois.
 */
export function ehApoioDoEvento(lead: { ticket?: string | null; tipo?: string | null }): boolean {
  const texto = `${lead.ticket ?? ""} ${lead.tipo ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return texto.includes("patrocinador") || texto.includes("empreendedor");
}
