"use client";

/**
 * Swipe Files — hooks da biblioteca de referências.
 *
 * Upload não passa pela API: pede uma URL assinada, envia o arquivo direto pro
 * bucket e só então cria o registro com a URL final. Isso contorna o teto de
 * 10MB do multipart da API e não ocupa memória do container.
 */

import { useAuth } from "@clerk/nextjs";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AssetKind = "image" | "video" | "pdf" | "link" | "html" | "doc";

export interface SwipeFile {
  id: string;
  title: string;
  notes: string | null;
  assetKind: AssetKind;
  fileUrl: string | null;
  fileMime: string | null;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  sourceUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  brand: string | null;
  niche: string | null;
  platform: string | null;
  format: string | null;
  tags: string[];
  isFavorite: boolean;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

/** Uma opção de filtro com quantas referências ela alcança. */
export interface OpcaoDeFiltro {
  valor: string;
  n: number;
}

export interface SwipeFacets {
  platform: OpcaoDeFiltro[];
  format: OpcaoDeFiltro[];
  niche: OpcaoDeFiltro[];
  brand: OpcaoDeFiltro[];
  tags: OpcaoDeFiltro[];
}

export interface SwipeFilters {
  q?: string;
  /** Só as peças desta coleção. */
  colecao?: string;
  /** `brand` | `niche` | `platform` | `format` — a "pasta automática". */
  agruparPor?: string;
  platform?: string;
  format?: string;
  niche?: string;
  brand?: string;
  tag?: string;
  kind?: AssetKind;
  favorites?: boolean;
}

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const BASE = "/api/swipe-files";
/** O `fetch` cru da análise não passa pelo apiClient: multipart precisa de FormData. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function useSwipeFiles(filters: SwipeFilters) {
  const apiClient = useApiClient();
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.platform) qs.set("platform", filters.platform);
  if (filters.format) qs.set("format", filters.format);
  if (filters.niche) qs.set("niche", filters.niche);
  if (filters.brand) qs.set("brand", filters.brand);
  if (filters.tag) qs.set("tag", filters.tag);
  if (filters.kind) qs.set("kind", filters.kind);
  if (filters.favorites) qs.set("favorites", "1");
  if (filters.colecao) qs.set("colecao", filters.colecao);
  if (filters.agruparPor) qs.set("agruparPor", filters.agruparPor);
  const suffix = qs.toString() ? `?${qs}` : "";

  return useQuery({
    queryKey: ["swipe-files", suffix],
    queryFn: () =>
      apiClient<{
        items: SwipeFile[];
        facets: SwipeFacets;
        /** Tamanho da biblioteca inteira, sem filtro — para o "X de N". */
        total: number;
        /**
         * Os mesmos itens organizados por um atributo, quando pedido.
         *
         * Só os ids: repetir as peças dobraria o corpo da resposta para dizer
         * a mesma coisa. A tela remonta a partir de `items`.
         */
        grupos: { valor: string | null; ids: string[] }[] | null;
        storageReady: boolean;
      }>(`${BASE}${suffix}`),
    // Segura o resultado anterior enquanto refiltra: sem isso o grid pisca a
    // cada tecla digitada na busca.
    placeholderData: (prev) => prev,
  });
}

/**
 * As referências de uma lista de ids.
 *
 * Serve ao mapa de funil, que guarda nos blocos só os ids. A chave do cache
 * usa a lista ORDENADA: `[a,b]` e `[b,a]` são a mesma busca, e sem ordenar
 * cada reordenação de bloco viraria uma ida à rede.
 */
export function useSwipesPorIds(ids: string[]) {
  const apiClient = useApiClient();
  const chave = [...new Set(ids)].sort().join(",");

  return useQuery({
    queryKey: ["swipe-files-por-ids", chave],
    queryFn: () => apiClient<{ items: SwipeFile[] }>(`${BASE}/por-ids?ids=${chave}`),
    enabled: chave.length > 0,
    // A biblioteca muda devagar e o mapa relê a cada troca de aba: meia hora
    // de validade evita uma requisição por clique sem mostrar dado velho de
    // verdade.
    staleTime: 30 * 60 * 1000,
  });
}

