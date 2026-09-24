# Cadastro e nomenclatura de campanhas de perpétuo — especificação para implementação

> **Origem:** especificação entregue pelo dono do produto em 2026-09-09, guardada aqui **verbatim** para ser a fonte de rastreabilidade das stories do Epic 47 (Artigo IV — No Invention). Os campos `[PREENCHER]` da seção 9 ainda estão em aberto — ver `epic-47-nomenclatura-de-campanhas.md` § "Pré-condições".

> Antes de colar no Cursor / Claude Code: preencha os campos marcados `[PREENCHER]` na seção 9 (Seed). Todo o resto está pronto.

---

## 0. Como trabalhar neste repositório

1. Explore o repositório antes de escrever qualquer código. Identifique stack, banco de dados, ORM, padrão de rotas, componentes de UI, forma de autenticação e como os testes rodam. Siga o que já existe.
2. Se o repositório não tiver banco/ORM/UI definidos, proponha uma stack mínima e **pergunte antes de instalar dependências**.
3. Entregue em quatro etapas, nesta ordem, parando ao fim de cada uma para eu revisar:
   - Etapa 1 — modelo de dados, migrations, seed (seção 4, 5 e 9).
   - Etapa 2 — telas de cadastro com incluir / editar / excluir para todas as entidades (seção 6).
   - Etapa 3 — gerador de nome de campanha (seção 7 e 8).
   - Etapa 4 — testes cobrindo os critérios de aceite (seção 10).
4. Ao fim de cada etapa, liste o que foi feito, o que ficou de fora e qualquer decisão que você tomou sem instrução explícita.
5. Idioma da interface: português do Brasil. Idioma do código: inglês (nomes de tabelas, colunas, funções), exceto os valores de domínio (`expert`, `oferta`, `funil` etc.), que aparecem no nome da campanha e devem ser mantidos como estão.

---

## 1. Contexto

Somos uma agência de tráfego pago (Bonsai Tráfego Pago). Rodamos funis perpétuos no Meta Ads para vários experts (infoprodutores). O nome de cada campanha segue uma convenção posicional: nove campos separados por `_`. Esse nome é enviado nos parâmetros de URL, chega numa planilha de vendas e é quebrado em nove colunas para cruzar investimento com faturamento. Se o nome sair do padrão, o cruzamento quebra.

O sistema que você vai construir tem dois papéis:

- **Dicionário**: cadastro de experts, produtos, funis, ofertas, LPs e valores fixos (ano, temperatura, leilão, formato), com inclusão, edição e exclusão.
- **Gerador**: uma tela onde o usuário seleciona expert → produto → funil → oferta → ano → temperatura → leilão → formato → LP e recebe o nome da campanha pronto, validado, com botão de copiar.

---

## 2. Template do nome da campanha

```
expert_produto_funil_oferta_ano_temp_leilao_formato_lp
```

| # | Campo | Bloco | Exemplo | Origem do valor |
|---|---|---|---|---|
| 1 | expert | identidade | `bbe` | cadastro de experts |
| 2 | produto | identidade | `churrasco` | cadastro de produtos (do expert) |
| 3 | funil | identidade | `a01` | cadastro de funis (do expert) |
| 4 | oferta | identidade | `of01` | cadastro de ofertas (do expert) ou valor especial `ofmix` |
| 5 | ano | ano | `2026` | dicionário `ano` |
| 6 | temp | segmentação | `hot` | dicionário `temperatura` |
| 7 | leilao | segmentação | `cbo` | dicionário `leilao` |
| 8 | formato | segmentação | `videos` | dicionário `formato` |
| 9 | lp | segmentação | `lpa` | cadastro de LPs (da oferta) ou valores especiais `lpmix` / `na` |

Exemplo completo (46 caracteres):

```
bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa
```

Os três blocos têm significado e devem ser mostrados com cores diferentes na prévia do gerador:

- **Identidade** (campos 1–4): o que está sendo vendido e por qual máquina. É o que se soma ao longo do tempo.
- **Ano** (campo 5): em que ano a campanha foi publicada.
- **Segmentação** (campos 6–9): como o orçamento está fatiado. É o que se compara entre campanhas do mesmo funil.

---

## 3. Regras invioláveis

Estas regras valem para todo o sistema. Implemente como validação de servidor, não só de formulário.

1. **Um separador só.** `_` entre campos, `-` para juntar palavras dentro de um campo. Nunca `--`, `__`, espaço, acento, maiúscula, `|` ou qualquer outro caractere fora de `[a-z0-9-]` dentro de um campo.
2. **Nove campos, sempre.** Campo que não se aplica recebe `na`. Nome com número diferente de 8 underscores é inválido.
3. **Um campo, um significado.** Formato é formato, LP é LP. Nenhum campo recebe valor que pertence a outro.
4. **Código nunca muda de significado nem é reaproveitado.** `a01`, `of02`, `lpa` significam a mesma coisa para sempre, mesmo depois de desativados. Novo significado, novo código. Por isso a unicidade de código inclui registros inativos.
5. **Código é imutável depois de usado.** Sigla do expert, slug do produto, código de funil, oferta e LP não podem ser editados depois que aparecem em pelo menos uma campanha salva. Descrições, nomes de exibição e URLs continuam editáveis.
6. **Nunca renomear campanha publicada.** O Meta congela o nome na primeira publicação. Campanha marcada como publicada não permite editar o nome; oferece apenas "Duplicar".
7. **Todo código tem linha no dicionário e toda mudança tem linha no changelog.**
8. **Valor fora do dicionário é erro.** O gerador nunca aceita texto livre nos nove campos; só valores cadastrados (mais os especiais `ofmix`, `lpmix`, `na`).

---

## 4. Modelo de dados

Use nomes de tabelas/colunas em inglês seguindo a convenção do repositório. Abaixo, os campos e restrições obrigatórios. Adicione `created_at` / `updated_at` em todas as tabelas.

### 4.1 `experts`

| Campo | Tipo | Regra |
|---|---|---|
| id | pk | |
| code | string | sigla: 2–4 letras `[a-z]`, **única**, imutável depois de criada |
| name | string | nome de exibição (ex.: "Netão") |
| active | bool | default `true` |

### 4.2 `products`

| Campo | Tipo | Regra |
|---|---|---|
| id | pk | |
| expert_id | fk → experts | obrigatório |
| slug | string | `[a-z0-9-]`, até 20 caracteres, **único por expert**, imutável depois de usado |
| name | string | nome de exibição |
| description | text | opcional |
| active | bool | default `true` |

Unique: `(expert_id, slug)`.

### 4.3 `funnels` (funis)

Numeração **por expert**: `a01` do expert `bbe` e `a01` do expert `fz` são registros diferentes e independentes. Um expert tem uma única sequência de funis, compartilhada entre todos os produtos dele.

| Campo | Tipo | Regra |
|---|---|---|
| id | pk | |
| expert_id | fk → experts | obrigatório |
| code | string | formato `a` + dois dígitos (`a01`…`a99`), **único por expert** (inclui inativos), imutável depois de usado |
| description | text | **obrigatória**. Descreve o mecanismo: "VSL direto para checkout", "Aula perpétua → oferta", "Quiz → VSL" |
| started_at | date | data de início, default hoje |
| active | bool | default `true` |

Unique: `(expert_id, code)`.

### 4.4 `offers` (ofertas)

Numeração **por expert**, mesma lógica dos funis.

| Campo | Tipo | Regra |
|---|---|---|
| id | pk | |
| expert_id | fk → experts | obrigatório |
| code | string | formato `of` + dois dígitos (`of01`…`of99`), **único por expert** (inclui inativos), imutável depois de usado |
| description | text | **obrigatória**. Descreve preço + parcelamento + order bump + upsell + garantia + checkout. Ex.: "oferta com ticket médio de R$ 347", "R$ 500 com bump", "R$ 500 sem bump" |
| started_at | date | default hoje |
| active | bool | default `true` |

