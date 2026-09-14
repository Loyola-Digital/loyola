-- Guarda a redirect_uri com que o cliente OAuth do SendFlow foi registrado.
--
-- ## O problema que isto resolve
--
-- O cliente é registrado UMA vez e reusado (registrar a cada clique encheria a
-- conta do SendFlow de clientes órfãos). Mas o `redirect_uri` é montado a cada
-- pedido, a partir de `API_PUBLIC_URL` ou do host da requisição.
--
-- Quando os dois divergem — a env mudou, o host atrás do proxy mudou, o
-- protocolo saiu como http — o SendFlow recusa com
-- `redirect_uri not registered`, e a tela não tem como saber por quê: ela
-- mostra "Conectado", porque a linha no banco continua lá.
--
-- Guardando a URI do registro, o código compara antes de reusar e registra um
-- cliente novo quando ela mudou.
--
-- NULL = conexão criada antes desta coluna; nesse caso vale a regra antiga
-- (reusa), porque não dá para saber com que URI ela foi registrada.

ALTER TABLE sendflow_connections
  ADD COLUMN IF NOT EXISTS redirect_uri text;