export interface ColecaoDoSwipe {
  id: string;
  nome: string;
  descricao: string | null;
  /** A coleção onde esta mora. `null` = na raiz. */
  parentId: string | null;
  pecas: number;
  criadaEm: string | null;
  mexidaEm: string | null;
}

/**
 * As coleções, com a contagem de peças.
 *
 * Chamadas de "coleção" e não de "pasta" porque uma peça está em várias — o
 * mesmo criativo serve ao lançamento e às referências de escassez.
 */
export function useColecoes() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["swipe-colecoes"],
    queryFn: () => apiClient<{ colecoes: ColecaoDoSwipe[] }>(`${BASE}/colecoes`),
  });
}

export function useCriarColecao() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { nome: string; descricao?: string | null; parentId?: string | null }) =>
      apiClient<ColecaoDoSwipe & { jaExistia?: boolean }>(`${BASE}/colecoes`, {
        method: "POST",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["swipe-colecoes"] }),
  });
}

export function useAtualizarColecao() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: { id: string; nome?: string; descricao?: string | null }) =>
      apiClient(`${BASE}/colecoes/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["swipe-colecoes"] }),
  });
}

/** Apaga a coleção. As peças ficam — o vínculo é que cai. */
export function useExcluirColecao() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comAsPecas }: { id: string; comAsPecas?: boolean }) =>
      apiClient<{ ok: boolean; colecoesApagadas: number; pecasApagadas: number }>(
        `${BASE}/colecoes/${id}${comAsPecas ? "?comAsPecas=1" : ""}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["swipe-colecoes"] });
      // A grade pode estar mostrando peças que acabaram de ser apagadas.
      void qc.invalidateQueries({ queryKey: ["swipe-files"] });
    },
  });
}

export function useMexerNaColecao() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...dados
    }: {
      id: string;
      adicionar?: string[];
      remover?: string[];
    }) =>
      apiClient<{ pecas: number }>(`${BASE}/colecoes/${id}/pecas`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["swipe-colecoes"] });
      // A grade pode estar filtrada por esta coleção: sem isto, a peça
      // adicionada não aparece até o próximo F5.
      void qc.invalidateQueries({ queryKey: ["swipe-files"] });
    },
  });
}

export interface AchadoPorContexto {
  id: string;
  /** O que naquela peça responde à busca. Aparece no card. */
  motivo: string;
}

/**
 * Busca por CONTEXTO — o que a peça é, não a palavra que ela contém.
 *
 * ## Só entra quando a busca por texto não deu conta
 *
 * `habilitado` vem da tela: com resultado suficiente por texto, esta não roda.
 * A busca literal é instantânea e resolve a maioria dos casos ("Opal", "vsl");
 * chamar o modelo em cima dela seria pagar 4 segundos por nada.
 *
 * ## Espera a digitação parar
 *
 * O termo chega aqui já em repouso (ver `useTermoEmRepouso`). Sem isso, digitar
 * "escassez" dispararia oito buscas — uma por letra.
 */
export function useBuscaPorContexto(q: string, habilitado: boolean) {
  const apiClient = useApiClient();
  const termo = q.trim();

  return useQuery({
    queryKey: ["swipe-busca-contexto", termo],
    queryFn: () =>
      apiClient<{ achados: AchadoPorContexto[]; indisponivel?: string }>(
        `${BASE}/busca-contexto`,
        { method: "POST", body: JSON.stringify({ q: termo }) },
      ),
    enabled: habilitado && termo.length >= 3,
    // A resposta para o mesmo termo não muda enquanto a biblioteca não muda —
    // e cada chamada custa uma ida ao modelo. Meia hora é conservador.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

export function useLinkPreview() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (url: string) =>
      apiClient<LinkPreview>(`${BASE}/preview`, {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
  });
}

export interface CreateSwipeInput {
  title: string;
  assetKind: AssetKind;
  notes?: string;
  fileUrl?: string;
  fileKey?: string;
  fileMime?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  sourceUrl?: string;
  brand?: string;
  niche?: string;
  platform?: string;
  format?: string;
  tags?: string[];
}

export function useCreateSwipeFile() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSwipeInput) =>
      apiClient<{ id: string }>(BASE, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swipe-files"] }),
  });
}