Unique: `(expert_id, code)`.

`ofmix` **não é um registro**: é um valor especial que o gerador oferece quando a campanha carrega mais de uma oferta.

### 4.5 `landing_pages` (LPs)

Uma LP pertence a uma combinação expert + produto + funil + oferta. O slug é gerado automaticamente e é a identidade pública da página.

| Campo | Tipo | Regra |
|---|---|---|
| id | pk | |
| expert_id | fk → experts | obrigatório |
| product_id | fk → products | obrigatório, deve pertencer ao mesmo expert |
| funnel_id | fk → funnels | obrigatório, deve pertencer ao mesmo expert |
| offer_id | fk → offers | obrigatório, deve pertencer ao mesmo expert |
| code | string | `lp` + uma letra `[a-z]` (`lpa`, `lpb` …), **único dentro da combinação** expert+produto+funil+oferta (inclui inativos), imutável depois de usado |
| slug | string | **gerado**, somente leitura, único global. Padrão: `{expert.code}-{product.slug}-{funnel.code}-{offer.code}-{code}` → `bbe-churrasco-a01-of01-lpa` |
| url | string | opcional, URL completa publicada |
| description | text | opcional (ex.: "VSL longa com prova social") |
| active | bool | default `true` |

Unique: `(expert_id, product_id, funnel_id, offer_id, code)` e `slug`.

Ao criar, o sistema sugere o próximo código livre dentro da combinação (se existe `lpa`, sugere `lpb`).

`lpmix` (LP varia por anúncio) e `na` (sem LP) **não são registros**: são valores especiais do gerador.

### 4.6 `dictionary_values` (valores fixos, globais)

Uma tabela só para os quatro campos que não dependem de expert. Também têm incluir / editar / excluir.

| Campo | Tipo | Regra |
|---|---|---|
| id | pk | |
| type | enum | `year`, `temperature`, `auction`, `format` |
| value | string | `[a-z0-9]`, único por tipo (inclui inativos), imutável depois de usado |
| description | text | opcional |
| sort_order | int | ordem no select |
| active | bool | default `true` |

Unique: `(type, value)`.

### 4.7 `campaigns`

| Campo | Tipo | Regra |
|---|---|---|
| id | pk | |
| expert_id | fk | obrigatório |
| product_id | fk | obrigatório, do mesmo expert |
| funnel_id | fk | obrigatório, do mesmo expert |
| offer_id | fk | nullable; `null` quando `offer_value = 'ofmix'` |
| offer_value | string | o texto que entra no nome: `offers.code` ou `ofmix` |
| year | string | valor do dicionário `year`, validado na gravação |
| temperature | string | valor do dicionário `temperature` |
| auction | string | valor do dicionário `auction` |
| format | string | valor do dicionário `format` |
| landing_page_id | fk | nullable; `null` quando `lp_value` é `lpmix` ou `na` |
| lp_value | string | o texto que entra no nome: `landing_pages.code`, `lpmix` ou `na` |
| suffix | string | opcional, formato `v` + dois dígitos (`v02`). Só para distinguir campanhas idênticas no mesmo ano; entra **no fim** do nome |
| name | string | **gerado** e armazenado. Recalculado a cada gravação enquanto não publicada |
| published_at | datetime | nullable. Quando preenchido, o nome congela |
| meta_campaign_id | string | opcional |
| notes | text | opcional |

Guarde os valores textuais (`year`, `temperature`, …) além das FKs para que o nome continue reconstruível mesmo se um valor do dicionário for desativado depois.

### 4.8 `changelog`

| Campo | Tipo |
|---|---|
| id | pk |
| entity | string (nome da tabela) |
| entity_id | id |
| action | enum `create`, `update`, `delete`, `deactivate`, `reactivate`, `publish` |
| before | json (nullable) |
| after | json (nullable) |
| author | string / fk de usuário, se houver auth no repo |
| created_at | datetime |

