# Video Creation Squad

> AI-powered video generation, enhancement, and production using ComfyUI-based pipelines.

---

## Overview

The Video Creation Squad provides autonomous AI agents for end-to-end video production.
From script and shot planning through generation, enhancement, audio integration, and
final delivery, the squad orchestrates state-of-the-art video generation models through
ComfyUI workflows.

The squad supports text-to-video (T2V), image-to-video (I2V), and video-to-video (V2V)
pipelines, with built-in character consistency via IP-Adapter FaceID, production-quality
upscaling via SeedVR2, frame interpolation via GIMM-VFI, and audio integration through
ElevenLabs, Suno, and Udio.

---

## Agents

| Agent | Tier | Responsibility |
|-------|------|---------------|
| `video-director` | Orchestrator | Plans shots, coordinates pipeline, manages multi-shot consistency |
| `video-generator` | Specialist | Executes T2V/I2V/V2V generation using Wan, Hunyuan, CogVideoX, LTX |
| `video-enhancer` | Specialist | Upscaling (SeedVR2), frame interpolation (GIMM-VFI), Topaz integration |
| `character-designer` | Specialist | Character reference sheets, IP-Adapter FaceID, InsightFace embeddings |
| `audio-producer` | Specialist | Voice (ElevenLabs), music (Suno/Udio), SFX, audio mixing |
| `prompt-engineer` | Support | Prompt optimization per model, negative prompts, style keywords |
| `quality-reviewer` | Support | Artifact detection, consistency checks, quality validation |
| `comfyui-admin` | Support | Node installation, model management, VRAM optimization, troubleshooting |

---

## Commands

| Command | Description | Agent |
|---------|-------------|-------|
| `/video-create` | Full pipeline: script to final video | video-director |
| `/video-t2v` | Text-to-video generation for a single shot | video-generator |
| `/video-i2v` | Image-to-video generation from reference image | video-generator |
| `/video-v2v` | Video-to-video style transfer | video-generator |
| `/video-enhance` | Upscale and interpolate existing video | video-enhancer |
| `/video-character` | Generate character reference sheet and embeddings | character-designer |
| `/video-audio` | Generate and mix audio (voice, music, SFX) | audio-producer |
| `/video-prompt` | Optimize prompt for specific model | prompt-engineer |
| `/video-review` | Run quality checklist on generated video | quality-reviewer |
| `/video-setup` | Verify ComfyUI installation and dependencies | comfyui-admin |
| `/video-models` | List and manage downloaded models | comfyui-admin |

---

## Quick Start

### 1. Verify Setup
```
/video-setup
```
Runs the ComfyUI setup checklist to ensure all nodes, models, and dependencies
are installed and working.

### 2. Generate a Simple Video
```
/video-t2v "A lighthouse on a cliff at sunset, waves crashing below, cinematic drone shot"
```
Generates a single T2V shot using the default model (Wan 2.1 14B) at 720p.

### 3. Create a Multi-Shot Video
```
/video-create --script "30-second product showcase for a smartwatch"
```
The director agent plans shots, coordinates generation with character consistency,
adds enhancement, generates audio, and delivers the final video.

### 4. Enhance Existing Video
```
/video-enhance input.mp4 --upscale 2x --interpolate 48fps
```
Upscales to 2x resolution and interpolates to 48fps using the dual-stage pipeline.

---

## Pipeline Diagram

```
                         VIDEO CREATION PIPELINE
 ============================================================================

  PLANNING                GENERATION              ENHANCEMENT         DELIVERY
 ----------              -----------              -----------         --------

 [Script]                                                            [Final
  |                                                                   Video]
  v                                                                    ^
 [Shot List]                                                           |
  |                                                                    |
  v                                                                    |
 [Character    -----> [IP-Adapter                                      |
  Refs]                FaceID]                                         |
  |                     |                                              |
  v                     v                                              |
 [Style        -----> [Model Selection]                                |
  Refs]                 |                                              |
                        |-----> T2V (Wan/Hunyuan/CogVideoX/LTX)       |
                        |-----> I2V (Wan I2V/Hunyuan I2V)              |
                        |-----> V2V (Wan 2.2 V2V + ControlNet)        |
                        |                                              |
                        v                                              |
                      [Raw Video]                                      |
                        |                                              |
                        v                                              |
                      [Frame Interpolation] -----> GIMM-VFI / RIFE    |
                        |                                              |
                        v                                              |
                      [Upscaling] ----------> SeedVR2 / Topaz         |
                        |                                              |
                        v                                              |
                      [Enhanced Video]                                 |
                        |                                              |
                        v                                              |
                      [Audio Integration]                              |
                        |-----> Voice (ElevenLabs)                     |
                        |-----> Music (Suno / Udio)                    |
                        |-----> SFX (ElevenLabs SFX)                   |
                        |                                              |
                        v                                              |
                      [Audio Mix + Export] --------------------------->+

 ============================================================================
```