export function useUpdateSwipeFile() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateSwipeInput> & { isFavorite?: boolean } }) =>
      apiClient<{ ok: boolean }>(`${BASE}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swipe-files"] }),
  });
}

export function useDeleteSwipeFile() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<{ ok: boolean }>(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swipe-files"] }),
  });
}

/**
 * Sobe o arquivo e devolve a URL pública.
 *
 * Vai para a NOSSA API, não direto ao bucket. O caminho anterior era por URL
 * assinada — mais barato, porque o servidor nem via o arquivo — mas o Supabase
 * Storage responde **500** ao `PUT` assinado. O erro é dele, não traz corpo
 * útil e acontece na tela de quem está trabalhando.
 *
 * O `onProgress` continua com XHR: `fetch` não expõe progresso de upload, e um
 * vídeo de 100 MB sem barra é uma tela travada.
 */
export function useUploadToBucket() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (pct: number) => void;
    }) => {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);

      return new Promise<{ publicUrl: string; key: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}${BASE}/upload`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        // Sem `Content-Type`: o browser precisa pôr o boundary do multipart.

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as { publicUrl: string; key: string });
            return;
          }
          // A mensagem do servidor vem no corpo e diz o que houve — muito
          // melhor que "o bucket recusou (500)", que não deixa ninguém agir.
          let motivo = `Falha ao enviar (${xhr.status}).`;
          try {
            const corpo = JSON.parse(xhr.responseText) as { error?: string };
            if (corpo?.error) motivo = corpo.error;
          } catch {
            /* resposta sem JSON — fica a mensagem padrão */
          }
          reject(new Error(motivo));
        };
        xhr.onerror = () => reject(new Error("Falha de rede ao enviar o arquivo."));
        xhr.send(form);
      });
    },
  });
}

/** Lê dimensões antes do upload — o card reserva a proporção e o grid não salta. */
export function readMediaDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);

    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        cleanup();
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        cleanup();
        resolve(null);
      };
      img.src = url;
      return;
    }
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        cleanup();
        resolve({ width: v.videoWidth, height: v.videoHeight });
      };
      v.onerror = () => {
        cleanup();
        resolve(null);
      };
      v.src = url;
      return;
    }
    cleanup();
    resolve(null);
  });
}

/** O que a IA sugere para preencher o formulário. `null` = ela não soube. */
export interface SugestaoDeSwipe {
  titulo: string | null;
  anotacoes: string | null;
  marca: string | null;
  nicho: string | null;
  plataforma: string | null;
  formato: string | null;
  tags: string[];
}

/**
 * Manda o arquivo para a IA catalogar.
 *
 * O arquivo NÃO passa pelo bucket: a análise acontece antes de a pessoa decidir
 * salvar, e subir para descartar depois deixaria lixo no R2 a cada tentativa.
 */
/** O que o servidor manda enquanto trabalha. Só `pronto` traz resultado. */
export type PassoDaAnalise =
  | { tipo: "lendo"; bytes: number }
  | { tipo: "analisando" }
  | { tipo: "pronto"; sugestao: SugestaoDeSwipe }
  | { tipo: "erro"; error: string };

/**
 * Manda o arquivo e acompanha a leitura passo a passo.
 *
 * A resposta é NDJSON e não JSON, porque um PDF leva de 20 a 60 segundos para
 * ser lido: uma requisição muda esse tempo todo é cortada no meio do caminho, e
 * a tela fica pendurada sem erro nem resultado. Cada linha que chega é prova de
 * que ainda está vivo — e vira texto na tela, que é o que a pessoa queria saber.
 *
 * `onPasso` é opcional de propósito: quem só quer o resultado ignora.
 */
