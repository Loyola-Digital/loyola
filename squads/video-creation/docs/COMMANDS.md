# Referencia Completa de Comandos

> Todos os comandos disponiveis no Video Creation Squad, organizados por agente.

---

## Indice

1. [Visao Geral](#visao-geral)
2. [Comandos do video-director](#comandos-do-video-director)
3. [Comandos do video-generator](#comandos-do-video-generator)
4. [Comandos do video-enhancer](#comandos-do-video-enhancer)
5. [Comandos do character-designer](#comandos-do-character-designer)
6. [Comandos do audio-producer](#comandos-do-audio-producer)
7. [Comandos do prompt-engineer](#comandos-do-prompt-engineer)
8. [Comandos do quality-reviewer](#comandos-do-quality-reviewer)
9. [Comandos do comfyui-admin](#comandos-do-comfyui-admin)
10. [Parametros Globais](#parametros-globais)
11. [Exemplos de Uso Combinado](#exemplos-de-uso-combinado)

---

## Visao Geral

### Tabela Rapida de Comandos

| Comando | Agente | Descricao |
|---------|--------|-----------|
| `/video-create` | video-director | Pipeline completo: script ate video final |
| `/video-t2v` | video-generator | Text-to-Video para shot unico |
| `/video-i2v` | video-generator | Image-to-Video a partir de referencia |
| `/video-v2v` | video-generator | Video-to-Video style transfer |
| `/video-enhance` | video-enhancer | Upscale e interpolacao de video existente |
| `/video-character` | character-designer | Gerar reference sheet e embeddings |
| `/video-audio` | audio-producer | Gerar e mixar audio (voz, musica, SFX) |
| `/video-prompt` | prompt-engineer | Otimizar prompt para modelo especifico |
| `/video-review` | quality-reviewer | Rodar checklist de qualidade |
| `/video-setup` | comfyui-admin | Verificar instalacao e dependencias |
| `/video-models` | comfyui-admin | Listar e gerenciar modelos |

### Como Ativar o Squad

```
@video-director
```

Ativa o Video Director, que orquestra todos os outros agentes. Voce pode tambem chamar agentes individuais:

```
@prompt-engineer
@comfyui-admin
@character-designer
@post-production
@motion-designer
```

---

## Comandos do video-director

O Video Director e o orquestrador principal. Ele coordena todos os outros agentes.

### /video-create

**Descricao:** Executa o pipeline completo de criacao de video, desde o briefing ate a entrega final com audio.

**Sintaxe:**
```
/video-create [briefing] [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--script` | string | - | Texto do roteiro |
| `--script-file` | path | - | Arquivo com o roteiro |
| `--mode` | enum | quality | Modo: quality, fast, hybrid |
| `--model` | string | wan_2_1_14b | Modelo padrao para geracao |
| `--resolution` | string | 1280x720 | Resolucao do output |
| `--fps` | int | 24 | FPS do output |
| `--format` | enum | mp4 | Formato: mp4, mov, webm |
| `--output-dir` | path | ./output/ | Diretorio de saida |
| `--no-audio` | flag | false | Pular geracao de audio |
| `--no-enhance` | flag | false | Pular enhancement |

**Exemplos:**

```
# Video simples a partir de descricao
/video-create "30-second product showcase for a smartwatch"

# Com roteiro detalhado
/video-create --script "Shot 1: Close-up of watch face. Shot 2: Pull back to wrist. Shot 3: Lifestyle jogging."

# Modo rapido para teste
/video-create --mode fast "Quick test: cat jumping off table"

# Com arquivo de roteiro
/video-create --script-file roteiro.md --mode quality

# Sem audio, sem enhancement (geracao pura)
/video-create --no-audio --no-enhance "Beach sunset timelapse"

# Resolucao e formato especificos
/video-create --resolution 1080x1920 --fps 30 --format mov "Instagram reel about coffee"
```

**Fluxo de execucao:**

```
1. Pre-flight check (ambiente, VRAM, modelos)
2. Coleta de parametros (tipo, modo, personagens)
3. Fase 1: Pre-producao (shot list, prompts, character refs)
4. Fase 2: Geracao (workflow ComfyUI por shot)
5. Fase 3: Enhancement (interpolation, upscaling)
6. Fase 4: Pos-producao (audio, transicoes, color grading)
7. Fase 5: Entrega (render final, export)
```

---

### Comandos Internos do Director

Estes comandos sao usados durante um projeto em andamento:

```
# Ver status do projeto atual
@video-director *status

# Listar shots do projeto
@video-director *shots

# Re-gerar um shot especifico
@video-director *redo-shot 3

# Aprovar fase atual e avancar
@video-director *approve

# Solicitar ajustes em fase
@video-director *adjust "O shot 2 precisa de mais movimento"

# Cancelar projeto
@video-director *cancel

# Exportar projeto (shots individuais + final)
@video-director *export --all
```

---

## Comandos do video-generator

O Video Generator executa a geracao propriamente dita usando ComfyUI.

### /video-t2v

**Descricao:** Text-to-Video. Gera um video a partir de um prompt de texto.

**Sintaxe:**
```
/video-t2v "prompt" [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--model` | string | wan_2_1_14b | Modelo de geracao |
| `--resolution` | string | 1280x720 | Resolucao WxH |
| `--fps` | int | 24 | Frames por segundo |
| `--duration` | string | 5s | Duracao do video |
| `--negative` | string | (padrao) | Negative prompt |
| `--seed` | int | -1 | Seed (-1 = aleatorio) |
| `--cfg` | float | 7.0 | CFG scale |
| `--steps` | int | 25 | Sampling steps |
| `--scheduler` | string | (auto) | Scheduler/sampler |
| `--batch` | int | 1 | Numero de variacoes |
| `--save-workflow` | string | - | Nome para salvar workflow |
| `--output` | path | ./output/ | Caminho de saida |

**Exemplos:**

```
# Geracao basica
/video-t2v "A lighthouse on a cliff at sunset, waves crashing below, cinematic drone shot"

# Com modelo especifico e seed
/video-t2v "Futuristic city at night, neon lights, flying cars" --model hunyuan --seed 42

# Vertical para redes sociais
/video-t2v "Woman dancing in studio, professional lighting" --resolution 1080x1920 --fps 30

# Multiplas variacoes
/video-t2v "Abstract fluid art, vibrant colors" --batch 4 --seed 100

# Com modelo leve para teste rapido
/video-t2v "Cat playing with yarn" --model wan_2_1_1_3b --resolution 480x848

# Salvar workflow para reutilizar
/video-t2v "Ocean waves at dawn" --save-workflow waves_template

# Ajustes finos de geracao
/video-t2v "Portrait of elderly man, contemplative" \
  --model wan_2_1_14b \
  --cfg 8.0 \
  --steps 30 \
  --duration 8s \
  --negative "blurry, distorted, deformed, low quality, watermark"
```

### /video-i2v

**Descricao:** Image-to-Video. Anima uma imagem de referencia.

**Sintaxe:**
```
/video-i2v <imagem> "prompt de movimento" [opcoes]
```

**Opcoes adicionais (alem das de T2V):**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--strength` | float | 0.8 | Quanto pode desviar da imagem (0.0-1.0) |
| `--reference-mode` | enum | full | full, face_only, pose_only |

**Exemplos:**

```
# Animar foto de pessoa
/video-i2v photo.png "The woman turns her head and smiles, gentle breeze in her hair"

# Animar foto de produto
/video-i2v product.png "Slow rotation revealing all angles, studio lighting" --strength 0.6

# Animar paisagem
/video-i2v landscape.jpg "Clouds moving, water flowing, birds flying" --duration 8s

# Com controle fino de fidelidade
/video-i2v character.png "Character walking forward" --strength 0.5 --reference-mode full
```

### /video-v2v

**Descricao:** Video-to-Video. Transforma um video existente com novo estilo ou modificacoes.

**Sintaxe:**
```
/video-v2v <video-input> "prompt de transformacao" [opcoes]
```

**Opcoes adicionais:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--denoise` | float | 0.7 | Forca da transformacao (0.0-1.0) |
| `--controlnet` | string | - | Tipo de ControlNet (depth, pose, canny) |
| `--preserve-motion` | flag | true | Manter motion original |

**Exemplos:**

```
# Estilizar video existente
/video-v2v input.mp4 "Anime style, vibrant colors, Studio Ghibli aesthetic"

# Com ControlNet para manter estrutura
/video-v2v input.mp4 "Cyberpunk neon city" --controlnet depth --denoise 0.6

# Preservar motion original com novo visual
/video-v2v dance.mp4 "Oil painting style, impressionist" --preserve-motion --denoise 0.5
```

---

## Comandos do video-enhancer

O Video Enhancer cuida de upscaling e frame interpolation.

### /video-enhance

**Descricao:** Melhora a qualidade de um video existente com upscaling e/ou frame interpolation.

**Sintaxe:**
```
/video-enhance <video-input> [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--upscale` | string | 2x | Fator de upscale: 1.5x, 2x, 4x |
| `--interpolate` | string | - | FPS alvo: 30fps, 48fps, 60fps |
| `--engine-upscale` | enum | seedvr2 | seedvr2, topaz |
| `--engine-interp` | enum | gimm-vfi | gimm-vfi, rife |
| `--denoise` | float | 0.3 | Nivel de denoising no upscale |
| `--tile-size` | int | 512 | Tile size (para VRAM limitada) |
| `--output` | path | - | Caminho de saida |

**Exemplos:**

```
# Upscale 2x
/video-enhance input.mp4 --upscale 2x

# Frame interpolation para 48fps
/video-enhance input.mp4 --interpolate 48fps

# Ambos (upscale + interpolation)
/video-enhance input.mp4 --upscale 2x --interpolate 48fps

# Com Topaz ao inves de SeedVR2
/video-enhance input.mp4 --upscale 2x --engine-upscale topaz

# Para VRAM limitada (tiles menores)
/video-enhance input.mp4 --upscale 2x --tile-size 256

# Upscale maximo
/video-enhance input.mp4 --upscale 4x --interpolate 60fps --engine-upscale seedvr2
```

---

## Comandos do character-designer

O Character Designer garante consistencia visual de personagens.

### /video-character

**Descricao:** Cria reference sheets e embeddings para manter personagens consistentes entre shots.

**Sintaxe:**
```
/video-character [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--reference` | path | - | Imagem de referencia do personagem |
| `--references` | paths | - | Multiplas imagens (separadas por virgula) |
| `--name` | string | - | Nome do personagem |
| `--description` | string | - | Descricao visual do personagem |
| `--generate-sheet` | flag | true | Gerar reference sheet multi-angulo |
| `--method` | enum | faceID | faceID, instantID, ipadapter |
| `--weight` | float | 0.8 | Peso do IP-Adapter (0.0-1.0) |

**Exemplos:**

```
# Criar personagem a partir de foto
/video-character --reference photo.png --name "Maria"

# Com multiplas referencias para melhor consistencia
/video-character \
  --references front.png,side.png,back.png \
  --name "Carlos" \
  --description "Homem, 35 anos, cabelo curto preto, barba"

# Sem gerar reference sheet (so embeddings)
/video-character --reference face.png --name "Ana" --generate-sheet false

# Com InstantID ao inves de FaceID
/video-character --reference photo.png --name "Pedro" --method instantID

# Ajustar peso da consistencia
/video-character --reference photo.png --name "Julia" --weight 0.9
```

### Comandos auxiliares do character-designer

```
# Listar personagens do projeto
@character-designer *list

# Ver detalhes de um personagem
@character-designer *show "Maria"

# Atualizar referencia de personagem
@character-designer *update "Maria" --reference nova_foto.png

# Testar consistencia de personagem em prompt
@character-designer *test "Maria" "walking in a park, medium shot"

# Remover personagem do projeto
@character-designer *remove "Maria"
```

---

## Comandos do audio-producer

O Audio Producer gera e mixar voz, musica e efeitos sonoros.

### /video-audio

**Descricao:** Gera e integra audio ao video.

**Sintaxe:**
```
/video-audio <video-input> [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--voice` | string | - | Texto para narracao / voice-over |
| `--voice-id` | string | - | ID da voz ElevenLabs |
| `--voice-file` | path | - | Arquivo de audio de voz pre-gravado |
| `--music` | string | - | Prompt para geracao de musica |
| `--music-style` | enum | - | instrumental, vocal, ambient |
| `--music-bpm` | int | - | BPM alvo da musica |
| `--music-engine` | enum | suno | suno, udio |
| `--sfx` | string | - | Descricao dos efeitos sonoros |
| `--sfx-auto` | flag | false | Gerar SFX automaticamente a partir do video |
| `--mix` | flag | true | Mixar todas as tracks |
| `--volume-voice` | float | 1.0 | Volume da voz (0.0-1.0) |
| `--volume-music` | float | 0.3 | Volume da musica (0.0-1.0) |
| `--volume-sfx` | float | 0.5 | Volume dos SFX (0.0-1.0) |

**Exemplos:**

```
# Adicionar narracao
/video-audio video.mp4 --voice "Welcome to the future of technology" --voice-id "josh"

# Adicionar musica instrumental
/video-audio video.mp4 --music "Epic cinematic orchestral, building tension" --music-engine udio

# Adicionar musica com vocal
/video-audio video.mp4 --music "Upbeat pop song about summer vibes" --music-engine suno

# SFX automatico baseado no video
/video-audio video.mp4 --sfx-auto

# SFX manual
/video-audio video.mp4 --sfx "ocean waves, seagulls, gentle wind"

# Mix completo: voz + musica + SFX
/video-audio video.mp4 \
  --voice "This is our new product" \
  --music "Corporate upbeat, 120bpm" --music-engine udio \
  --sfx "soft whoosh transitions" \
  --volume-voice 1.0 \
  --volume-music 0.2 \
  --volume-sfx 0.4

# Usando arquivo de voz pre-gravado
/video-audio video.mp4 --voice-file narration.mp3 --music "ambient background"
```

---

## Comandos do prompt-engineer

O Prompt Engineer otimiza prompts para cada modelo.

### /video-prompt

**Descricao:** Otimiza um prompt para um modelo de video especifico.

**Sintaxe:**
```
/video-prompt "prompt original" [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--model` | string | wan_2_1_14b | Modelo alvo |
| `--style` | string | cinematic | Estilo visual alvo |
| `--include-negative` | flag | true | Incluir negative prompt |
| `--verbose` | flag | false | Mostrar explicacao das otimizacoes |

**Exemplos:**

```
# Otimizar para Wan 14B
/video-prompt "gato pulando de uma mesa" --model wan_2_1_14b

# Resultado esperado:
# POSITIVE: "A domestic cat leaping off a wooden table, dynamic motion,
#           indoor setting, natural lighting, medium shot, smooth camera,
#           4K cinematic, high detail"
# NEGATIVE: "blurry, distorted, static, no motion, low quality, watermark"

# Otimizar para HunyuanVideo com estilo especifico
/video-prompt "mulher andando na praia" --model hunyuan --style "dreamy, ethereal"

# Otimizar para AnimateDiff (usa tags estilo SD)
/video-prompt "castelo medieval" --model animatediff

# Com explicacao detalhada
/video-prompt "carro esportivo em corrida" --verbose
```

### Comandos auxiliares do prompt-engineer

```
# Sugerir negative prompts para um cenario
@prompt-engineer *negatives "video de produto em estudio"

# Sugerir keywords de estilo
@prompt-engineer *styles --list

# Converter prompt de imagem para prompt de video
@prompt-engineer *adapt "masterpiece, 1girl, sakura trees, detailed" --to video

# Analizar por que um prompt nao funcionou bem
@prompt-engineer *analyze "prompt original" --result screenshot.png
```

---

## Comandos do quality-reviewer

O Quality Reviewer valida a qualidade dos videos gerados.

### /video-review

**Descricao:** Executa uma checklist de qualidade em um video gerado.

**Sintaxe:**
```
/video-review <video-input> [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--checklist` | enum | full | full, quick, consistency, technical |
| `--reference` | path | - | Imagem de referencia para comparacao |
| `--threshold` | float | 0.85 | Score minimo para aprovacao |
| `--verbose` | flag | false | Relatorio detalhado |

**Exemplos:**

```
# Review completo
/video-review output.mp4

# Review rapido (so itens criticos)
/video-review output.mp4 --checklist quick

# Review de consistencia com referencia
/video-review output.mp4 --checklist consistency --reference character.png

# Review tecnico (resolucao, fps, codec)
/video-review output.mp4 --checklist technical

# Com score customizado
/video-review output.mp4 --threshold 0.90 --verbose
```

**Output esperado:**

```
┌─────────────────────────────────────────────────────────────┐
│ VIDEO QUALITY REVIEW                                        │
├─────────────────────────────────────────────────────────────┤
│ Arquivo: output.mp4                                         │
│ Resolucao: 1280x720 | FPS: 24 | Duracao: 5.2s             │
├─────────────────────────────────────────────────────────────┤
│ [PASS] Resolucao minima atendida                            │
│ [PASS] FPS consistente ao longo do video                    │
│ [PASS] Sem frames pretos                                    │
│ [WARN] Flickering leve detectado (frames 45-52)             │
│ [PASS] Sem artefatos visuais graves                         │
│ [PASS] Motion coerente                                      │
│ [PASS] Consistencia de cor                                  │
│ [N/A]  Audio nao presente                                   │
├─────────────────────────────────────────────────────────────┤
│ SCORE: 0.88 / 1.00                                          │
│ STATUS: APROVADO (threshold: 0.85)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Comandos do comfyui-admin

O ComfyUI Admin gerencia a infraestrutura tecnica.

### /video-setup

**Descricao:** Verifica e configura o ambiente ComfyUI completo.

**Sintaxe:**
```
/video-setup [opcoes]
```

**Opcoes:**

| Parametro | Tipo | Default | Descricao |
|-----------|------|---------|-----------|
| `--install-nodes` | flag | false | Instalar nodes faltantes automaticamente |
| `--install-models` | list | - | Modelos para baixar |
| `--verbose` | flag | false | Log detalhado |
| `--check-only` | flag | false | Apenas verificar, nao instalar |
| `--fix` | flag | false | Tentar corrigir problemas encontrados |

**Exemplos:**

```
# Verificacao completa
/video-setup

# Instalar tudo que falta
/video-setup --install-nodes --fix

# Instalar modelos especificos
/video-setup --install-models wan_2_1_14b,hunyuan_video

# Apenas diagnostico
/video-setup --check-only --verbose

# Correcao automatica
/video-setup --fix
```

### /video-models

**Descricao:** Lista e gerencia modelos instalados.

**Sintaxe:**
```
/video-models [acao] [opcoes]
```

**Acoes:**

| Acao | Descricao |
|------|-----------|
| `list` | Listar modelos instalados |
| `download` | Baixar modelo |
| `remove` | Remover modelo |
| `info` | Detalhes de um modelo |
| `check` | Verificar integridade |

**Exemplos:**

```
# Listar todos os modelos
/video-models list

# Baixar modelo
/video-models download wan_2_1_14b

# Informacoes de um modelo
/video-models info wan_2_1_14b

# Verificar integridade
/video-models check wan_2_1_14b

# Remover modelo (liberar espaco)
/video-models remove cogvideox_5b
```

### Comandos auxiliares do comfyui-admin

```
# Status do ComfyUI
@comfyui-admin *status

# Verificar VRAM
@comfyui-admin *vram

# Listar custom nodes
@comfyui-admin *nodes

# Atualizar todos os nodes
@comfyui-admin *update-nodes

# Verificar espaco em disco
@comfyui-admin *disk

# Reiniciar ComfyUI
@comfyui-admin *restart

# Ver logs de erro
@comfyui-admin *logs

# Limpar cache e temporarios
@comfyui-admin *cleanup

# Otimizar configuracao para VRAM disponivel
@comfyui-admin *optimize --vram 12
```

---

## Parametros Globais

Estes parametros podem ser usados com qualquer comando:

| Parametro | Tipo | Descricao |
|-----------|------|-----------|
| `--output` / `-o` | path | Diretorio ou arquivo de saida |
| `--verbose` / `-v` | flag | Output detalhado |
| `--quiet` / `-q` | flag | Output minimo |
| `--dry-run` | flag | Simular execucao sem gerar |
| `--project` | string | ID do projeto (para multi-shot) |
| `--gpu` | int | Indice da GPU a usar (0, 1, etc.) |

---

## Exemplos de Uso Combinado

### Exemplo 1: Video de Produto Completo

```
# 1. Setup (uma vez)
/video-setup

# 2. Criar personagem do produto
/video-character --reference smartwatch.png --name "SmartWatch X1"

# 3. Otimizar prompt principal
/video-prompt "smartwatch product showcase, premium feel" --style "commercial, clean"

# 4. Criar video completo
/video-create --mode quality \
  --script "15-second SmartWatch X1 reveal: close-up face, wrist shot, lifestyle" \
  --resolution 1080x1920 \
  --fps 30

# 5. Se precisar melhorar um shot
/video-enhance shot_2.mp4 --upscale 2x --interpolate 48fps

# 6. Review final
/video-review final_output.mp4 --checklist full --verbose
```

### Exemplo 2: Iteracao Rapida com Testes

```
# Testar prompts rapidamente (modelo leve)
/video-t2v "Abstract geometric shapes morphing" --model wan_2_1_1_3b --resolution 480x848

# Refinar prompt com ajuda
/video-prompt "geometric shapes" --model wan_2_1_14b --verbose

# Gerar versao final com modelo full
/video-t2v "[prompt otimizado]" --model wan_2_1_14b --resolution 1280x720

# Enhance
/video-enhance output.mp4 --upscale 2x --interpolate 48fps
```

### Exemplo 3: Video Musical

```
# 1. Gerar shots
/video-t2v "Band performing on stage, concert lights, crowd" --duration 5s --batch 3

# 2. Gerar musica
/video-audio best_shot.mp4 \
  --music "Rock concert, electric guitar solo, 140bpm" \
  --music-engine suno

# 3. Adicionar SFX
/video-audio output_with_music.mp4 \
  --sfx "crowd cheering, concert atmosphere" \
  --volume-sfx 0.3
```

### Exemplo 4: Serie com Personagem Recorrente

```
# 1. Setup do personagem
/video-character \
  --references face_front.png,face_side.png,full_body.png \
  --name "Luna" \
  --description "Young woman, purple hair, leather jacket"

# 2. Episodio 1
/video-create --mode hybrid \
  --script "Luna walks through neon-lit alley, discovers hidden door" \
  --project "luna-series-ep1"

# 3. Episodio 2 (mesmo personagem, automaticamente consistente)
/video-create --mode hybrid \
  --script "Luna enters mysterious room, finds glowing artifact" \
  --project "luna-series-ep2"
```

---

## Referencia Rapida: Modelos por Comando

| Modelo ID | Nome Completo | Suporta |
|-----------|--------------|---------|
| `wan_2_1_1_3b` | Wan 2.1 1.3B | T2V |
| `wan_2_1_5b` | Wan 2.1 5B | T2V, I2V |
| `wan_2_1_14b` | Wan 2.1 14B | T2V, I2V |
| `wan_2_2` | Wan 2.2 | T2V, I2V, V2V |
| `hunyuan` | HunyuanVideo 13B | T2V, I2V |
| `cogvideox` | CogVideoX-5B | T2V |
| `ltx_2` | LTX-2 (auto-size) | T2V, I2V |
| `animatediff` | AnimateDiff v3 | T2V (com SD) |

---

*Video Creation Squad - AIOS v1.0.0*
*Documentacao atualizada em Fevereiro 2026*