Toda escrita em qualquer tabela acima gera uma linha aqui. Faça isso numa camada única (service/repository), não em cada handler.

---

## 5. Regras de negócio por entidade

### Normalização de entrada (todas as entidades)

Antes de validar qualquer código, slug ou valor:
- `trim`, converter para minúsculas, remover acentos (`ç`→`c`, `ã`→`a`), substituir espaços por `-`.
- Rejeitar `_` dentro de um campo (é o separador entre campos).
- Rejeitar `--`, `-` no início ou no fim.
- Depois da normalização, validar contra o formato específico do campo (seção 4).

### Sugestão automática de código

Ao abrir o formulário de novo funil / nova oferta / nova LP / novo produto, o campo código já vem preenchido com o próximo livre **dentro do escopo** (por expert para funil e oferta; por combinação para LP). O usuário pode alterar, mas não para um código já existente no escopo, inclusive inativo. Mensagem de erro deve dizer o que já ocupa aquele código: `of02 já existe para bbe: "oferta com ticket médio de R$ 297". Use of03.`

### Imutabilidade depois de uso

"Usado" = referenciado por pelo menos uma linha em `campaigns` (para expert, produto, funil, oferta, LP, valor de dicionário). Quando usado:
- O campo código/slug/sigla/valor fica desabilitado no formulário de edição, com o texto "Usado em N campanha(s). Para mudar o significado, crie um código novo."
- Descrição, nome, URL, data de início e `active` continuam editáveis.
- Editar a descrição de funil ou oferta usado exibe um aviso (não bloqueia): "Corrija ou detalhe, mas não mude o significado. Se a oferta mudou, cadastre um código novo."

### Exclusão

- **Hard delete** permitido apenas quando o registro não é referenciado por nada (nenhuma campanha, nenhum registro filho: produto → LPs; funil → LPs; oferta → LPs; expert → tudo).
- Se houver referência, bloquear com a lista do que referencia e oferecer **Desativar** (`active = false`).
- Registro inativo: some dos selects do gerador, continua visível nas telas de cadastro com o filtro "Mostrar inativos" (desligado por padrão), e pode ser reativado.
- Desativar um expert desativa em cascata (mostrar confirmação com a contagem) produtos, funis, ofertas e LPs dele.

### Coerência de expert

Em `landing_pages` e `campaigns`, produto, funil, oferta e LP têm que pertencer ao mesmo `expert_id`. Valide no servidor; retorne erro claro se não pertencerem.

---

## 6. Telas de cadastro (Dicionário)

Uma área "Dicionário" com abas ou menu lateral: **Experts · Produtos · Funis · Ofertas · LPs · Valores fixos**. Toda aba tem:

- Listagem em tabela com busca por texto, filtro "Mostrar inativos", ordenação pela coluna principal.
- Botão "Novo".
- Ações por linha: Editar, Excluir (ou Desativar/Reativar, conforme seção 5).
- Contador "Usado em N campanhas" por linha.

Particularidades:

**Experts** — colunas: sigla, nome, produtos (n), funis (n), ofertas (n), ativo.

**Produtos** — filtro por expert no topo (select). Formulário: expert (select, travado na edição), slug, nome, descrição.

**Funis** — filtro por expert no topo. Ao escolher o expert, a listagem mostra só os funis dele e o botão "Novo" já vem com o expert preenchido e o código sugerido. Colunas: código, descrição, data de início, usado em, ativo. Formulário: expert (select, travado na edição), código (sugerido), **descrição (obrigatória, textarea)**, data de início.

**Ofertas** — idêntico a Funis. Formulário: expert, código (`ofNN`, sugerido), **descrição (obrigatória)**, data de início. A descrição é o que o usuário vai ler no gerador, então o placeholder deve orientar: "Ex.: oferta com ticket médio de R$ 347, 12x, com order bump".

