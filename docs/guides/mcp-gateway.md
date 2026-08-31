# O gateway do MCP — onde roda, quem atualiza, como saber que está atrasado

> Story 44.22. Este documento existe porque a informação abaixo **não estava
> escrita em lugar nenhum**, e o custo disso foi medido: cinco tools entregues
> em julho só chegaram ao Inácio em 28/08. Ele passou dois meses analisando sem
> saber que tinha row-level de venda disponível.

## Por que o merge não basta

Deploy da API e bundle do MCP são coisas diferentes:

| | quem atualiza | quando |
|---|---|---|
| Rota da API (`/api/public/...`) | pipeline da `main` | no merge, sozinho |
| Tool do MCP (`packages/mcp`) | **uma pessoa, à mão, no gateway** | nunca, se ninguém for lá |

O MCP é um processo **stdio**: ele não é um serviço que recebe deploy, é um
executável que o gateway inicia. `packages/mcp/dist` é gitignored, então não
adianta commitar o bundle — o build tem que rodar na própria máquina.

Um bundle velho **não dá erro**. Ele serve menos tools, em silêncio. É por isso
que julho passou batido.

## Onde roda e quem tem acesso

> ⚠️ **A PREENCHER — Lucas.** Estes campos são a razão de ser deste documento;
> deixá-los vazios reproduz exatamente a falha que ele documenta. Preencher leva
> dois minutos e é o que impede a próxima repetição.