---

## Supported Models

### Video Generation

| Model | Provider | Parameters | Max Resolution | Max Duration | VRAM |
|-------|----------|-----------|---------------|-------------|------|
| Wan 2.1/2.2 14B | Alibaba | 14B (MoE) | 1080x1920 | 10s | 24 GB |
| Wan 2.1/2.2 5B | Alibaba | 5B | 720x1280 | 8s | 12 GB |
| Wan 2.1 1.3B | Alibaba | 1.3B | 480x848 | 6s | 6 GB |
| HunyuanVideo | Tencent | 13B | 1280x720 | 5s | 24 GB |
| CogVideoX-5B | Zhipu AI | 5B | 768x1360 | 10s | 16 GB |
| LTX-2 (2B-13B) | Lightricks | 2B-13B | Up to 4K | 5s | 8-24 GB |
| AnimateDiff v3 | Community | ~1.5B addon | SD native | 3s+ | 8 GB |

### Enhancement

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| SeedVR2 | AI upscaling | 480p-720p | 1080p-4K |
| GIMM-VFI | Frame interpolation | 16-24fps | 48-60fps |
| Topaz Video AI | Professional enhancement | Any | Up to 4K/60fps |

### Audio

| Tool | Purpose | Key Feature |
|------|---------|------------|
| ElevenLabs | Voice, SFX | 10K+ voices, Video-to-SFX |
| Suno | Music (with vocals) | Full song generation |
| Udio | Music (instrumentals) | BPM/key control, stems |

---

## Tools and Technologies

- **ComfyUI** - Node-based workflow engine for all generation and enhancement
- **Python 3.10+** - Runtime environment
- **PyTorch 2.0+** - Deep learning framework
- **CUDA 12.1+** - GPU acceleration
- **ffmpeg** - Video encoding, muxing, and format conversion
- **InsightFace** - Face detection and recognition for character consistency
- **Git LFS** - Large model file management

---

## Directory Structure

```
squads/video-creation/
  agents/           # Agent definitions and configurations
  checklists/       # Quality and setup checklists
    comfyui-setup-checklist.md
    video-quality-checklist.md
  config/           # Squad and model configuration files
  config.yaml       # Main squad configuration
  data/             # Knowledge base and reference data
    video-creation-kb.md
  docs/             # Additional documentation
  scripts/          # Automation scripts
  tasks/            # Task templates and definitions
  templates/        # Workflow and prompt templates
  utils/            # Utility functions and helpers
  workflows/        # ComfyUI workflow JSON files
  README.md         # This file
```

---

## Requirements

### Minimum Hardware
- **GPU:** NVIDIA RTX 3090 (24 GB VRAM)
- **RAM:** 64 GB DDR4/DDR5
- **Storage:** 500 GB SSD free (models require ~200 GB)
- **CPU:** 8+ cores

### Recommended Hardware
- **GPU:** NVIDIA RTX 4090 (24 GB) or 2x RTX 4090
- **RAM:** 128 GB DDR5
- **Storage:** 2 TB NVMe SSD
- **CPU:** 16+ cores (AMD Ryzen 9 / Intel i9)

### Software
- Python 3.10 or 3.11
- NVIDIA CUDA 12.1+
- Git + Git LFS
- ffmpeg 5.0+
- ComfyUI (latest)

### API Keys (Optional, for audio features)
- ElevenLabs API key (voice and SFX generation)
- Suno account (music generation)
- Udio account (instrumental generation)

---

## References

- [Knowledge Base](data/video-creation-kb.md) - Comprehensive model and pipeline documentation
- [Video Quality Checklist](checklists/video-quality-checklist.md) - Production quality validation
- [ComfyUI Setup Checklist](checklists/comfyui-setup-checklist.md) - Installation verification
- [ComfyUI Documentation](https://docs.comfy.org/)
- [Wan 2.1 Repository](https://github.com/Wan-Video/Wan2.1)
- [HunyuanVideo Repository](https://github.com/Tencent/HunyuanVideo)
- [CogVideoX Repository](https://github.com/THUDM/CogVideo)
- [AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