**LPs** — filtros em cascata no topo: expert → produto → funil → oferta. Formulário: expert → produto → funil → oferta (selects em cascata, cada um carregando só os registros ativos do nível anterior; trocar um nível limpa os seguintes), código (sugerido), URL, descrição. **Slug exibido em tempo real, somente leitura, com botão copiar**: `bbe-churrasco-a01-of01-lpa`.

**Valores fixos** — quatro seções na mesma tela (Ano, Temperatura, Leilão, Formato), cada uma com sua tabelinha e botão "Novo". Formulário: valor, descrição, ordem.

Em todos os selects de funil e oferta, em qualquer tela, o rótulo da opção é `código — descrição`:

```
a01 — VSL direto para checkout
of01 — oferta com ticket médio de R$ 347
of02 — oferta com ticket médio de R$ 297
```

---

## 7. Gerador de nome de campanha

Tela "Nova campanha". Formulário em cascata, com a prévia do nome atualizada a cada mudança.

### Ordem e comportamento dos campos

1. **Expert** (select). Ao selecionar, carregar produtos, funis e ofertas **ativos daquele expert**. Trocar o expert limpa todos os campos abaixo.
2. **Produto** (select, filtrado pelo expert). Trocar limpa a LP.
3. **Funil** (select, filtrado pelo expert). Rótulo `código — descrição`. Trocar limpa a LP.
4. **Oferta** (select, filtrado pelo expert). Rótulo `código — descrição`. Última opção fixa: `ofmix — a campanha carrega mais de uma oferta`. Trocar limpa a LP.
5. **Ano** (select do dicionário `year`; pré-selecionar o ano corrente se existir no dicionário).
6. **Temperatura** (select do dicionário `temperature`).
7. **Leilão** (select do dicionário `auction`).
8. **Formato** (select do dicionário `format`).
9. **LP** (select). Opções: LPs ativas cuja combinação expert+produto+funil+oferta bate com a seleção acima, rótulo `código — slug` (ex.: `lpa — bbe-churrasco-a01-of01-lpa`). Se a oferta for `ofmix`, listar as LPs de todas as ofertas daquele expert+produto+funil. Sempre acrescentar ao fim as opções fixas `lpmix — a LP varia por anúncio` e `na — sem LP`.
10. **Sufixo** (opcional, `vNN`). Campo recolhido por padrão, com o texto de ajuda: "Só para distinguir duas campanhas idênticas no mesmo ano. Entra no fim do nome."
11. **Observações** (opcional).

Cada select de 2 a 4 e 9 tem um atalho "+ cadastrar novo" que abre o formulário correspondente (modal ou rota) já com o expert preenchido e, ao salvar, volta com o novo registro selecionado.

### Prévia

- Nome montado em fonte mono, com os nove campos coloridos por bloco (identidade / ano / segmentação) e os `_` em cinza.
- Contador de caracteres.
- Botão "Copiar nome".
- Enquanto houver campo vazio, mostrar o nome parcial com `…` no lugar dos campos faltantes e o botão Salvar desabilitado.

### Ações

- **Salvar**: valida (seção 8), grava em `campaigns` com `name` gerado, registra no changelog, redireciona para a listagem com o nome copiável.
- **Marcar como publicada**: preenche `published_at`; a partir daí a edição do nome fica bloqueada e o botão vira "Duplicar".
- **Duplicar**: abre o gerador pré-preenchido com os valores da campanha original (sem `published_at`, sem `meta_campaign_id`).

### Listagem de campanhas

Tabela com: nome (mono, botão copiar), expert, produto, funil, oferta, ano, publicada (sim/não), criada em. Filtros por expert, produto, funil, oferta, ano e busca por texto no nome. Ações: Editar (se não publicada), Duplicar, Marcar como publicada.

---

## 8. Validação do nome

Implemente duas funções puras, com testes unitários, e use as duas tanto no servidor quanto na prévia:

```ts
// Monta o nome a partir dos nove valores + sufixo opcional. Lança erro se qualquer valor for inválido.
buildCampaignName(fields: CampaignFields): string

// Quebra um nome em nove campos (+ sufixo) e valida cada um contra o dicionário ATUAL.
// Retorna { valid: boolean, fields?: CampaignFields, errors: string[] }.
parseCampaignName(name: string): ParseResult
```

