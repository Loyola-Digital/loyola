# Quick Start: Criando Seu Primeiro Video com IA

> **Este e um guia rapido.** Para referencia completa de comandos, veja [COMMANDS.md](./COMMANDS.md).
>
> **Problemas?** Consulte [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) ou [FAQ.md](./FAQ.md).

---

## Indice

1. [Pre-requisitos](#pre-requisitos)
2. [Verificando o Ambiente](#verificando-o-ambiente)
3. [Seu Primeiro Video (Text-to-Video)](#seu-primeiro-video-text-to-video)
4. [Video a Partir de Imagem (Image-to-Video)](#video-a-partir-de-imagem-image-to-video)
5. [Projeto Multi-Shot Completo](#projeto-multi-shot-completo)
6. [Modos de Execucao](#modos-de-execucao)
7. [Proximos Passos](#proximos-passos)

---

## Pre-requisitos

### Hardware Minimo

| Componente | Minimo | Recomendado |
|-----------|--------|-------------|
| **GPU** | NVIDIA RTX 3090 (24 GB VRAM) | NVIDIA RTX 4090 (24 GB) |
| **RAM** | 64 GB DDR4/DDR5 | 128 GB DDR5 |
| **Storage** | 500 GB SSD livre | 2 TB NVMe SSD |
| **CPU** | 8+ cores | 16+ cores |

> **Apple Silicon:** Macs com M1 Pro/Max/Ultra com 32 GB+ de memoria unificada funcionam para modelos menores (Wan 1.3B, AnimateDiff). Para modelos 5B+ recomenda-se NVIDIA.

### Software Obrigatorio

```
Checklist de Software
[ ] Python 3.10 ou 3.11
[ ] NVIDIA CUDA 12.1+ (para GPUs NVIDIA)
[ ] Git + Git LFS
[ ] ffmpeg 5.0+
[ ] ComfyUI (ultima versao)
[ ] Claude Code funcionando
[ ] Projeto AIOS configurado
```

### Verificacao Rapida

Para confirmar que tudo esta instalado, rode estes comandos no terminal:

```bash
python --version          # Deve ser 3.10+
git --version             # Qualquer versao recente
git lfs version           # Precisa estar instalado
ffmpeg -version           # Deve ser 5.0+
nvidia-smi                # Mostra GPU e VRAM (NVIDIA apenas)
```

### API Keys (Opcional - para audio)

Se voce quer audio nos videos, configure estas APIs:

| Servico | Para que serve | Como obter |
|---------|---------------|------------|
| **ElevenLabs** | Vozes e efeitos sonoros | elevenlabs.io |
| **Suno** | Musica com vocais | suno.ai |
| **Udio** | Musica instrumental | udio.com |

---

## Verificando o Ambiente

### Passo 1: Ativar o Squad

```
@video-director
```

O Video Director vai exibir um greeting com o status do squad e comandos disponiveis.

### Passo 2: Rodar o Setup

```
/video-setup
```

Este comando aciona o workflow `wf-setup-environment` e verifica:

1. **ComfyUI Base** - Instalacao do ComfyUI funcional
2. **Custom Nodes** - Nodes obrigatorios instalados
3. **Modelos** - Pelo menos um modelo de video disponivel
4. **Espaco em Disco** - 50 GB+ livres
5. **VRAM** - 12 GB+ disponiveis

```
RESULTADO ESPERADO:
┌─────────────────────────────────────────────────────────────┐
│ SETUP CHECK: Video Creation Squad                           │
├─────────────────────────────────────────────────────────────┤
│ [OK] ComfyUI instalado em /Users/felipegobbi/ComfyUI       │
│ [OK] ComfyUI acessivel em http://127.0.0.1:8188            │
│ [OK] ComfyUI-VideoHelperSuite instalado                     │
│ [OK] ComfyUI-WanVideoWrapper instalado                      │
│ [OK] ComfyUI_IPAdapter_plus instalado                       │
│ [OK] Modelo wan2.1_14b encontrado                           │
│ [OK] 320 GB livres em disco                                 │
│ [OK] GPU: RTX 4090 (24 GB VRAM)                            │
├─────────────────────────────────────────────────────────────┤
│ STATUS: Pronto para geracao de video                        │
└─────────────────────────────────────────────────────────────┘
```

### Se o Setup Falhar

Se algum item estiver faltando, o `comfyui-architect` vai guiar voce pela instalacao:

```
ITEM FALTANDO                   ACAO AUTOMATICA
─────────────────────────────────────────────────────────
ComfyUI nao instalado      ->  Instrucoes de instalacao
Custom node faltando        ->  git clone automatico
Modelo nao encontrado       ->  Link para download
Espaco insuficiente         ->  Sugestoes de limpeza
VRAM insuficiente           ->  Selecao de modelo menor
```

---

## Seu Primeiro Video (Text-to-Video)

### Video Simples (1 shot)

O comando mais basico para gerar um video:

```
/video-t2v "A lighthouse on a cliff at sunset, waves crashing below, cinematic drone shot"
```

**O que acontece por baixo:**

1. `@prompt-engineer` otimiza o prompt para o modelo selecionado
2. `@comfyui-architect` monta o workflow ComfyUI
3. O video e gerado (tipicamente 3-5 segundos, 720p)
4. Resultado salvo na pasta do projeto

### Parametros Opcionais

```
/video-t2v "seu prompt aqui" \
  --model wan_2_1_14b \
  --resolution 1280x720 \
  --fps 24 \
  --duration 5s \
  --negative "blurry, distorted, low quality"
```

| Parametro | Default | Opcoes |
|-----------|---------|--------|
| `--model` | wan_2_1_14b | wan_2_1_1_3b, wan_2_1_5b, wan_2_1_14b, hunyuan, cogvideox, ltx_2 |
| `--resolution` | 1280x720 | 480x848, 720x1280, 1280x720, 1080x1920, 1920x1080 |
| `--fps` | 24 | 16, 24, 30 |
| `--duration` | 5s | 3s, 5s, 8s, 10s (depende do modelo) |
| `--negative` | (padrao interno) | Texto livre |

### Escolha do Modelo por VRAM

```
VRAM DISPONIVEL          MODELO RECOMENDADO
──────────────────────────────────────────────
6 GB                ->   Wan 2.1 1.3B (480p)
8 GB                ->   AnimateDiff / LTX-2 2B
12 GB               ->   Wan 2.1 5B (720p)
16 GB               ->   CogVideoX-5B / LTX-2
24 GB               ->   Wan 2.1 14B / HunyuanVideo (full quality)
```

---

## Video a Partir de Imagem (Image-to-Video)

Se voce tem uma imagem de referencia e quer anima-la:

```
/video-i2v reference.png "The woman turns her head slowly and smiles, gentle breeze"
```

Parametros adicionais:

```
/video-i2v reference.png "descricao do movimento" \
  --model wan_2_1_14b \
  --strength 0.8 \
  --duration 5s
```

| Parametro | Descricao |
|-----------|-----------|
| `--strength` | Quanto o video pode desviar da imagem (0.5 = fiel, 1.0 = livre) |
| `--model` | Modelos com suporte I2V: Wan 2.1/2.2, HunyuanVideo, LTX-2 |

### Dica: Consistencia de Personagem

Para manter um personagem consistente entre multiplos shots, use primeiro:

```
/video-character --reference foto_do_personagem.png --name "Maria"
```

Isso cria embeddings IP-Adapter/FaceID que serao usados automaticamente em todos os shots.

---

## Projeto Multi-Shot Completo

Para criar um video completo com multiplos shots, use o pipeline principal:

### Opcao A: Com roteiro pronto

```
/video-create --script "30-second product showcase for a smartwatch"
```

### Opcao B: Com arquivo de roteiro

```
/video-create --script-file roteiro.md
```

### Opcao C: Do zero (o director ajuda a criar o roteiro)

```
/video-create "Quero um video de 30 segundos mostrando um smartwatch futurista"
```

### O que acontece em cada fase

```
FASE 1: PRE-PRODUCAO (video-director + prompt-engineer)
  - Analise do briefing
  - Criacao do shot list
  - Planejamento de estilo visual
  - Referencias de personagens (se houver)

FASE 2: GERACAO (comfyui-architect + character-designer + motion-designer)
  - Montagem dos workflows ComfyUI por shot
  - Geracao de cada shot (T2V ou I2V)
  - Validacao de consistencia entre shots
  - Re-geracao se necessario

FASE 3: ENHANCEMENT (motion-designer)
  - Frame interpolation (GIMM-VFI): 16fps -> 48fps
  - Upscaling (SeedVR2): 720p -> 1080p/4K
  - Correcao de artefatos de movimento

FASE 4: POS-PRODUCAO (post-production)
  - Color grading
  - Transicoes entre shots
  - Audio: voz, musica, efeitos sonoros
  - Mixagem final

FASE 5: ENTREGA
  - Timeline assembly
  - Render final
  - Exportacao no formato desejado
```

---

## Modos de Execucao

Ao iniciar um projeto multi-shot, voce escolhe o modo:

### QUALITY (Recomendado para projetos importantes)

```
/video-create --mode quality "seu briefing"
```

- Checkpoints em **todas** as fases
- Revisao humana obrigatoria
- Upscaling e frame interpolation habilitados
- Ate 5 retentativas por shot
- Score de consistencia alvo: 90%
- **Tempo:** Mais lento, maior qualidade

### FAST (Para testes e iteracao rapida)

```
/video-create --mode fast "seu briefing"
```

- Checkpoints apenas no inicio e no final
- Auto-proceed em todas as fases
- Sem upscaling ou interpolation
- Ate 2 retentativas por shot
- Score de consistencia alvo: 75%
- **Tempo:** Rapido, qualidade basica

### HYBRID (Melhor dos dois mundos)

```
/video-create --mode hybrid "seu briefing"
```

- Auto-proceed em etapas tecnicas
- Revisao humana em decisoes criativas
- Upscaling e interpolation habilitados
- Ate 3 retentativas por shot
- Score de consistencia alvo: 85%
- **Tempo:** Equilibrado

---

## Dicas Essenciais para Iniciantes

### 1. Comece simples

Nao tente um video de 5 minutos com 20 personagens logo de cara. Comece com:

```
/video-t2v "A cat sitting on a windowsill, afternoon sunlight, 4K cinematic"
```

### 2. Aprenda os prompts

Os modelos de video respondem diferente de modelos de imagem. Boas praticas:

```
BOM:  "A woman walking through a park, autumn leaves falling, medium shot,
       smooth camera follow, natural lighting, 4K cinematic"

RUIM: "beautiful woman park autumn"
```

Descreva: **sujeito + acao + cenario + camera + iluminacao + estilo**

### 3. Use o prompt-engineer

Quando nao souber como formular, peca ajuda:

```
@prompt-engineer "Quero um video de um gato pulando de uma mesa"
```

Ele vai otimizar o prompt para o modelo alvo, adicionando keywords de qualidade e negative prompts.

### 4. Monitore a VRAM

Se o ComfyUI crashar, provavelmente e VRAM. Solucoes:

- Reduzir resolucao (1280x720 -> 480x848)
- Usar modelo menor (14B -> 5B -> 1.3B)
- Fechar outros programas que usam GPU

### 5. Salve seus workflows

Workflows ComfyUI que funcionaram bem podem ser reutilizados:

```
/video-t2v "prompt" --save-workflow meu_workflow_favorito
```

---

## Fluxo Completo: Exemplo Pratico

Vamos criar um video de 15 segundos de um produto:

```
# 1. Verificar ambiente
/video-setup

# 2. Criar referencia do produto (se tiver foto)
/video-character --reference produto.png --name "SmartWatch X1"

# 3. Criar o video completo
/video-create --mode hybrid \
  "15-second product reveal for SmartWatch X1.
   Start with close-up of the watch face showing dynamic display,
   then pull back to reveal it on a wrist,
   end with lifestyle shot of person checking watch while jogging.
   Modern, premium feel, blue and silver color palette."

# 4. O director vai:
#    - Decompor em 3 shots
#    - Coordenar geracao de cada shot
#    - Aplicar enhancement
#    - Adicionar musica de fundo
#    - Entregar video final

# 5. Enhancer opcionalmente
/video-enhance output.mp4 --upscale 2x --interpolate 48fps
```

---

## Proximos Passos

### Para Referencia (consulte quando precisar)

```
QUICK-START.md ────────── Voce esta aqui
   |
   v
FAQ.md ────────────────── Duvidas sobre modelos, VRAM, qualidade
   |
   v
COMMANDS.md ───────────── Referencia completa de todos os comandos
   |
   v
TROUBLESHOOTING.md ────── Quando algo da errado
   |
   v
ARCHITECTURE-DIAGRAMS.md  Entender o pipeline internamente
```

### Leitura Recomendada

- [FAQ.md](./FAQ.md) - Entenda as diferencas entre modelos e como escolher
- [COMMANDS.md](./COMMANDS.md) - Todos os comandos disponiveis por agente
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Solucoes para problemas comuns

### Recursos Externos

- [ComfyUI Documentation](https://docs.comfy.org/)
- [Wan 2.1 Repository](https://github.com/Wan-Video/Wan2.1)
- [Knowledge Base do Squad](../data/video-creation-kb.md) - Documentacao completa de modelos e pipelines

---

*Video Creation Squad - AIOS v1.0.0*
*Documentacao atualizada em Fevereiro 2026*
