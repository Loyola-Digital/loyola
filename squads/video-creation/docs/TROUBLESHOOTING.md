# Troubleshooting: Solucao de Problemas

> Guia completo para diagnosticar e resolver problemas comuns na criacao de video com IA.

---

## Indice

1. [Diagnostico Rapido](#diagnostico-rapido)
2. [Problemas de ComfyUI](#problemas-de-comfyui)
3. [Erros de VRAM (Out of Memory)](#erros-de-vram-out-of-memory)
4. [Falhas no Carregamento de Modelos](#falhas-no-carregamento-de-modelos)
5. [Problemas de Qualidade de Video](#problemas-de-qualidade-de-video)
6. [Problemas de Motion e Flickering](#problemas-de-motion-e-flickering)
7. [Problemas de Audio e Sincronizacao](#problemas-de-audio-e-sincronizacao)
8. [Erros de Workflow](#erros-de-workflow)
9. [Problemas de Custom Nodes](#problemas-de-custom-nodes)
10. [Problemas de Consistencia de Personagens](#problemas-de-consistencia-de-personagens)
11. [Problemas de Upscaling e Enhancement](#problemas-de-upscaling-e-enhancement)
12. [Problemas de Performance](#problemas-de-performance)
13. [Erros de Sistema e Ambiente](#erros-de-sistema-e-ambiente)

---

## Diagnostico Rapido

Antes de tudo, rode o diagnostico automatizado:

```
/video-setup
```

Isso verifica todos os pre-requisitos e identifica problemas comuns.

### Checklist Rapido de Problemas

```
O COMFYUI INICIA?
  [ ] Sim -> Pule para "Erros de Workflow" ou "Qualidade de Video"
  [ ] Nao -> Va para "Problemas de ComfyUI"

O MODELO CARREGA?
  [ ] Sim -> Pule para "Qualidade de Video"
  [ ] Nao -> Va para "Falhas no Carregamento de Modelos"

O VIDEO GERA MAS TEM PROBLEMAS?
  [ ] Tela preta          -> Va para "Problemas de Qualidade"
  [ ] Flickering           -> Va para "Problemas de Motion"
  [ ] Artefatos           -> Va para "Problemas de Qualidade"
  [ ] Motion estranho     -> Va para "Problemas de Motion"
  [ ] Personagem diferente -> Va para "Consistencia de Personagens"

O COMFYUI CRASHA NO MEIO?
  [ ] "CUDA out of memory" -> Va para "Erros de VRAM"
  [ ] Erro de node         -> Va para "Problemas de Custom Nodes"
  [ ] Erro generico        -> Va para "Erros de Workflow"
```

---

## Problemas de ComfyUI

### ComfyUI nao inicia

**Sintoma:** Ao executar `python main.py`, o ComfyUI nao abre ou da erro.

**Causa 1: Python errado**
```bash
# Verificar versao
python --version
# Deve ser 3.10.x ou 3.11.x
# Python 3.12+ pode ter incompatibilidades
```

**Solucao:** Instale Python 3.10 ou 3.11. Use pyenv ou conda para gerenciar versoes.

**Causa 2: Dependencias faltando**
```bash
cd /Users/felipegobbi/ComfyUI
pip install -r requirements.txt
```

**Causa 3: PyTorch nao instalado corretamente**
```bash
# Verificar se CUDA esta disponivel
python -c "import torch; print(torch.cuda.is_available())"
# Deve retornar True

# Se False, reinstale PyTorch com CUDA:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

**Causa 4: Porta ja em uso**
```bash
# Se porta 8188 esta ocupada
python main.py --port 8189
```

### ComfyUI inicia mas nao aceita conexao

**Sintoma:** ComfyUI inicia no terminal mas nao abre no navegador.

**Solucoes:**
1. Verifique se acessou `http://127.0.0.1:8188` (nao https)
2. Tente `http://localhost:8188`
3. Verifique firewall/antivirus
4. Se usando via rede: `python main.py --listen 0.0.0.0`

### ComfyUI congela durante geracao

**Sintoma:** A barra de progresso para e nao avanca.

**Causas e solucoes:**

| Causa | Diagnostico | Solucao |
|-------|-------------|---------|
| VRAM no limite | `nvidia-smi` mostra ~100% uso | Reduzir resolucao ou modelo |
| CPU bottleneck | CPU em 100% no task manager | Esperar (modelos grandes exigem muito) |
| Bug no node | Erro no console do ComfyUI | Atualizar o custom node |
| Modelo corrompido | Erro no log, geracao nunca completa | Re-download do modelo |

---

## Erros de VRAM (Out of Memory)

### "CUDA out of memory"

Este e o erro mais comum. Significa que o modelo + dados nao cabem na VRAM da GPU.

**Solucao Imediata (em ordem de impacto):**

```
NIVEL 1 - MUDANCAS RAPIDAS:
1. Fechar outros programas que usam GPU (Chrome com aceleracao, jogos, etc.)
2. Reiniciar ComfyUI (libera VRAM fragmentada)

NIVEL 2 - REDUZIR DEMANDA:
3. Reduzir resolucao:
   1920x1080 -> 1280x720  (economiza ~50% VRAM)
   1280x720  -> 480x848   (economiza ~60% VRAM)

4. Reduzir duracao:
   10s -> 5s  (economiza ~50% VRAM)
   5s  -> 3s  (economiza ~40% VRAM)

5. Reduzir batch size:
   Gerar 1 frame por vez ao inves de batch

NIVEL 3 - MUDAR MODELO:
6. Trocar para modelo menor:
   14B -> 5B  (economiza ~60% VRAM)
   5B  -> 1.3B (economiza ~60% VRAM)

NIVEL 4 - OTIMIZACOES AVANCADAS:
7. Usar --lowvram flag no ComfyUI:
   python main.py --lowvram

8. Habilitar model offloading (CPU offload):
   Carrega partes do modelo na RAM do sistema conforme necessario

9. Usar quantizacao (FP16/BF16 ao inves de FP32):
   Reduz consumo de VRAM pela metade
```

### "RuntimeError: CUDA error: an illegal memory access"

**Causa:** VRAM corrompida ou driver instavel.

**Solucoes:**
1. Reiniciar o computador (limpa o estado da GPU)
2. Atualizar drivers NVIDIA para a versao mais recente
3. Verificar se nao ha overclock na GPU
4. Testar a GPU com `nvidia-smi -q` para verificar saude

### VRAM fragmentada (memoria disponivel mas erro de OOM)

**Sintoma:** `nvidia-smi` mostra VRAM livre, mas o ComfyUI da OOM.

**Causa:** Fragmentacao de memoria -- blocos livres nao sao contiguos.

**Solucao:**
1. Reiniciar ComfyUI (limpa toda a VRAM)
2. Usar `--disable-cuda-malloc` ao iniciar ComfyUI
3. Limpar cache manualmente: no ComfyUI, clique "Free Memory" no manager

---

## Falhas no Carregamento de Modelos

### "Model file not found"

**Sintoma:** ComfyUI nao encontra o arquivo .safetensors do modelo.

**Solucoes:**

1. Verificar se o modelo esta na pasta correta:
```
MODELO DE VIDEO:
  /ComfyUI/models/checkpoints/     (alguns wrappers)
  /ComfyUI/models/diffusion_models/ (Wan, Hunyuan)

MODELO IP-ADAPTER:
  /ComfyUI/models/ipadapter/

MODELO CONTROLNET:
  /ComfyUI/models/controlnet/

MODELO CLIP:
  /ComfyUI/models/clip/

MODELO VAE:
  /ComfyUI/models/vae/
```

2. Verificar o nome exato do arquivo (case-sensitive)
3. Verificar se o download foi completo (comparar tamanho)

### "SafetensorError: invalid header"

**Causa:** Arquivo corrompido (download incompleto ou falho).

**Solucao:**
1. Deletar o arquivo corrompido
2. Re-baixar o modelo
3. Verificar checksum/hash se disponivel
4. Usar `git lfs` para downloads de modelos grandes (mais confiavel)

### Modelo carrega mas geracao falha

**Causa:** Versao incompativel do wrapper ou configuracao errada.

**Solucoes:**
1. Atualizar o wrapper (ex: ComfyUI-WanVideoWrapper):
```bash
cd /Users/felipegobbi/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper
git pull
pip install -r requirements.txt
```
2. Verificar se o modelo e compativel com o wrapper (ex: Wan 2.1 vs 2.2)
3. Conferir parametros do sampler/scheduler

### "UNet model mismatch" ou "Incompatible state dict"

**Causa:** Modelo errado para o wrapper selecionado.

**Solucao:** Verifique a correspondencia:

| Wrapper | Modelos Compativeis |
|---------|-------------------|
| WanVideoWrapper | wan2.1_*.safetensors, wan2.2_*.safetensors |
| HunyuanVideoWrapper | hunyuan_video_*.safetensors |
| CogVideoXWrapper | cogvideox_*.safetensors |
| LTXVideo | ltx_video_*.safetensors |

---

## Problemas de Qualidade de Video

### Video totalmente preto

**Causas e solucoes:**

1. **CFG Scale muito alto:** Reduza de 20+ para 7-10
2. **Prompt em branco:** Verifique se o prompt foi passado corretamente
3. **Modelo corrompido:** Re-download
4. **VAE errado:** Verifique se o VAE correto esta selecionado para o modelo
5. **Seed problematica:** Tente seeds diferentes (ou -1 para aleatorio)

### Video todo cinza ou com ruido

**Causas:**
1. **Poucos sampling steps:** Aumente de 10 para 25-30
2. **Scheduler errado:** Cada modelo tem scheduler ideal:
   - Wan: `euler`, `dpm++_2m_sde`
   - Hunyuan: `flow_match_euler`
   - CogVideoX: `ddim`, `euler_a`
3. **CFG Scale muito baixo:** Aumente de 1-2 para 5-7

### Resolucao borrada mesmo em alta resolucao

**Causas:**
1. **Modelo pequeno:** 1.3B gera qualidade limitada mesmo em resolucao alta
2. **Upscaling necessario:** Gere em 720p e aplique SeedVR2
3. **Denoising muito agressivo:** Se V2V, reduza denoise strength

### Artefatos visuais (distorcao, manchas)

**Solucoes por tipo:**

| Artefato | Causa Provavel | Solucao |
|----------|---------------|---------|
| Rostos distorcidos | CFG alto, modelo limitado | Reduzir CFG, usar FaceDetailer |
| Maos deformadas | Limitacao dos modelos atuais | Re-gerar, usar I2V com referencia boa |
| Bordas ondulantes | Resolucao nao alinhada | Usar resolucoes multiplas de 8 ou 64 |
| Cores saturadas/lavadas | VAE ou CFG errado | Ajustar VAE, CFG entre 5-8 |
| Watermark/texto fantasma | Dados de treino | Adicionar "no watermark" ao negative |

---

## Problemas de Motion e Flickering

### Flickering entre frames

**Este e o problema mais comum em video IA.** Causas e solucoes:

**Nivel 1 - Mitigacao basica:**
1. **Frame interpolation:** Aplique GIMM-VFI para suavizar transicoes
2. **Mais frames:** Gere com mais frames (mais longo = mais contexto temporal)
3. **Modelo maior:** 14B tem melhor temporal consistency que 5B

**Nivel 2 - Ajustes de workflow:**
4. **Temporal attention:** Aumente peso do temporal attention no wrapper
5. **Denoise schedule:** Use schedules mais suaves
6. **Seed fixa:** Manter a mesma seed pode reduzir variacao entre batches

**Nivel 3 - Pos-producao:**
7. **Deflicker em pos-producao:** O `post-production` agent pode aplicar filtros
8. **Frame blending:** Mistura suave entre frames adjacentes
9. **Temporal smoothing:** Filtro de suavizacao temporal

### Motion "morto" (video parece foto estatica)

**Causas e solucoes:**

1. **Prompt sem acao:** Adicione verbos de movimento ao prompt
   - Ruim: "a cat on a table"
   - Bom: "a cat sitting on a table, tail swaying gently, ears twitching"

2. **Motion scale baixo:** Se usando AnimateDiff, aumente o motion_scale

3. **Duracao muito curta:** 1-2 segundos nao tem tempo para motion significativo

4. **CFG muito alto:** CFG > 15 tende a "travar" o motion. Use 5-10.

### Motion nao natural (coisas flutuando, fisica errada)

**Limitacao atual dos modelos.** Mitigacoes:

1. Descrever a fisica esperada no prompt: "realistic physics, gravity"
2. Usar modelos maiores (14B > 5B para motion realista)
3. Evitar cenas com muitos objetos em movimento simultaneo
4. Gerar multiplas variacoes e selecionar a melhor

### Camera shaking ou jittering

**Causas:**
1. **Sem instrucao de camera:** Adicione "steady camera" ou "tripod shot" ao prompt
2. **Steerable-Motion:** Use o node para controlar camera explicitamente
3. **Pos-producao:** Aplique estabilizacao de video na pos

### Morphing de objetos (objetos mudam de forma)

**Muito comum em IA.** Solucoes:

1. **Shots mais curtos:** 3s tem menos morphing que 8s
2. **Menos elementos:** Simplifique a cena
3. **Referencia forte:** I2V com imagem de referencia ancora melhor
4. **ControlNet:** Usar mapas de profundidade ou pose para guiar a geracao

---

## Problemas de Audio e Sincronizacao

### Audio nao sincronizado com video

**Causa:** Audio e video sao gerados independentemente.

**Solucoes:**
1. Ajustar timing na pos-producao (o `post-production` faz isso automaticamente)
2. Gerar audio com duracao exata do video
3. Para lip-sync, gerar audio primeiro e ajustar video ao audio

### ElevenLabs retorna erro de API

**Causas comuns:**
1. API key invalida ou expirada
2. Cota de caracteres excedida (plano free = 10k chars/mes)
3. Modelo de voz indisponivel

**Solucao:** Verificar API key, verificar cota, tentar outra voz.

### Musica gerada nao combina com o video

**Dicas para melhor resultado:**
1. Especifique BPM, tom, e mood no prompt de musica
2. Use Udio para instrumentais (mais controle sobre BPM/tom)
3. Use Suno para musicas com vocal
4. Gere multiplas opcoes e escolha a melhor

### SFX fora de contexto

**Solucao:**
1. Seja especifico no prompt de SFX: "footsteps on gravel, slow pace" ao inves de "walking sound"
2. Ajuste o timing de cada SFX individualmente
3. Use ElevenLabs Video-to-SFX para gerar SFX baseado no video

---

## Erros de Workflow

### "Required input missing"

**Causa:** Um node do workflow nao tem todas as conexoes.

**Solucao:**
1. O `comfyui-architect` monta workflows completos automaticamente
2. Se editando manualmente: verifique todas as conexoes de input
3. Re-rode `/video-t2v` para gerar um novo workflow limpo

### "Workflow execution error"

**Diagnostico:**
1. Verificar o log detalhado do ComfyUI (terminal)
2. Identificar qual node falhou
3. Verificar se o node esta atualizado
4. Verificar inputs do node (tipo de dado, formato)

### "Queue prompt error"

**Causa:** O workflow tem erro de validacao antes mesmo de executar.

**Solucoes:**
1. Verificar se todos os nodes existem (nenhum node vermelho/faltando)
2. Verificar tipos de conexao (outputs conectados a inputs compativeis)
3. Reiniciar ComfyUI e tentar novamente

### Workflow funciona no UI mas falha via API

**Causa:** Diferenca entre execucao via interface grafica e via API.

**Solucoes:**
1. Exportar o workflow como API format (nao o formato de UI)
2. Verificar se todas as referencias de arquivo usam caminhos absolutos
3. Verificar se o ComfyUI esta rodando no mesmo endereco configurado

---

## Problemas de Custom Nodes

### Node nao aparece no ComfyUI

**Checklist de verificacao:**

```
[ ] O node esta em ComfyUI/custom_nodes/ ?
[ ] O diretorio tem __init__.py ?
[ ] As dependencias foram instaladas? (pip install -r requirements.txt)
[ ] O ComfyUI foi reiniciado apos instalacao?
[ ] Nao ha erros no log de inicializacao do ComfyUI?
```

### Conflito entre nodes

**Sintoma:** Apos instalar um node novo, outros param de funcionar.

**Causa:** Dependencias conflitantes (versoes diferentes de packages).

**Solucao:**
1. Verificar logs de erro ao iniciar ComfyUI
2. Criar venv separada para ComfyUI
3. Atualizar todos os nodes: `git pull` em cada pasta
4. Como ultimo recurso: reinstalar ComfyUI do zero com nodes um a um

### Node desatualizado

**Sintoma:** Node funciona mas gera resultados estranhos ou da warnings.

**Solucao:**
```bash
cd /Users/felipegobbi/ComfyUI/custom_nodes/NOME-DO-NODE
git pull
pip install -r requirements.txt --upgrade
# Reiniciar ComfyUI
```

---

## Problemas de Consistencia de Personagens

### Rosto diferente entre shots

**Solucoes em ordem de eficacia:**

1. **Verificar embedding:** O embedding IP-Adapter/FaceID foi criado corretamente?
2. **Aumentar weight:** Aumentar o peso do IP-Adapter (0.7 -> 0.9)
3. **Imagem de referencia melhor:** Use foto frontal, bem iluminada, alta resolucao
4. **Multiplas referencias:** Forneca 3-5 fotos de angulos diferentes
5. **FaceDetailer:** Aplique em pos-producao para refinar rostos

### IP-Adapter nao funciona

**Checklist:**

```
[ ] ComfyUI_IPAdapter_plus instalado?
[ ] Modelo IP-Adapter baixado em models/ipadapter/?
[ ] Modelo CLIP vision baixado em models/clip_vision/?
[ ] InsightFace instalado? (pip install insightface onnxruntime)
[ ] Imagem de referencia fornecida corretamente?
```

### Personagem fica com aparencia "estranha" ou distorcida

**Causas:**
1. **Weight muito alto:** Reduza de 1.0 para 0.6-0.8
2. **Conflito com prompt:** O prompt descreve algo diferente da referencia
3. **Modelo pequeno:** 1.3B tem dificuldade com consistencia facial
4. **Angulo incompativel:** Referencia frontal mas shot e perfil

---

## Problemas de Upscaling e Enhancement

### SeedVR2 da OOM

**Causa:** Upscaling de video e muito intensivo em VRAM.

**Solucoes:**
1. Fazer upscaling frame a frame (ao inves de batch)
2. Reduzir tile size
3. Fazer upscaling separado da geracao (fechar modelo de video antes)
4. Usar Topaz Video AI (roda em CPU se necessario)

### Frame interpolation (GIMM-VFI) gera artefatos

**Sintomas:** Ghosting, frames duplicados, distorcao em areas de movimento rapido.

**Solucoes:**
1. Reduzir fator de interpolacao (4x ao inves de 8x)
2. Areas com motion muito rapido sao problematicas -- simplifique a cena
3. Tente RIFE ao inves de GIMM-VFI (ou vice-versa)
4. Aplique interpolacao em segmentos menores

### Upscaling deixa video com aspecto artificial

**Causa:** Over-sharpening ou denoising excessivo.

**Solucoes:**
1. Reduzir denoise strength no SeedVR2
2. Ajustar sharpness
3. Usar upscale menor (1.5x ao inves de 2x)
4. Topaz Video AI geralmente tem resultado mais natural

---

## Problemas de Performance

### Geracao extremamente lenta

**Verificacoes:**

```
1. GPU esta sendo usada?
   nvidia-smi  -> Deve mostrar processo Python usando GPU

2. Esta rodando em FP32 desnecessariamente?
   Use FP16 ou BF16 quando possivel

3. CPU offloading ativado sem necessidade?
   --lowvram e mais lento; use somente se necessario

4. Disco lento?
   Modelos em HDD sao muito mais lentos para carregar que SSD

5. RAM insuficiente?
   Se swap esta sendo usado, tudo fica lento
```

### ComfyUI fica lento apos muitas geracoes

**Causa:** Memory leak ou cache acumulado.

**Solucao:**
1. Reiniciar ComfyUI periodicamente
2. Limpar cache: Menu -> Free Memory
3. Limpar pasta temp do ComfyUI

---

## Erros de Sistema e Ambiente

### "ImportError: No module named X"

**Solucao:** Instalar o modulo faltando:
```bash
pip install NOME_DO_MODULO
```

Se esta dentro de um custom node:
```bash
cd /Users/felipegobbi/ComfyUI/custom_nodes/NOME-DO-NODE
pip install -r requirements.txt
```

### Conflito de versoes Python

**Sintoma:** Erros de syntax ou imports falhando.

**Solucao:** Use um ambiente virtual dedicado para ComfyUI:
```bash
python -m venv comfyui_env
source comfyui_env/bin/activate  # Mac/Linux
pip install -r requirements.txt
```

### ffmpeg nao encontrado

**Sintoma:** Erro ao exportar ou combinar video/audio.

**Solucao:**
```bash
# Mac
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Baixe de https://ffmpeg.org/download.html e adicione ao PATH
```

### Git LFS nao configurado

**Sintoma:** Modelos baixados sao arquivos de ponteiro (muito pequenos, ~1KB).

**Solucao:**
```bash
git lfs install
git lfs pull  # No repositorio do modelo
```

---

## Ainda com Problemas?

Se nenhuma solucao acima resolveu:

1. **Rode o diagnostico completo:**
```
/video-setup --verbose
```

2. **Verifique os logs do ComfyUI:** A saida do terminal ao iniciar e durante geracao contem informacoes detalhadas de erro.

3. **Consulte a Knowledge Base:**
```
Arquivo: squads/video-creation/data/video-creation-kb.md
```

4. **Consulte a documentacao oficial dos modelos:**
   - [ComfyUI Docs](https://docs.comfy.org/)
   - [Wan 2.1 Issues](https://github.com/Wan-Video/Wan2.1/issues)
   - [HunyuanVideo Issues](https://github.com/Tencent/HunyuanVideo/issues)

5. **Peca ajuda ao comfyui-admin:**
```
@comfyui-admin "Estou com o seguinte erro: [cole o erro aqui]"
```

---

*Video Creation Squad - AIOS v1.0.0*
*Documentacao atualizada em Fevereiro 2026*