Regras de `parseCampaignName`:
- Exatamente 8 `_` (ou 9, se o último campo for um sufixo `v\d{2}`).
- Cada campo só `[a-z0-9-]`.
- Campo 1 existe em `experts.code`; campo 2 existe em `products.slug` daquele expert; campo 3 existe em `funnels.code` daquele expert; campo 4 existe em `offers.code` daquele expert ou é `ofmix`; campo 5–8 existem no dicionário do tipo correspondente; campo 9 existe em `landing_pages.code` para a combinação, ou é `lpmix` / `na`.
- A validação é **dirigida pelo banco**, não por regex fixa: se o usuário cadastrar `carrossel` em formato, o nome com `carrossel` passa a ser válido sem mudar código.
- Erros devem apontar o campo e o motivo: `campo 4 (oferta): "of07" não está cadastrada para bbe`.

Na tela do gerador, inclua um bloco recolhido "Validar um nome existente": textarea, botão Validar, resultado com os nove campos separados e os erros, se houver. Serve para conferir campanhas criadas fora do sistema.

---

## 9. Seed (valores iniciais)

Crie um script de seed idempotente (roda várias vezes sem duplicar). Os dados abaixo vêm da planilha atual da agência.

### 9.1 Experts

| code | name |
|---|---|
| bbe | [PREENCHER] |
| fz | [PREENCHER] |
| pps | [PREENCHER] |
| dg | [PREENCHER] |

### 9.2 Produtos

| expert | slug | name |
|---|---|---|
| bbe | churrasco | [PREENCHER] |
| [PREENCHER] | hamburguer | [PREENCHER] |
| [PREENCHER] | english-kids-club | [PREENCHER] |
| [PREENCHER] | claude-negocios | [PREENCHER] |
| [PREENCHER] | fundamentos-clinico | [PREENCHER] |

### 9.3 Funis (por expert; descrição obrigatória)

| expert | code | description |
|---|---|---|
| bbe | a01 | [PREENCHER — ex.: VSL direto para checkout] |
| [PREENCHER] | | |

A planilha atual lista `a01`…`a05` de forma genérica. Cadastre aqui só os funis que existem de fato, um por expert; o gerador sugere o próximo código automaticamente.

### 9.4 Ofertas (por expert; descrição obrigatória)

| expert | code | description |
|---|---|---|
| bbe | of01 | oferta com ticket médio de R$ 347 |
| bbe | of02 | oferta com ticket médio de R$ 297 |
| [PREENCHER] | | |

A planilha atual lista `of01`…`of05` de forma genérica. Mesma regra dos funis.

### 9.5 LPs

| expert | produto | funil | oferta | code | url | slug (gerado) |
|---|---|---|---|---|---|---|
| bbe | churrasco | a01 | of01 | lpa | [PREENCHER] | bbe-churrasco-a01-of01-lpa |
| [PREENCHER] | | | | | | |

A planilha atual lista `lpa`…`lpg` de forma genérica; cadastre só as que existem.

### 9.6 Valores fixos

| type | values (nesta ordem) |
|---|---|
| year | `2026`, `2027` |
| temperature | `hot`, `cold` |
| auction | `abo`, `cbo` |
| format | `videos`, `estaticos`, `mix` |

Observação: a documentação da convenção também prevê `mix` em temperatura e `carrossel` em formato. **Não** entram no seed; se precisarmos, entram pelo cadastro de Valores fixos.

---

## 10. Critérios de aceite (escreva testes para cada um)

