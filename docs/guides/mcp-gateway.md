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
| Host / endereço do gateway | _(a preencher)_ |
| Caminho do repo na máquina | _(a preencher)_ |
| Como o processo do MCP é iniciado | _(systemd? pm2? docker? — a preencher)_ |
| Comando de restart | _(a preencher)_ |
| Quem tem acesso hoje | _(a preencher)_ |
| Dono declarado da atualização | _(a preencher)_ |

## Como atualizar

Na máquina onde o MCP roda (não na sua):

```bash
cd <repo no gateway>
bash scripts/atualizar-mcp-gateway.sh
```

O script mostra o antes e o depois, puxa a `main`, builda e lembra do passo que
ele não pode fazer. À mão, é isto:

```bash
git pull origin main
pnpm --filter @loyola-x/mcp build
# reiniciar QUEM INICIA o MCP — ver abaixo
```

### O "reiniciar o processo" não é um systemctl

O MCP é **stdio**: não é um serviço que fica no ar, é um executável que o
CLIENTE spawna. Quem o inicia é o Claude do Inácio, pelo `mcpServers` do config
dele:

```json
{
  "mcpServers": {
    "loyola-x": {
      "command": "node",
      "args": ["/caminho/absoluto/loyola/packages/mcp/dist/index.js"],
      "env": { "LOYOLA_API_BASE_URL": "...", "LOYOLA_API_KEY": "..." }
    }
  }
}
```

Consequências práticas:

- **build sem reiniciar o cliente não muda nada** — o processo antigo continua
  no ar com o código velho em memória;
- reiniciar é reiniciar a **sessão/serviço do Inácio**, não um daemon do MCP;
- se depois do restart o roster ainda vier curto, o `args` do config aponta para
  **outro** `dist/` — é o caminho a conferir primeiro.

### Se você não sabe onde o repo está na máquina

```bash
# acha o clone do repo
find / -maxdepth 6 -type d -name "loyola" -not -path "*/node_modules/*" 2>/dev/null
# acha o config que registra o MCP (e revela o caminho do dist em uso)
grep -rl "loyola-x" ~/.claude* ~/.config 2>/dev/null
```

### Conferindo

```bash
git log --oneline -1                                  # o commit que você puxou
grep -c 'server.registerTool(' packages/mcp/src/tools.ts   # 18 hoje
```

⚠️ Use `server.registerTool(`, com o prefixo. `grep -c registerTool` sozinho
devolve **19**: conta também a linha da função `registerTools`, que é a
declaração, não uma tool. Um número a mais aqui manda procurar problema onde não
tem.

Depois do restart, peça ao Inácio para listar as tools. Se o `grep` der 18 e o
roster não mostrar as novas, o processo não reiniciou — só o build não basta.

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
