# Perguntas Frequentes (FAQ)

> Respostas rapidas para as duvidas mais comuns sobre criacao de video com IA usando o Video Creation Squad.

---

## Indice

1. [Basico](#basico)
2. [Escolha de Modelos](#escolha-de-modelos)
3. [Hardware e VRAM](#hardware-e-vram)
4. [Resolucao, FPS e Duracao](#resolucao-fps-e-duracao)
5. [Prompts e Qualidade](#prompts-e-qualidade)
6. [Consistencia de Personagens](#consistencia-de-personagens)
7. [ComfyUI e Nodes](#comfyui-e-nodes)
8. [Audio e Pos-Producao](#audio-e-pos-producao)
9. [Pipeline e Workflows](#pipeline-e-workflows)
10. [Erros Comuns](#erros-comuns)
11. [Performance e Otimizacao](#performance-e-otimizacao)
12. [Avancado](#avancado)
13. [Glossario](#glossario)

---

## Basico

### O que e o Video Creation Squad?

E um time de agentes de IA especializados que trabalham juntos para criar videos usando ComfyUI como backbone. O squad cobre todo o pipeline: do roteiro ao video final com audio.

### Quantos agentes tem no squad?

O squad tem 8 agentes especializados:

| Agente | Funcao |
|--------|--------|
| `video-director` | Orquestra todo o pipeline, planeja shots |
| `video-generator` | Executa geracao T2V/I2V/V2V |
| `video-enhancer` | Upscaling e frame interpolation |
| `character-designer` | Consistencia de personagens |
| `audio-producer` | Voz, musica e efeitos sonoros |
| `prompt-engineer` | Otimizacao de prompts |
| `quality-reviewer` | Validacao de qualidade |
| `comfyui-admin` | Setup e manutencao do ComfyUI |

### Preciso saber usar ComfyUI?

**Nao.** Os agentes montam os workflows automaticamente. Voce so precisa do ComfyUI instalado e rodando. O `comfyui-architect` lida com toda a complexidade de nodes e configuracoes.

### Quanto tempo demora gerar um video?

Depende muito do hardware e do escopo:

| Tipo | Tempo Aproximado | Hardware |
|------|-----------------|----------|
| Shot unico (5s, 720p) | 2-5 min | RTX 4090 |
| Shot unico (5s, 720p) | 8-15 min | RTX 3090 |
| Video multi-shot (30s) | 15-45 min | RTX 4090 |
| Video multi-shot (30s) | 30-90 min | RTX 3090 |
| Com upscaling + interpolation | +50-100% do tempo base | - |

### E gratis?

O squad em si nao tem custo. Mas:
- **Claude Code** consome tokens da sua conta Anthropic
- **ElevenLabs/Suno/Udio** tem planos free e pagos (para audio)
- **Modelos de video** sao gratuitos e open-source
- **ComfyUI** e gratuito e open-source

---

## Escolha de Modelos

### Qual modelo de video devo usar?

Depende do seu objetivo e hardware. Resumo pratico:

| Modelo | Melhor Para | VRAM | Qualidade | Velocidade |
|--------|------------|------|-----------|------------|
| **Wan 2.1/2.2 14B** | Qualidade maxima, cenas complexas | 24 GB | Excelente | Lento |
| **Wan 2.1 5B** | Bom equilibrio qualidade/velocidade | 12 GB | Muito bom | Medio |
| **Wan 2.1 1.3B** | Testes rapidos, VRAM limitada | 6 GB | Razoavel | Rapido |
| **HunyuanVideo 13B** | Rostos humanos, motion natural | 24 GB | Excelente | Lento |
| **CogVideoX-5B** | Cenas estilizadas, texto em video | 16 GB | Bom | Medio |
| **LTX-2** | Flexibilidade (2B a 13B), rapido | 8-24 GB | Bom a excelente | Rapido |
| **AnimateDiff v3** | Animacoes curtas no estilo SD | 8 GB | Bom (estilos SD) | Rapido |

### Wan 2.1 vs Wan 2.2: qual a diferenca?

- **Wan 2.1:** Modelo base, excelente para T2V e I2V. Versoes 1.3B/5B/14B.
- **Wan 2.2:** Evolucao com V2V (video-to-video) e melhor motion. Suporta ControlNet nativo. Ideal para transformar videos existentes.

Se voce so quer gerar do zero, Wan 2.1 14B e o padrao. Se quer transformar videos existentes, use Wan 2.2.

### Wan vs HunyuanVideo: quando usar cada um?

| Criterio | Wan 2.1/2.2 14B | HunyuanVideo 13B |
|----------|-----------------|-------------------|
| **Rostos humanos** | Muito bom | Excelente (ponto forte) |
| **Cenas naturais** | Excelente | Muito bom |
| **Motion complexity** | Excelente | Bom |
| **I2V quality** | Excelente | Muito bom |
| **Duracao maxima** | 10s | 5s |
| **Resolucao maxima** | 1080x1920 | 1280x720 |
| **Versatilidade** | Mais versatil | Melhor em rostos |

**Regra geral:** Use Wan para a maioria dos casos. Use Hunyuan quando rostos humanos forem o foco principal.

### CogVideoX vale a pena?

O CogVideoX-5B tem nichos onde brilha:

- **Texto em video:** Melhor que Wan para renderizar texto legivel
- **Estilos estilizados:** Bom para looks mais "artisticos"
- **VRAM moderada:** 16 GB e suficiente

Porem, Wan 14B supera em qualidade geral. Use CogVideoX quando 16 GB for seu limite ou quando precisar de texto no video.

### LTX-2 e bom?

LTX-2 da Lightricks e uma opcao interessante:

- **Muito rapido** para geracao (mais rapido que Wan)
- **Escalavel:** Versoes de 2B a 13B
- **Versatil:** T2V e I2V
- **Boa qualidade** na versao 13B

E uma otima alternativa quando voce precisa de iteracao rapida. Gere rascunhos com LTX-2 e finalize com Wan 14B.

### AnimateDiff ainda faz sentido?

AnimateDiff foi revolucionario em 2023/2024, mas em 2025/2026 os modelos nativos de video (Wan, Hunyuan) sao superiores. AnimateDiff ainda e util para:

- **Animacoes estilo Stable Diffusion:** Se voce quer o look especifico de checkpoints SD
- **LoRAs de estilo:** Usar LoRAs de SD 1.5/SDXL em video
- **Hardware limitado:** Funciona com 8 GB VRAM
- **Animacoes curtas estilizadas:** 2-3 segundos com estetica SD

Para qualidade "realista" ou semi-realista, prefira Wan ou Hunyuan.

### Posso misturar modelos no mesmo projeto?

**Sim!** O `video-director` pode usar modelos diferentes para shots diferentes. Exemplo:

- Shot 1 (close-up de rosto): HunyuanVideo
- Shot 2 (paisagem epica): Wan 2.1 14B
- Shot 3 (animacao estilizada): AnimateDiff com LoRA

O `post-production` agent cuida de harmonizar os shots na pos-producao.

---

## Hardware e VRAM

### Quanta VRAM preciso?

Depende do modelo que voce quer usar:

```
MAPA DE VRAM:

6 GB   [======]                               -> Wan 1.3B (480p)
8 GB   [========]                             -> AnimateDiff, LTX-2 2B
12 GB  [============]                         -> Wan 5B (720p)
16 GB  [================]                     -> CogVideoX-5B, LTX-2 ~8B
24 GB  [========================]             -> Wan 14B, Hunyuan 13B, LTX-2 13B
48 GB  [================================================]  -> Tudo com margem
```

### Tenho apenas 8 GB de VRAM. Consigo usar?

Sim, mas com limitacoes:

- **AnimateDiff v3:** Funciona bem, animacoes curtas estilo SD
- **LTX-2 2B:** Geracao basica de video
- **Wan 1.3B:** Possivel com otimizacoes agressivas (480p, poucos frames)
- **Upscaling/Interpolation:** Provavelmente nao simultaeno com geracao

Recomendacao: Use LTX-2 2B ou AnimateDiff e aplique upscaling separadamente.

### Funciona em Mac (Apple Silicon)?

Parcialmente:

| Mac | VRAM Unificada | O que roda |
|-----|---------------|------------|
| M1/M2 base (8 GB) | ~6 GB usavel | AnimateDiff apenas |
| M1/M2 Pro (16 GB) | ~12 GB usavel | Wan 5B com otimizacoes |
| M1/M2 Max (32 GB) | ~24 GB usavel | Wan 14B (lento) |
| M1/M2 Ultra (64 GB+) | ~48 GB usavel | Tudo (mais lento que NVIDIA) |

**Importante:** Geracao de video em Apple Silicon e significativamente mais lenta que NVIDIA. MPS (Metal Performance Shaders) nao e tao otimizado quanto CUDA para modelos de video. Espere 3-5x mais tempo.

### Posso usar duas GPUs?

ComfyUI tem suporte experimental a multi-GPU, mas:

- Nao e automatico -- requer configuracao manual
- Nem todos os wrappers de modelo suportam
- A forma mais pratica: use uma GPU para geracao e outra para upscaling

O `comfyui-architect` pode configurar isso se voce tiver 2+ GPUs.

### Quanta RAM do sistema preciso?

| VRAM da GPU | RAM Recomendada |
|------------|----------------|
| 6-8 GB | 32 GB minimo |
| 12-16 GB | 64 GB recomendado |
| 24 GB | 64-128 GB |
| 48 GB+ | 128 GB |

A RAM do sistema e usada para carregar modelos antes de enviar para a GPU e para buffer de frames durante processamento.

### Quanto espaco em disco os modelos ocupam?

```
MODELOS DE VIDEO:
  Wan 2.1 1.3B     ~3 GB
  Wan 2.1 5B       ~10 GB
  Wan 2.1 14B      ~28 GB
  Wan 2.2           ~30 GB (inclui V2V)
  HunyuanVideo     ~26 GB
  CogVideoX-5B     ~10 GB
  LTX-2 (13B)      ~26 GB
  AnimateDiff       ~2 GB (motion modules)

MODELOS DE CONSISTENCIA:
  IP-Adapter FaceID ~2 GB
  InstantID         ~1.5 GB
  InsightFace       ~500 MB

UPSCALING:
  SeedVR2           ~2 GB
  GIMM-VFI          ~1 GB

TOTAL COMPLETO:     ~140 GB (todos os modelos)
SETUP BASICO:       ~35 GB (Wan 14B + IP-Adapter + SeedVR2)
```

---

## Resolucao, FPS e Duracao

### Qual resolucao devo usar?

Depende do objetivo:

| Objetivo | Resolucao Recomendada | Aspect Ratio |
|----------|----------------------|-------------|
| Instagram/TikTok Reels | 1080x1920 (vertical) | 9:16 |
| YouTube | 1920x1080 (horizontal) | 16:9 |
| Teste/rascunho | 480x848 (vertical) ou 720x480 | Variavel |
| Qualidade maxima | 1280x720 -> upscale 4K | 16:9 |

**Dica:** Gere em 720p e use SeedVR2 para upscale para 1080p ou 4K. E mais rapido e o resultado e excelente.

### Quantos FPS devo usar?

| FPS | Uso |
|-----|-----|
| 16 fps | Geracao bruta (mais rapido, economiza VRAM) |
| 24 fps | Padrao cinematografico |
| 30 fps | Padrao web/social media |
| 48-60 fps | Apos frame interpolation (GIMM-VFI) |

**Estrategia recomendada:** Gere em 16 fps e use GIMM-VFI para interpolar para 48 fps. Economiza VRAM na geracao e produz resultado fluido.

### Qual a duracao maxima por shot?

| Modelo | Duracao Maxima | Duracao Recomendada |
|--------|---------------|-------------------|
| Wan 2.1/2.2 14B | 10s | 5-8s |
| Wan 2.1 5B | 8s | 4-6s |
| Wan 2.1 1.3B | 6s | 3-5s |
| HunyuanVideo | 5s | 3-5s |
| CogVideoX-5B | 10s | 5-8s |
| LTX-2 | 5s | 3-5s |
| AnimateDiff | 3s+ | 2-3s |

**Dica:** Shots mais curtos (3-5s) tem melhor qualidade e consistencia. Combinar multiplos shots curtos e melhor que um shot longo.

### Posso gerar videos maiores que o limite do modelo?

Nao diretamente. Mas existem estrategias:

1. **Multi-shot:** Divide em shots de 3-5s e combina na pos-producao
2. **Video-to-Video loop:** Usa o ultimo frame de um shot como input do proximo
3. **Extend:** Alguns wrappers suportam extensao de video (experimental)

O `video-director` automatiza a estrategia multi-shot para voce.

---

## Prompts e Qualidade

### Como escrever bons prompts para video?

A estrutura ideal para prompts de video e:

```
[SUJEITO] + [ACAO/MOVIMENTO] + [CENARIO] + [CAMERA] + [ILUMINACAO] + [ESTILO]
```

Exemplos:

```
BOM:
"A young woman in a white dress walking through a field of sunflowers,
 slow motion, golden hour lighting, medium shot tracking, cinematic 4K,
 shallow depth of field"

RUIM:
"woman flowers pretty sunset"
```

### Negative prompts fazem diferenca?

**Sim, muito.** O `prompt-engineer` adiciona negative prompts automaticamente, mas voce pode customizar:

```
NEGATIVE PROMPTS ESSENCIAIS:
"blurry, distorted, deformed, low quality, watermark, text overlay,
 static, no motion, choppy, artifacts, morphing, extra limbs,
 bad anatomy, duplicate frames"
```

### O prompt varia por modelo?

Sim. Cada modelo responde melhor a estilos diferentes de prompt:

| Modelo | Estilo de Prompt |
|--------|-----------------|
| **Wan** | Descritivo e detalhado, aceita keywords de camera |
| **Hunyuan** | Narrativo, descreva acoes sequenciais |
| **CogVideoX** | Mais conciso, foco em acao principal |
| **LTX-2** | Similar a Wan, aceita tags de estilo |
| **AnimateDiff** | Tags estilo SD (masterpiece, best quality, etc.) |

O `@prompt-engineer` otimiza automaticamente para o modelo alvo.

### Por que meu video tem qualidade baixa?

Causas comuns e solucoes:

1. **Prompt vago** -> Adicione detalhes de camera, iluminacao, estilo
2. **Resolucao baixa** -> Gere em 720p minimo, use upscaling
3. **Modelo errado** -> Use 14B/13B para qualidade, nao 1.3B
4. **Poucos steps** -> Aumente o numero de sampling steps
5. **CFG scale errado** -> O padrao geralmente e ideal, nao mexer sem necessidade
6. **Sem negative prompt** -> Sempre use negative prompts

---

## Consistencia de Personagens

### Como manter o mesmo personagem em multiplos shots?

O squad usa IP-Adapter FaceID Plus V2 para consistencia facial:

```
# 1. Criar referencia do personagem
/video-character --reference foto.png --name "Ana"

# 2. O sistema gera:
#    - Embedding facial (InsightFace)
#    - Configuracao IP-Adapter
#    - Reference sheet

# 3. Em cada shot subsequente, o embedding e aplicado automaticamente
```

### O que e IP-Adapter FaceID?

E uma tecnica que injeta a identidade facial de uma imagem de referencia na geracao de video. Funciona como uma "ancora" visual que forca o modelo a manter o rosto consistente.

### A consistencia funciona 100%?

Nao. E uma das areas mais desafiadoras de video IA. Resultados tipicos:

| Cenario | Consistencia Esperada |
|---------|---------------------|
| Mesmo angulo, mesma iluminacao | 85-95% |
| Angulo diferente | 70-85% |
| Iluminacao muito diferente | 60-80% |
| Corpo inteiro vs close-up | 50-70% |

O `quality-reviewer` verifica a consistencia e o `video-director` refaz shots inconsistentes.

### Consistencia de corpo/roupa funciona?

Parcialmente. IP-Adapter foca em rostos. Para corpo e roupa:

- Use descricoes detalhadas no prompt (mesma roupa descrita em cada shot)
- Use imagens de referencia com roupas visiveis
- O `character-designer` cria reference sheets com multiplos angulos

---

## ComfyUI e Nodes

### Quais nodes sao obrigatorios?

```
OBRIGATORIOS (sem eles o squad nao funciona):
[x] ComfyUI-VideoHelperSuite    - Carregar/salvar video
[x] ComfyUI-WanVideoWrapper     - Modelo Wan 2.1/2.2
[x] ComfyUI_IPAdapter_plus      - Consistencia de personagens

RECOMENDADOS (funcionalidade extra):
[ ] ComfyUI-HunyuanVideoWrapper - Modelo Hunyuan
[ ] ComfyUI-CogVideoXWrapper    - Modelo CogVideoX
[ ] ComfyUI-LTXVideo            - Modelo LTX-2
[ ] ComfyUI-AnimateDiff-Evolved - AnimateDiff
[ ] ComfyUI-Advanced-ControlNet - ControlNet avancado
[ ] Steerable-Motion            - Controle de camera
[ ] ComfyUI-SeedVR2_VideoUpscaler - Upscaling IA
[ ] ComfyUI-GIMM-VFI            - Frame interpolation
[ ] ComfyUI-TopazVideoAI        - Topaz integration
```

### Como instalar um custom node?

```bash
cd /Users/felipegobbi/ComfyUI/custom_nodes/
git clone https://github.com/AUTHOR/NODE-NAME
cd NODE-NAME
pip install -r requirements.txt
# Reiniciar ComfyUI
```

Ou use o comando automatizado:

```
/video-setup --install-nodes
```

### Um node nao carrega. O que fazer?

Veja [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) para solucoes detalhadas. Resumo rapido:

1. Verifique se instalou as dependencias: `pip install -r requirements.txt`
2. Verifique compatibilidade de versao do Python
3. Verifique logs do ComfyUI ao iniciar
4. Tente reinstalar: delete a pasta e clone novamente
5. Use `/video-setup` para diagnosticar

---

## Audio e Pos-Producao

### Como funciona o audio?

O `audio-producer` integra tres servicos:

| Servico | Tipo | Exemplo de Uso |
|---------|------|---------------|
| **ElevenLabs** | Voz e SFX | Narracao, efeitos sonoros |
| **Suno** | Musica com vocal | Jingles, musicas tematicas |
| **Udio** | Instrumental | Trilha sonora, background music |

### Preciso de audio em todo video?

Nao. Audio e opcional. Voce pode gerar videos silenciosos e adicionar audio depois manualmente. Mas o pipeline completo (`/video-create`) inclui audio automaticamente se as APIs estiverem configuradas.

### Como sincronizo labios (lip-sync)?

Lip-sync em video IA ainda e experimental. O squad faz o melhor possivel:

1. Gera o video com movimentos labiais genericos
2. Gera a voz com ElevenLabs
3. Ajusta timing na pos-producao
4. Resultado: sincronizacao aproximada, nao perfeita

Para lip-sync preciso, considere ferramentas dedicadas como Wav2Lip (fora do escopo deste squad).

---

## Pipeline e Workflows

### Qual a diferenca entre `/video-t2v` e `/video-create`?

| Comando | Escopo | Quando usar |
|---------|--------|------------|
| `/video-t2v` | Shot unico, sem pos-producao | Testes, shots isolados |
| `/video-create` | Pipeline completo multi-shot | Projetos reais, videos finais |

### Posso parar no meio e continuar depois?

Os checkpoints salvam o estado do projeto. Se voce parar:

1. Os shots ja gerados estao salvos no disco
2. O estado do projeto e registrado
3. Voce pode retomar informando o project ID

### Posso editar um shot especifico sem refazer tudo?

Sim! Use:

```
/video-t2v "novo prompt" --shot 3 --project meu_projeto
```

Isso re-gera apenas o shot 3 e o `post-production` re-monta o video final.

---

## Erros Comuns

### "CUDA out of memory"

Sua GPU nao tem VRAM suficiente. Solucoes:

1. Fechar outros programas que usam GPU
2. Reduzir resolucao
3. Usar modelo menor
4. Adicionar `--lowvram` ao comando

Veja detalhes em [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

### "Node not found: WanVideoWrapper"

O custom node nao esta instalado. Execute:

```
/video-setup --install-nodes
```

### Video gerado e todo preto

Causas comuns:
- Modelo corrompido ou incompleto (re-download)
- CFG scale muito alto (tente 7.0)
- Prompt em branco ou incompativel

### Video tem flickering

Normal em IA -- motion temporal nao e perfeito. Solucoes:
- Frame interpolation (GIMM-VFI) suaviza bastante
- Aumentar temporal attention no workflow
- Usar modelo maior (14B > 5B > 1.3B)

---

## Performance e Otimizacao

### Como acelerar a geracao?

Em ordem de impacto:

1. **GPU mais rapida** (maior impacto)
2. **Modelo menor** (14B -> 5B = ~3x mais rapido)
3. **Resolucao menor** (1080p -> 720p = ~2x)
4. **Menos frames** (5s -> 3s = ~40% mais rapido)
5. **Menos sampling steps** (30 -> 20 = ~33%)
6. **FP16/BF16** ao inves de FP32

### Posso gerar em batch?

Sim. O `comfyui-architect` pode configurar batch processing:

```
/video-t2v --batch prompts.txt --output-dir ./resultados/
```

Cada linha do arquivo e um prompt diferente. Util para gerar multiplas variacoes.

---

## Avancado

### Posso usar LoRAs com os modelos de video?

Depende do modelo:

| Modelo | Suporte a LoRA |
|--------|---------------|
| Wan 2.1/2.2 | Sim (LoRAs especificas para Wan) |
| HunyuanVideo | Limitado |
| CogVideoX | Sim |
| AnimateDiff | Sim (LoRAs de SD 1.5/SDXL) |
| LTX-2 | Sim |

### Posso treinar meu proprio modelo/LoRA?

Esta fora do escopo do squad (que foca em uso, nao treinamento). Mas voce pode usar LoRAs treinadas externamente com o squad sem problemas.

### Como integrar com outros squads AIOS?

O Video Creation Squad pode receber inputs de outros squads:

- **Copywriting Squad:** Roteiros e scripts
- **Design Squad:** Imagens de referencia
- **Marketing Squad:** Briefings de campanha

A integracao e feita via arquivos e handoff entre agentes.

---

## Glossario

| Termo | Significado |
|-------|------------|
| **T2V** | Text-to-Video: gerar video a partir de texto |
| **I2V** | Image-to-Video: gerar video a partir de imagem |
| **V2V** | Video-to-Video: transformar video existente |
| **VRAM** | Video RAM: memoria da placa de video |
| **FPS** | Frames per second: quadros por segundo |
| **Upscaling** | Aumentar a resolucao de um video |
| **Frame Interpolation** | Gerar frames intermediarios para suavizar motion |
| **IP-Adapter** | Tecnica para injetar identidade visual na geracao |
| **FaceID** | Variante de IP-Adapter focada em rostos |
| **ControlNet** | Tecnica para guiar a geracao com mapas de controle |
| **CFG Scale** | Classifier-Free Guidance: quao fielmente seguir o prompt |
| **Sampling Steps** | Numero de iteracoes de denoising |
| **Checkpoint** | Ponto de verificacao no pipeline de producao |
| **LoRA** | Low-Rank Adaptation: fine-tuning leve de modelos |
| **ComfyUI** | Interface visual node-based para pipelines de diffusion |
| **Custom Node** | Plugin para ComfyUI que adiciona funcionalidade |
| **SeedVR2** | Modelo de upscaling de video por IA |
| **GIMM-VFI** | Modelo de frame interpolation |
| **MoE** | Mixture of Experts: arquitetura de modelo |

---

*Video Creation Squad - AIOS v1.0.0*
*Documentacao atualizada em Fevereiro 2026*