1. Selecionar o expert `bbe` no gerador carrega apenas produtos, funis e ofertas de `bbe`. Trocar para `fz` limpa produto, funil, oferta e LP.
2. O select de oferta exibe `of01 — oferta com ticket médio de R$ 347` e `of02 — oferta com ticket médio de R$ 297`, mais `ofmix — …` ao fim.
3. Com `bbe / churrasco / a01 / of01 / 2026 / hot / cbo / videos / lpa`, a prévia mostra `bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa` e 46 caracteres.
4. Com sufixo `v02`, o nome termina em `_lpa_v02`.
5. Criar nova oferta para `bbe` sugere `of03`. Tentar salvar `of02` para `bbe` retorna erro citando a descrição da `of02` existente.
6. Códigos de funil/oferta são únicos por expert: `a01` para `bbe` e `a01` para `fz` coexistem.
7. Cadastrar LP para `bbe / churrasco / a01 / of01` sugere `lpa` (ou a próxima letra livre) e gera slug `bbe-churrasco-a01-of01-lpa`; o slug não é editável.
8. Tentar cadastrar LP com produto de outro expert retorna erro de coerência.
9. Excluir uma oferta usada em campanha é bloqueado com a lista de campanhas e oferece "Desativar". Oferta desativada some do select do gerador e aparece no cadastro com "Mostrar inativos".
10. Depois de usada em campanha, o código da oferta fica desabilitado na edição; a descrição continua editável e a edição gera linha no changelog com `before` e `after`.
11. Campanha com `published_at` preenchido não aceita alteração de nome; "Duplicar" abre o gerador pré-preenchido.
12. `parseCampaignName("bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa")` retorna válido com os nove campos. `parseCampaignName("bbe_churrasco_a01_of09_2026_hot_cbo_videos_lpa")` retorna inválido apontando o campo 4. Nome com 7 underscores retorna inválido apontando a contagem.
13. Adicionar `carrossel` em Valores fixos → formato torna um nome com `carrossel` válido sem deploy.
14. Entrada `"Churrasco Premium"` num slug é normalizada para `churrasco-premium`; entrada `"churrasco_premium"` é rejeitada.
15. O seed roda duas vezes sem duplicar registros.

---

## 11. Fora do escopo desta spec (e o que já saiu do "fora")

- ~~Nomenclatura de anúncio (`adNNN_formato_conceito_vNN_lp`)~~ — **implementada** na Fase 2/3 com outro formato (o rascunho acima nunca foi usado). Ver § 11.1.
- Nomenclatura de conjunto de anúncios (`NN_tipo-publico_descricao_posicionamento`) — ainda fora.
- Montagem dos parâmetros de URL (`s=meta&c=…&t=…`).
- Integração com a API do Meta.
- Importação em massa da planilha antiga.

`campaigns.id` continua sem ser pai de conjuntos; `landing_pages.code` **não** entrou no nome do anúncio (o lançamento entra por sigla + NN).

### 11.1 Nome de anúncio — como ficou (Story 47.10, o vídeo v2 na 47.13 e o v3 na 47.16)

Seção **Nome Ads** (`?secao=ads`): Novo anúncio · Anúncios · Valores fixos · Hooks e bodies.

```
ad · carr (4 campos):      {tipo}{NN}_{expert}_{lançamento}_{mm-aaaa}[--{descricao}]
                           ad07_dg_perpetuo_09-2026 · ad03_dg_pg02_09-2026--gancho-demissao
adv — vídeo v3 (5 campos): {tipo}{NN}_{origem}_{expert}_{lançamento}_{mm-aaaa}[--{descricao}]
                           adv01_ia_dg_perpetuo_09-2026 · adv01_h_dg_pg04_09-2026   (Story 47.16, 23/09/2026; formato aprovado pelo Lucas)

{lançamento} = {sigla}{NN} (pg04) — ou só `perpetuo`, que não tem número
```

