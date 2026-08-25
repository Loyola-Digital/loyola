// ============================================================
// Story 18.69 — o corpo do PUT que salva a classificação de produtos.
//
// Vive fora do hook porque foi exatamente aqui que a feature morreu em
// produção: `productTypes` estava no tipo de entrada e NÃO era incluído no
// literal do body. O diálogo enviava, o TypeScript aceitava, o hook
// descartava, e `product_types` gravava `null` em toda planilha.
//
// Typecheck, lint e dois gates passaram. Faltava um teste que olhasse o CORPO
// ENVIADO em vez do tipo de entrada — e para existir, ele precisava que a
// montagem fosse uma função.
// ============================================================
export function corpoDoPutDeClassificacao(input: {
  current: { spreadsheetId: string; spreadsheetName: string; sheetName: string; columnMapping: unknown };
  orderBumpProducts: string[];
  productTypes?: Record<string, string>;
}) {
  return {
    spreadsheetId: input.current.spreadsheetId,
    spreadsheetName: input.current.spreadsheetName,
    sheetName: input.current.sheetName,
    columnMapping: input.current.columnMapping,
    orderBumpProducts: input.orderBumpProducts,
    productTypes: input.productTypes,
  };
}

