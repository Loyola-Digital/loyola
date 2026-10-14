"use client";

/**
 * Ligar e desligar a notificação push NESTE aparelho.
 *
 * "Inscrito" é por aparelho, não por conta: a mesma pessoa no celular e no
 * computador são duas inscrições, e desligar numa não mexe na outra. Por isso
 * a tela pergunta ao próprio navegador quem está inscrito, em vez de confiar na
 * lista do servidor.
 */

import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { chaveVapidParaBytes } from "@/lib/utils/chave-vapid";

export interface EstadoDoPush {
  /** O navegador tem push? Safari no Mac e navegador antigo não têm. */
  suportado: boolean;
  /** `default` = nunca perguntamos; `denied` = só dá pra reverter nos ajustes do navegador. */
  permissao: NotificationPermission | null;
  inscrito: boolean;
  /**
   * No iPhone o push SÓ existe com o app na tela de início. No navegador puro a
   * API nem aparece, e o erro vira "seu navegador não suporta" — que é
   * verdadeiro e inútil.
   */
  precisaInstalar: boolean;
  carregando: boolean;
  erro: string | null;
}

export function usePush() {
  const apiClient = useApiClient();
  const [estado, setEstado] = useState<EstadoDoPush>({
    suportado: false,
    permissao: null,
    inscrito: false,
    precisaInstalar: false,
    carregando: true,
    erro: null,
  });

  const conferir = useCallback(async () => {
    const suportado =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    // iOS só expõe push dentro do app instalado. Sem isso a pessoa fica
    // clicando num botão que nunca funciona.
    const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent ?? "");
    const instalado =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!suportado) {
      setEstado({
        suportado: false,
        permissao: null,
        inscrito: false,
        precisaInstalar: ehIOS && !instalado,
        carregando: false,
        erro: null,
      });
      return;
    }

    const registro = await navigator.serviceWorker.getRegistration();
    const inscricao = await registro?.pushManager.getSubscription();
    setEstado({
      suportado: true,
      permissao: Notification.permission,
      inscrito: Boolean(inscricao),
      precisaInstalar: ehIOS && !instalado,
      carregando: false,
      erro: null,
    });
  }, []);

  useEffect(() => {
    void conferir();
  }, [conferir]);

  const ativar = useCallback(async () => {
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    try {
      const resposta = await apiClient<{
        chave: string | null;
        configuracao?: "ok" | "ausente" | "invalida";
        detalhe?: string;
      }>("/api/push/chave-publica");
      if (!resposta.chave) {
        // Distinguir "não configurado" de "configurado errado" poupa a busca
        // pela causa: as duas falham no mesmo clique.
        throw new Error(
          resposta.configuracao === "invalida"
            ? `As chaves de notificação do servidor estão inválidas: ${resposta.detalhe ?? "formato recusado"}`
            : "O servidor está sem as chaves de notificação.",
        );
      }
      const chave = resposta.chave;

      const registro = await navigator.serviceWorker.register("/sw.js");
      // Sem esperar o `ready` a inscrição falha no primeiro clique e funciona no
      // segundo — o service worker ainda está instalando.
      await navigator.serviceWorker.ready;

      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado((e) => ({ ...e, permissao, carregando: false }));
        return;
      }

      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveVapidParaBytes(chave),
      });

      await apiClient("/api/push/inscricoes", {
        method: "POST",
        body: JSON.stringify(inscricao.toJSON()),
      });
      await conferir();
    } catch (err) {
      setEstado((e) => ({
        ...e,
        carregando: false,
        erro: err instanceof Error ? err.message : "Não consegui ativar.",
      }));
    }
  }, [apiClient, conferir]);

  const desativar = useCallback(async () => {
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        await apiClient("/api/push/inscricoes", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        });
        await inscricao.unsubscribe();
      }
      await conferir();
    } catch (err) {
      setEstado((e) => ({
        ...e,
        carregando: false,
        erro: err instanceof Error ? err.message : "Não consegui desativar.",
      }));
    }
  }, [apiClient, conferir]);

  const testar = useCallback(
    () => apiClient<{ enviados: number }>("/api/push/teste", { method: "POST" }),
    [apiClient],
  );

  return { ...estado, ativar, desativar, testar, conferir };
}