**Story 47.16 — o que mudou do v2 para o v3:**
- **Hook e body saíram do NOME do vídeo** — continuam escolhidos no gerador, obrigatórios e gravados (`naming_ads.hook_id`/`body_id`); o dicionário (Hooks e bodies), o "usado em N" e a trava do código não mudam. A origem (`ia`/`h`) **ficou** no nome.
- **`perpetuo` não tem número:** com essa sigla o lançamento é só `perpetuo`; número com `perpetuo` é erro (build, API e parse); toda outra sigla segue exigindo `NN` (01–99). A regra é da constante `perpetuo` no código (decisão 5.2), não de um atributo do dicionário. `naming_ads.launch_seq` aceita `NULL` (migration 0157).
- **O `--` é opcional:** o parse lê nome com ou sem `--` (sem ele, a descrição é vazia). Sem descrição, o **nome** gravado termina na data; a **estrutura** — o "Copiar estrutura" do designer — continua terminando em `--` (opção B, decidida pelo Danilo em 23/09).
- **Formatos publicados não mudam (regra 6):** o vídeo **v2** (7 campos, `…_{sigla}{NN}_{hNN}_{bNN}_{mm-aaaa}`) e o **padrão antigo** (4 campos) continuam válidos, cada um com o **seu** aviso; editar um registro re-grava no formato em que ele nasceu, lido do `name` gravado. Todo anúncio **novo** sai no v3. Os 6 anúncios do dg no ar desde 21–23/09 (`adv01_ia_dg_perpetuo_h01_b01_09-2026` … `adv06_…`) ficam registrados em v2, com o nome exato do Meta.

| campo | valor | regra |
|---|---|---|
| tipo + NN | `creative_type` (`ad` · `adv` · `carr`) + dois dígitos | NN **único por expert**, qualquer tipo (o 7º criativo do DG é `07`); sugerido pelo servidor, reservado na gravação (409 na corrida) |
| origem | `creative_origin` (`ia` — feito por inteligência artificial · `h` — feito por humano) | **só em `adv`**; obrigatória lá, proibida fora |
| expert | `naming_experts.code` | |
| sigla + NN | `launch_type` (`pg` · `l` · `m` · `pr` · `perpetuo`) + número do lançamento | NN escolhido, com sugestão (maior já usado para expert+sigla); **`perpetuo` sem número** (47.16) — o campo fica desabilitado e não há sugestão |
| hook · body | `naming_ad_parts` — `hNN` / `bNN` **por expert**, com descrição obrigatória (Dicionário › Nome Ads › Hooks e bodies) | **só em `adv`**; obrigatórios e gravados lá; o `h01` do DG não vale para o BBE; **fora do nome desde a 47.16** (só o v2 publicado os leva) |
| data | `mm-aaaa` | |
| `--` + descrição | livre, do designer; `[a-z0-9-]`; opcional no sistema | o `--` é a única exceção à regra "nunca `--`": marca onde o texto livre começa; o parse quebra no PRIMEIRO; **opcional no parse** e ausente do nome sem descrição (47.16) |

Regras que valem aqui e em mais lugar nenhum:
- **"Vídeo" = valor `adv`.** Outro tipo de vídeo no dicionário é decisão nova, não herda o formato.
- **Vídeo do padrão antigo** (`adv` gravado com 4 campos antes da 47.13) continua **válido com aviso** ("padrão antigo (47.10)"); editar descrição/lançamento/data não exige origem/hook/body e re-grava em 4 campos (regra 6: nome publicado não muda de formato). Para um nome no formato atual, **duplicar**.
- **Vídeo v2** (7 campos, 47.13) continua **válido com aviso próprio** ("padrão v2 (47.13)") e edita no v2 (47.16).
- Depois de salvo, tipo e NN do criativo **não mudam** (D23). Hook/body/origem de um vídeo (v2 ou v3) editam como lançamento/data.
- Código de hook/body **imutável depois de usado** em anúncio; excluir só sem uso.

Gerador: expert → tipo (+ origem ao lado, se vídeo) → NN | sigla | nº do lançamento → hook | body (se vídeo) → mês/ano → descrição. Prévia colorida por bloco; "Copiar estrutura" (até o `--`) é o que o designer recebe; "Salvar e criar outro" mantém expert, sigla, nº, data, origem, hook e body. Ao escolher o expert, a tela lista os anúncios já cadastrados dele.
