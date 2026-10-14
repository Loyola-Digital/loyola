/*
 * Service worker do Loyola X — só notificação, nada de cache.
 *
 * Não tem `fetch` de propósito: sem ele o navegador não passa nenhuma
 * requisição por aqui, então este arquivo não pode servir página velha nem
 * atrapalhar a sessão do Clerk. Push exige um service worker registrado; é o
 * único motivo deste arquivo existir.
 *
 * `skipWaiting` + `clients.claim`: sem os dois, uma versão nova só assume
 * depois que a pessoa fecha TODAS as abas do app — e um erro aqui ficaria no ar
 * por dias.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    // Push sem corpo (ou corpo que não é JSON) ainda deve virar notificação:
    // o navegador mostra uma genérica sozinho se a gente não mostrar nenhuma.
    dados = {};
  }

  const titulo = dados.titulo || "Loyola X";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Mesma `tag` substitui a notificação anterior em vez de empilhar.
      tag: dados.tag || "loyola-x",
      data: { url: dados.url || "/entrar" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/entrar";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      // Se o app já está aberto, leva a aba existente para o destino em vez de
      // abrir uma segunda — o PWA instalado tem uma janela só.
      for (const janela of janelas) {
        if (janela.url.includes(self.location.origin)) {
          return janela.focus().then(() => janela.navigate(destino).catch(() => undefined));
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