export function useAnalisarSwipe() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async ({
      file,
      origem,
      onPasso,
    }: {
      file: File;
      origem?: string;
      onPasso?: (p: PassoDaAnalise) => void;
    }) => {
      const form = new FormData();
      form.append("file", file);
      if (origem) form.append("origem", origem);

      const token = await getToken();

      // Um teto absoluto. Sem ele, uma conexão que fica aberta sem mandar nada
      // deixa o botão girando para sempre — que é pior que dar erro, porque
      // ninguém sabe se pode preencher à mão.
      const relogio = new AbortController();
      const prazo = setTimeout(() => relogio.abort(), 3 * 60 * 1000);

      let r: Response;
      try {
        r = await fetch(`${API_URL}${BASE}/analisar`, {
          method: "POST",
          // Sem `Content-Type`: o browser precisa pôr o boundary do multipart.
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
          signal: relogio.signal,
        });
      } catch (e) {
        clearTimeout(prazo);
        if (relogio.signal.aborted) {
          throw new Error("A leitura passou de 3 minutos. Preencha à mão — nada se perdeu.");
        }
        throw e;
      }

      // Erro de validação (arquivo vazio, tipo errado) ainda vem como JSON: são
      // respostas imediatas, que não precisam de stream nenhum.
      if (!r.ok) {
        clearTimeout(prazo);
        const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corpo?.error ?? "Não consegui analisar agora.");
      }

      try {
        const leitor = r.body?.getReader();
        if (!leitor) throw new Error("Não consegui ler a resposta.");

        const decodificador = new TextDecoder();
        let sobra = "";
        let resultado: SugestaoDeSwipe | null = null;

        const processar = (linha: string) => {
          const texto = linha.trim();
          if (!texto) return;
          let passo: PassoDaAnalise;
          try {
            passo = JSON.parse(texto) as PassoDaAnalise;
          } catch {
            // Linha truncada não derruba o que já chegou.
            return;
          }
          onPasso?.(passo);
          if (passo.tipo === "pronto") resultado = passo.sugestao;
          if (passo.tipo === "erro") throw new Error(passo.error);
        };

        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          sobra += decodificador.decode(value, { stream: true });
          const linhas = sobra.split("\n");
          // A última pode estar pela metade — fica para a próxima rodada.
          sobra = linhas.pop() ?? "";
          for (const l of linhas) processar(l);
        }
        if (sobra) processar(sobra);

        if (!resultado) {
          // Conexão fechou sem `pronto` nem `erro`: alguém cortou no meio.
          throw new Error("A conexão caiu antes de terminar. Tente de novo.");
        }
        return { sugestao: resultado as SugestaoDeSwipe };
      } finally {
        clearTimeout(prazo);
      }
    },
  });
}

// ============================================================
// Aviso no ClickUp
// ============================================================

export interface ConfigDoAvisoNoClickUp {
  id: string;
  enabled: boolean;
  channelId: string;
  channelName: string | null;
  videoChannelId: string | null;
  videoChannelName: string | null;
  mentionUsers: { id: string; username: string }[];
}

export function useAvisoNoClickUp() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["swipe-clickup-alert"],
    queryFn: () =>
      apiClient<{ config: ConfigDoAvisoNoClickUp | null; clickupPronto: boolean }>(
        `${BASE}/clickup-alert`,
      ),
  });
}

export function useSalvarAvisoNoClickUp() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cfg: Omit<ConfigDoAvisoNoClickUp, "id">) =>
      apiClient<ConfigDoAvisoNoClickUp>(`${BASE}/clickup-alert`, {
        method: "PUT",
        body: JSON.stringify(cfg),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swipe-clickup-alert"] }),
  });
}

/** Manda uma mensagem de teste — é como se confere o canal sem subir nada. */
export function useTestarAvisoNoClickUp() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: true }>(`${BASE}/clickup-alert/test`, { method: "POST", body: "{}" }),
  });
}