| campo | valor |
|---|---|
| Host / endereço do gateway | container do Inácio, orquestrado pelo Coolify |
| Caminho do repo na máquina | **não existe** — o único `.git` no container é o workspace do agente, sem remote e sem commits. O bundle é assado na imagem, a partir do fork do [openclaw](https://github.com/lucasvital/inacio) |
| Como o processo do MCP é iniciado | **stdio**, pelo cliente — não é serviço de rede |
| Comando de restart | **não há**. O caminho é: push no fork → redeploy no Coolify → `docker pull` no host (ver abaixo) → reiniciar a sessão do Inácio |
| Quem tem acesso hoje | só o Lucas (fork, Coolify e host) |
| Dono declarado da atualização | _(a definir — hoje é gargalo de uma pessoa só)_ |

### ⚠️ Redeploy no Coolify NÃO basta

O `docker-compose.coolify.yml` do Inácio usa **`pull_policy: missing`**, de
propósito: o helper do Coolify não consegue autenticar no GHCR. Com essa
política, o Docker só busca a imagem quando **não tem nenhuma** — e ele sempre
tem, então o redeploy reinicia o container com a imagem **velha**.

Isso já custou três deploys seguidos que "não pegaram". O passo que falta é, no
**host**:

```bash
docker pull ghcr.io/lucasvital/inacio:latest
```

e só então o redeploy.

## Como atualizar

**Não é no gateway.** Medido no container do Inácio (28/08):

- não existe repo do Loyola X lá — o único `.git` é o workspace do agente,
  **sem remote e sem commits**;
- não existe `packages/mcp/dist` em uso;
- o que roda é `/app/vendor/loyola-mcp/index.cjs`, um bundle único de ~1,1 MB
  **assado dentro da imagem Docker** do [openclaw](https://github.com/openclaw/openclaw);
- e não há serviço para reiniciar: o MCP é stdio, iniciado pelo cliente.

O README que vive ao lado do bundle (`/app/vendor/loyola-mcp/README.md`) diz o
procedimento real — e ele passa por **um segundo repositório**:

> `index.cjs` … is baked into the Docker image … Then commit the new `index.cjs`
> and push (the build-image workflow bakes it into the next image).

### O caminho

```bash
# 1. na sua máquina, no repo do Loyola X
bash scripts/gerar-bundle-mcp.sh

# 2. no fork do openclaw
cp <saida>.cjs <fork>/vendor/loyola-mcp/index.cjs
git add vendor/loyola-mcp/index.cjs && git commit && git push

# 3. redeploy do Inácio no Coolify (a imagem é reassada)
# 4. NO HOST: docker pull ghcr.io/lucasvital/inacio:latest
#    (sem isto o `pull_policy: missing` reinicia com a imagem VELHA)
# 5. reiniciar a sessão do Inácio e conferir o roster
```

O script gera, **valida conversando MCP com o bundle** (handshake + `tools/list`)
e só então declara pronto: contar texto não prova que o servidor sobe, e um
bundle que não sobe tira TODAS as tools do Inácio — pior que o atraso que se
queria corrigir.

### Trocar o arquivo dentro do container não dura

Funciona até o próximo deploy: a imagem traz a versão dela de volta. O
`.bak-20260713T144717Z` ao lado do bundle em produção sugere que foi isso que
aconteceu em julho — o que ajuda a explicar uma atualização "já feita" que, um
mês depois, não estava mais lá.

### Por que isso passou batido

A atualização depende de tocar **um repositório que não é o do Loyola X**, com
um workflow de imagem no meio. Isso não estava escrito em lugar nenhum deste
repo — o README com o procedimento vive *dentro da imagem*, ou seja, só é
encontrado por quem já está caçando o problema.

## O check que acusa a defasagem

Documentar já tinha sido tentado: a frase certa estava no doc certo desde julho
("as tools novas exigem o bundle atualizado no teu gateway"), e o
`contract.ts` registrava, duas vezes, que `packages/mcp` não tinha checagem de
contrato. Não funcionou. Por isso agora são **duas travas de código**:

### 1. No ar: o próprio MCP se compara com a `main`

Ao iniciar, antes de aceitar conexão, o servidor:

1. pergunta à API o que a `main` tem — `GET /api/public/v1/mcp-manifest`, que
   devolve a lista canônica (`TOOLS_DO_MCP`, em `@loyola-x/shared`), o contrato
   e a data do build da API;
2. compara com as tools que **ele mesmo acabou de registrar** (contadas no
   registro real, não numa lista escrita à mão — uma lista à mão diria "tenho as
   18" mesmo num bundle de julho);
3. se faltar alguma, registra no roster a tool
   **`AVISO_bundle_do_mcp_desatualizado`**, cuja descrição já diz o que falta,
   há quantos dias, e o comando para corrigir.

O aviso é uma **tool**, e não um log em stderr, porque log de gateway ninguém lê
— e porque quem descobriu o problema das duas vezes foi quem olhou o roster.

No cenário real de julho, a mensagem teria sido:

> Este gateway serve 11 tools; a main tem 18. FALTAM 7: get_stage_cadeia_cac,
> get_project_panorama, get_stage_sales, get_funnel_sales, get_stage_sales_rows,
> get_cross_launch, get_stage_operational_costs. O bundle é ~44 dia(s) mais
> antigo que a API. Para corrigir, NO GATEWAY: git pull origin main && pnpm
> --filter @loyola-x/mcp build && reinicie o processo do MCP.

Se a API estiver fora do ar ou a chave não tiver scope, o MCP sobe normalmente e
loga `manifesto indisponível` — a checagem é acessória e não pode derrubar o
servidor.

**Limite honesto:** o bundle que está no gateway agora não tem esse código. O
aviso passa a valer **a partir do primeiro rebuild** — ele evita a repetição, não
detecta a defasagem atual.

### 2. No build: a lista canônica não pode mentir

`pnpm --filter @loyola-x/mcp build` roda `scripts/verificar-tools.mjs` antes do
`tsc`. Ele compara `TOOLS_DO_MCP` com os `server.registerTool(` de `tools.ts` e
**falha o build** se divergirem — no CI e também no rebuild feito no gateway.

Sem isso, alguém adicionaria uma tool sem atualizar a lista e a checagem passaria
a mentir na pior direção: diria que o gateway está em dia enquanto falta tool.

Provado removendo uma tool da lista: `exit 1`, com o nome da divergência.

## Quando você mexer em `packages/mcp/`

Adicionou ou removeu tool? **Atualize `packages/shared/src/mcp-tools.ts` no mesmo
PR** (o build cobra) e avise que o gateway precisa de rebuild — o merge não faz
isso por você.

## O detector de defasagem tem um ponto cego

O `AVISO_bundle_do_mcp_desatualizado` compara **nomes de tools**. Ele pega
tool nova que falta — que é o caso mais comum — e **não pega** mudança de
parâmetro dentro de uma tool que já existe.

Foi o que aconteceu com a paginação de `get_creative_performance`: os dois
bundles têm as mesmas 18 tools e zero avisos, mas um aceita `limit: 500` e
`offset` e o outro para em 200. Gateway defasado fica **idêntico** a gateway em
dia.

Enquanto o detector não comparar assinatura, o jeito de saber é chamar a tool
com um valor que só o bundle novo aceita:

```
get_creative_performance com limit: 300
  aceitou                                    → bundle novo ✅
  "Too big: expected number to be <=200"     → ainda é o velho ❌
```
