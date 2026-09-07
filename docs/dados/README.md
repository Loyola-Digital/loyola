# docs/dados

Exports de referência **externa** — dado que veio de fora do Loyola e serve para
conferir o que o Loyola calcula.

O ponto é a independência: comparar o nosso banco com o nosso banco não prova
nada. Um export do Gerenciador de Anúncios da Meta, feito pelo gestor, é a única
forma de saber se o nosso cache está incompleto.

## Convenção de nome

`<fonte>-<conta/funil>-<inicio>_<fim>.csv` — ex.:
`meta-bbe-perpetuo-2026-07-17_2026-09-05.csv`

## Disponível

- [x] `meta-bbe-perpetuo-2026-07-17_2026-09-05.csv` — export do Gerenciador de
      Anúncios, feito pelo gestor em 05/09 e commitado em 07/09. **2.406 linhas,
      51 dias, 18 campanhas** (todas `bbe-*-perpetuo-*`), com as colunas que a
      29.76 pedia: campanha, campaign_id, conjunto, adset_id, anúncio, ad_id,
      dia, gasto, cliques no link, compras, CTR, CPM, CPC, impressões, vídeo 3s,
      ThruPlays, 25%, 75%.

      Usado pela story 29.76 (filtro do Detalhamento) — é a conferência
      independente do AC1: o que se mediu antes dele foi o nosso banco contra o
      nosso banco.