/** Canais do workspace. Só busca quando o painel abre — são ~100 canais. */
export function useCanaisDoClickUp(enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["swipe-clickup-channels"],
    queryFn: () => apiClient<{ channels: { id: string; name: string }[] }>(`${BASE}/clickup-channels`),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function useMembrosDoClickUp(enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["swipe-clickup-members"],
    queryFn: () =>
      apiClient<{ members: { id: string; username: string; email: string | null }[] }>(
        `${BASE}/clickup-members`,
      ),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

// ============================================================
// Importar o acervo antigo do ClickUp
// ============================================================

export type PassoDaImportacao =
  | { tipo: "lendo-canal" }
  | { tipo: "trabalhando" }
  | {
      tipo: "plano";
      mensagens: number;
      total: number;
      jaImportados: number;
      /** Tudo que falta importar. `aImportar` e so o pedaco deste lote. */
      pendentes: number;
      aImportar: number;
      comArquivo: number;
    }
  | {
      tipo: "item";
      i: number;
      de: number;
      titulo: string;
      kind: "image" | "video" | "pdf" | "link" | "html" | "doc";
      status: "ok" | "erro";
      erro?: string;
    }
  | { tipo: "fim"; criados: number; falhas: number; ignorados?: number; simulado?: boolean }
  | { tipo: "erro"; error: string };

export interface ResumoDaImportacao {
  criados: number;
  falhas: number;
  ignorados: number;
  simulado: boolean;
}

/**
 * Importa um canal do ClickUp para a biblioteca.
 *
 * ## Duas etapas, e a primeira não grava
 *
 * Sem `confirmar`, a chamada só planeja: diz quantos itens sairiam dali e
 * quantos já entraram antes. É o que permite olhar o número antes de criar
 * centenas de registros — e o número é a única forma de perceber que o canal
 * escolhido está errado.
 *
 * ## O prazo é longo porque o trabalho é longo
 *
 * Centenas de arquivos, centenas de megabytes, um por vez. Vinte minutos é o
 * teto; abaixo disso o navegador desistiria no meio de uma importação que o
 * servidor ainda está fazendo — e aí a tela mente, dizendo que falhou.
 */
export function useImportarDoClickUp() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      confirmar,
      analisar,
      limite,
      onPasso,
    }: {
      channelId: string;
      confirmar?: boolean;
      analisar?: boolean;
      limite?: number;
      onPasso?: (p: PassoDaImportacao) => void;
    }): Promise<ResumoDaImportacao> => {
      const token = await getToken();
      const relogio = new AbortController();
      const prazo = setTimeout(() => relogio.abort(), 20 * 60 * 1000);

      let r: Response;
      try {
        r = await fetch(`${API_URL}${BASE}/importar-clickup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ channelId, confirmar, analisar, limite }),
          signal: relogio.signal,
        });
      } catch (e) {
        clearTimeout(prazo);
        if (relogio.signal.aborted) {
          throw new Error(
            "Passou de 20 minutos. O servidor pode ter continuado — recarregue e veja o que entrou.",
          );
        }
        throw e;
      }

      if (!r.ok) {
        clearTimeout(prazo);
        const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corpo?.error ?? "Não consegui importar.");
      }

      try {
        const leitor = r.body?.getReader();
        if (!leitor) throw new Error("Não consegui ler a resposta.");

        const decodificador = new TextDecoder();
        let sobra = "";
        let fim: ResumoDaImportacao | null = null;

        const processar = (linha: string) => {
          const texto = linha.trim();
          if (!texto) return;
          let passo: PassoDaImportacao;
          try {
            passo = JSON.parse(texto) as PassoDaImportacao;
          } catch {
            return;
          }
          onPasso?.(passo);
          if (passo.tipo === "fim") {
            fim = {
              criados: passo.criados,
              falhas: passo.falhas,
              ignorados: passo.ignorados ?? 0,
              simulado: Boolean(passo.simulado),
            };
          }
          if (passo.tipo === "erro") throw new Error(passo.error);
        };

        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          sobra += decodificador.decode(value, { stream: true });
          const linhas = sobra.split("\n");
          sobra = linhas.pop() ?? "";
          for (const l of linhas) processar(l);
        }
        if (sobra) processar(sobra);

        if (!fim) throw new Error("A conexão caiu antes de terminar.");
        return fim;
      } finally {
        clearTimeout(prazo);
      }
    },
    onSuccess: (r) => {
      // Só invalida quando gravou: uma simulação não mudou nada, e recarregar
      // a grade à toa pisca a tela inteira sem motivo.
      if (!r.simulado && r.criados > 0) {
        void qc.invalidateQueries({ queryKey: ["swipe-files"] });
      }
    },
  });
}
