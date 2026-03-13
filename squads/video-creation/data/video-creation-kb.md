# Video Creation Knowledge Base

> Comprehensive reference for AI-powered video generation, enhancement, and production
> using ComfyUI-based pipelines. Maintained by the Video Creation Squad.

---

## Table of Contents

1. [Video Generation Models](#section-1-video-generation-models)
2. [Essential ComfyUI Nodes](#section-2-essential-comfyui-nodes)
3. [Pipeline Architectures](#section-3-pipeline-architectures)
4. [Character Consistency](#section-4-character-consistency)
5. [Upscaling and Enhancement](#section-5-upscaling-and-enhancement)
6. [Audio Integration](#section-6-audio-integration)
7. [Best Practices](#section-7-best-practices)

---

## Section 1: Video Generation Models

### 1.1 Wan 2.1 / 2.2 (Alibaba Cloud / Tongyi Lab)

**Overview:**
Wan is Alibaba's flagship open-source video generation family, built on a
Mixture-of-Experts (MoE) transformer architecture. It supports text-to-video (T2V),
image-to-video (I2V), and video-to-video (V2V) generation across multiple model
sizes, making it one of the most versatile open-weight video models available.

**Model Variants:**

| Variant | Parameters | Primary Use | Min VRAM | Notes |
|---------|-----------|-------------|----------|-------|
| Wan 2.1 14B | 14B (MoE) | T2V, I2V | 24 GB | Full quality, production-grade |
| Wan 2.1 5B | 5B | T2V, I2V | 12 GB | Good balance of quality/speed |
| Wan 2.1 1.3B | 1.3B | T2V, I2V | 6 GB | Fast previews, mobile-class |
| Wan 2.2 14B | 14B (MoE) | T2V, I2V, V2V | 24 GB | Improved temporal coherence |

**Architecture Details:**
- MoE (Mixture-of-Experts) transformer with selective expert routing
- VAE encoder/decoder for latent space compression (8x spatial, 4x temporal)
- Flow-matching diffusion scheduler (Euler or DPM++ variants)
- Multi-resolution support: 480p, 720p, 1080p native generation
- Aspect ratio flexibility: 16:9, 9:16, 1:1, 4:3, 3:4
- Duration: 2-10 seconds at 16 fps (32-160 frames)

**Resolution and Duration Matrix:**

| Resolution | Max Frames (14B) | Max Frames (5B) | Max Frames (1.3B) |
|-----------|-------------------|------------------|---------------------|
| 480x848 | 160 (10s) | 128 (8s) | 96 (6s) |
| 720x1280 | 96 (6s) | 64 (4s) | 48 (3s) |
| 1080x1920 | 48 (3s) | 32 (2s) | N/A |

**Key Features:**
- Native Chinese and English bilingual prompt support
- Built-in prompt enhancement (can be toggled on/off)
- ControlNet support for pose, depth, edge guidance
- LoRA fine-tuning support for style and character training
- FP8 quantization available for reduced VRAM (approx 40% reduction)
- Supports both T5-XXL and CLIP-L text encoders

**Wan 2.2 Improvements over 2.1:**
- Enhanced temporal stability (less flickering between frames)
- Better text rendering within video (limited but improved)
- Improved motion dynamics for complex camera movements
- V2V pipeline for style transfer with motion preservation
- Better adherence to long, complex prompts

**Optimal Settings (14B T2V):**
```
Steps: 30-50
CFG Scale: 6.0-7.5
Scheduler: Euler (flow-match)
Sampler: euler_ancestral or dpmpp_2m
Resolution: 720x1280 (recommended default)
Frames: 81 (5 seconds at 16fps)
Seed: fixed for reproducibility
```

**Common Issues and Fixes:**
- Blurry output: Increase steps to 40+, ensure CFG is above 5.0
- Temporal flickering: Use temporal smoothing post-processing or lower CFG
- Color banding: Switch to FP16 from FP8, or increase VAE precision
- Prompt not followed: Use the T5-XXL encoder, not CLIP alone

---

### 1.2 HunyuanVideo (Tencent)

**Overview:**
HunyuanVideo is Tencent's open-source 13B-parameter video generation model with
strong support for LoRA training. It excels at cinematic quality output and has
native multi-GPU support for faster inference.

**Model Specifications:**

| Attribute | Value |
|-----------|-------|
| Parameters | 13B |
| Architecture | DiT (Diffusion Transformer) |
| Text Encoder | Bilingual CLIP + T5 |
| VAE | 3D Causal VAE (CausalVideoVAE) |
| Max Resolution | 1280x720 native |
| Max Duration | 5 seconds (129 frames at 24fps) |
| FPS | 24 fps native |
| Min VRAM | 24 GB (FP16), 16 GB (FP8) |

**Architecture Details:**
- Full-attention DiT blocks with 3D positional encoding
- Dual text encoder system (CLIP-L + MT5-XXL for bilingual support)
- CausalVideoVAE with 4x8x8 compression ratio
- Flash Attention 2 support for memory efficiency
- Native support for multi-GPU tensor parallelism (2x, 4x, 8x GPU)

**LoRA Training Support:**
HunyuanVideo has first-class LoRA support, making it excellent for character and
style customization.

Training parameters:
```
Rank: 32-128 (64 recommended)
Alpha: equal to rank or rank/2
Learning Rate: 1e-4 to 5e-4
Training Steps: 1000-3000
Batch Size: 1 (limited by VRAM)
Resolution: 512x512 or 256x256 for training
Training Data: 50-200 video clips (3-5 seconds each)
```

LoRA use cases:
- Character face consistency across shots
- Custom art style transfer
- Brand-specific visual identity
- Motion style (camera movement patterns)

**Multi-GPU Configuration:**
```
# 2-GPU setup
tensor_parallel_size: 2
pipeline_parallel_size: 1
# Speed improvement: ~1.7x

# 4-GPU setup
tensor_parallel_size: 4
pipeline_parallel_size: 1
# Speed improvement: ~3.2x

# 8-GPU setup
tensor_parallel_size: 4
pipeline_parallel_size: 2
# Speed improvement: ~5.5x
```

**Optimal Settings:**
```
Steps: 30-50
CFG Scale: 6.0-7.0
Scheduler: Flow-match Euler
Resolution: 1280x720 (default)
Frames: 129 (5.4 seconds at 24fps)
Guidance Embed: true
```

**Strengths:**
- Cinematic quality with natural motion
- Excellent at human faces and expressions
- Strong prompt adherence for detailed scenes
- Robust LoRA ecosystem growing rapidly
- Multi-GPU inference out of the box

**Limitations:**
- Higher VRAM requirements than Wan 5B
- Slower single-GPU inference than competitors
- Limited to 5-second clips natively
- Less community tooling than AnimateDiff ecosystem

---

### 1.3 CogVideoX-5B (Zhipu AI / THUDM)

**Overview:**
CogVideoX-5B is Zhipu AI's efficient video generation model, notable for its
excellent quality-to-compute ratio. It produces 768x1360 video at 16fps with
good temporal coherence in a relatively compact 5B parameter package.

**Model Specifications:**

| Attribute | Value |
|-----------|-------|
| Parameters | 5B |
| Architecture | 3D Full-Attention Transformer |
| Text Encoder | T5-XXL |
| VAE | 3D VAE (CogVideoX-VAE) |
| Native Resolution | 768x1360 |
| Max Duration | 10 seconds (160 frames at 16fps) |
| FPS | 16 fps |
| Min VRAM | 16 GB (FP16), 10 GB (INT8) |

**Architecture Details:**
- Expert Adaptive LayerNorm for conditional generation
- 3D full attention across spatial and temporal dimensions
- Progressive training strategy (low-res to high-res)
- RoPE (Rotary Position Embedding) for spatial-temporal awareness

**Key Differentiators:**
- 10-second generation at native resolution (longer than most competitors)
- 768x1360 portrait-first resolution (excellent for social media content)
- Efficient 5B architecture runs on consumer GPUs (RTX 3090/4090)
- T2V and I2V modes available
- INT8 quantization for further VRAM reduction

**Optimal Settings:**
```
Steps: 50
CFG Scale: 6.0
Scheduler: DDIM
Resolution: 768x1360 (portrait) or 1360x768 (landscape)
Frames: 49-160
FPS: 16
num_inference_steps: 50
guidance_scale: 6.0
```

**CogVideoX Variants:**
- CogVideoX-2B: Smaller, faster, lower quality
- CogVideoX-5B: Standard production model
- CogVideoX-5B-I2V: Image-to-video variant

**Best Use Cases:**
- Social media vertical video (TikTok, Reels, Shorts)
- Product demonstrations and showcases
- Animated illustrations and concept art
- Quick iteration and prototyping (fast inference)

---

### 1.4 LTX-2 (Lightricks)

**Overview:**
LTX-2 is Lightricks' next-generation video model, scaling from 2B to 13B
parameters. It features RTX hardware acceleration, native ComfyUI integration,
and support for up to 4K output resolution through its built-in upscaling stage.

**Model Specifications:**

| Attribute | Value |
|-----------|-------|
| Parameters | 2B - 13B (multiple tiers) |
| Architecture | DiT with Temporal Layers |
| Max Resolution | Up to 4K (via built-in upscaler) |
| Native Resolution | 512x512 to 1280x720 |
| Max Duration | 5 seconds |
| FPS | 24 fps |
| Min VRAM | 8 GB (2B), 24 GB (13B) |

**Model Tiers:**

| Tier | Parameters | Quality | Speed | VRAM |
|------|-----------|---------|-------|------|
| LTX-2B | 2B | Good | Very Fast | 8 GB |
| LTX-5B | 5B | Very Good | Fast | 12 GB |
| LTX-8B | 8B | Excellent | Moderate | 18 GB |
| LTX-13B | 13B | Production | Slower | 24 GB |

**RTX Acceleration:**
LTX-2 is optimized for NVIDIA RTX GPUs with dedicated TensorRT optimizations:
- RTX 4090: ~2x speedup with TensorRT compilation
- RTX 5090: ~3x speedup with FP8 native support
- First-inference compilation takes 5-10 minutes, cached afterwards
- TensorRT engines are GPU-architecture specific (not portable)

**Native ComfyUI Integration:**
LTX-2 ships with first-class ComfyUI node support:
- LTX2Loader: Model loading with precision selection
- LTX2Sampler: Sampling with all scheduler options
- LTX2Decoder: VAE decoding with temporal chunking
- LTX2Upscaler: Built-in 2x/4x upscaling node
- Full integration with ComfyUI's native conditioning system

**Optimal Settings (13B):**
```
Steps: 25-40
CFG Scale: 5.5-7.0
Scheduler: DPM++ 2M Karras
Resolution: 768x512 (then upscale)
Frames: 121 (5 seconds at 24fps)
TensorRT: enabled (after first compile)
```

**Strengths:**
- Fastest inference in its quality class (with TensorRT)
- Seamless ComfyUI workflow integration
- 4K output via built-in upscaler
- Multiple model sizes for different hardware
- Active development and rapid updates

---

### 1.5 AnimateDiff

**Overview:**
AnimateDiff is a motion module framework that adds temporal animation capabilities
to existing Stable Diffusion image models (SD1.5 and SDXL). It works by injecting
learned motion layers into the UNet, enabling any fine-tuned SD checkpoint to
produce animated output.

**Architecture:**
- Motion modules injected between existing SD UNet blocks
- Temporal attention layers with sliding window mechanism
- Compatible with SD1.5 (v2/v3 motion models) and SDXL (beta)
- Does not replace the base model; augments it with motion

**Motion Model Versions:**

| Version | Base | Quality | Context Length | Notes |
|---------|------|---------|---------------|-------|
| v2 | SD1.5 | Good | 16-24 frames | Stable, well-tested |
| v3 | SD1.5 | Better | 32 frames | Improved temporal coherence |
| SDXL-beta | SDXL | Experimental | 16 frames | Higher res, less stable |

**Sliding Window Mechanism:**
AnimateDiff uses a sliding window approach to generate videos longer than the
context length:

```
context_length: 16       # frames processed together
context_overlap: 4       # overlap between windows
context_stride: 1        # stride between windows
closed_loop: false       # set true for looping animations

# Total frames formula:
# total_frames = context_length + (num_windows - 1) * (context_length - context_overlap)
```

Example for 48 frames with context_length=16, overlap=4:
- Window 1: frames 0-15
- Window 2: frames 12-27
- Window 3: frames 24-39
- Window 4: frames 36-47 (padded)

**Key Parameters:**
```
motion_module: mm_sd15_v3.safetensors
context_length: 16 (default) or 24/32
context_overlap: 4-6
beta_schedule: sqrt_linear (recommended)
motion_scale: 1.0 (0.5 = less motion, 1.5 = more motion)
```

**Strengths:**
- Works with ANY SD1.5/SDXL checkpoint and LoRA
- Massive ecosystem of motion LoRAs (zoom, pan, rotate, etc.)
- Lightweight (motion module is ~1.5 GB)
- Excellent for stylized/artistic animation
- SparseCtrl for pose-guided animation
- ControlNet fully compatible

**Limitations:**
- Lower native resolution than dedicated video models
- Temporal coherence degrades beyond 48 frames
- SDXL support still experimental
- Not suitable for photorealistic long-form video
- Requires careful parameter tuning for smooth output

**Best Use Cases:**
- Animated illustrations and concept art
- Music video visuals with artistic styles
- Short social media animations
- ControlNet-guided character animation
- Style-specific animation (anime, watercolor, oil painting)

---

### 1.6 Flux (Black Forest Labs)

**Overview:**
Flux is Black Forest Labs' state-of-the-art image generation model, primarily
focused on still image generation but expanding into video territory. The Flux
architecture serves as a foundation for video extensions and frame-based
animation workflows.

**Model Variants:**

| Variant | Access | Quality | Speed | Notes |
|---------|--------|---------|-------|-------|
| Flux.1 [dev] | Open | Excellent | Moderate | Development/research |
| Flux.1 [schnell] | Open | Good | Very Fast | 4-step generation |
| Flux.1 [pro] | API | Best | Moderate | Commercial license |
| Flux.1 Fill | Open | Excellent | Moderate | Inpainting/outpainting |

**Video-Adjacent Capabilities:**
While Flux is primarily an image model, it integrates into video workflows:

1. **Keyframe Generation:** Use Flux to generate high-quality keyframes, then
   interpolate with GIMM-VFI or RIFE
2. **I2V Input:** Flux-generated images as input for Wan/Hunyuan I2V pipelines
3. **AnimateDiff (future):** Flux-compatible motion modules in development
4. **Frame-by-Frame:** Generate individual frames with ControlNet pose guidance,
   then assemble into video sequences
5. **Flux Video (upcoming):** Dedicated video model announced, expected to
   leverage the Flux architecture for native T2V

**Strengths for Video Workflows:**
- Highest quality keyframe generation available
- Excellent prompt adherence for consistent frames
- IP-Adapter and ControlNet support for character consistency
- Fast iteration with schnell variant (4 steps)
- Strong community and rapidly expanding ecosystem

---

## Section 2: Essential ComfyUI Nodes

### 2.1 Core Video Nodes

#### VideoHelperSuite
**Purpose:** Fundamental video I/O and manipulation nodes for ComfyUI.

**Key Nodes:**
- `VHS_LoadVideo`: Load video files (MP4, MOV, AVI, WebM)
- `VHS_VideoCombine`: Combine image sequences into video with audio
- `VHS_SplitVideo`: Split video into frames for processing
- `VHS_LoadImages`: Batch load image sequences from folders
- `VHS_SaveVideo`: Export with codec selection (H.264, H.265, VP9)
- `VHS_BatchManager`: Manage frame batches for processing

**Configuration:**
```
codec: h264 (compatibility) or h265 (quality/size)
crf: 18-23 (lower = higher quality, larger file)
fps: match source or target fps
audio_codec: aac (default)
pixel_format: yuv420p (compatibility) or yuv444p (quality)
```

**Installation:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite
pip install -r requirements.txt
```

#### AnimateDiff-Evolved
**Purpose:** Advanced AnimateDiff integration with full control over motion
generation parameters, sliding window, and context scheduling.

**Key Nodes:**
- `ADE_AnimateDiffLoaderGen1`: Load motion models (v2/v3)
- `ADE_AnimateDiffSamplerSettings`: Configure sampling behavior
- `ADE_AnimateDiffSettings`: Global motion settings
- `ADE_AdjustPEFullStretch`: Positional encoding adjustment
- `ADE_MultivalDynamic`: Dynamic multi-value conditioning
- `ADE_AnimateDiffCombine`: Combine animated output
- `ADE_UseEvolvedSampling`: Advanced sampling integration

**Context Schedule Options:**
- Uniform: Equal spacing between windows
- LoopedUniform: For seamless looping animations
- BatchedContext: Process multiple contexts simultaneously
- ViewAsContext: Use view-based context management

**Installation:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved
```

#### Advanced-ControlNet
**Purpose:** Extended ControlNet support with temporal awareness for video
generation, including per-frame control weight scheduling.

**Key Nodes:**
- `ACN_AdvancedControlNetApply`: Apply ControlNet with advanced options
- `ACN_SparseCtrlLoaderAdv`: Load SparseCtrl models for keyframe control
- `ACN_TimestepKeyframeGroup`: Create temporal keyframe schedules
- `ACN_ControlNetWeightSchedule`: Per-frame weight control
- `ACN_ReferenceControlNet`: Reference-based control

**Supported Control Types:**
- OpenPose (body, face, hands)
- Depth (MiDaS, Zoe, depth_anything)
- Canny edge detection
- Soft edge (HED, PiDi)
- Segmentation maps
- Normal maps
- Lineart (standard, anime, manga)
- SparseCtrl (keyframe interpolation)

---

### 2.2 Model-Specific Wrapper Nodes

#### WanVideoWrapper
**Purpose:** ComfyUI wrapper for Wan 2.1/2.2 video generation models.

**Key Nodes:**
- `WanVideoLoader`: Load Wan model with precision options
- `WanVideoSampler`: Sample video with Wan-specific parameters
- `WanVideoT2V`: Text-to-video generation
- `WanVideoI2V`: Image-to-video generation
- `WanVideoV2V`: Video-to-video style transfer (2.2 only)
- `WanVideoConditioner`: Advanced conditioning controls

**Configuration Notes:**
```
precision: fp16 (default) or fp8 (reduced VRAM)
text_encoder: t5_xxl + clip_l (both recommended)
vae_precision: fp32 (recommended for quality)
enable_teacache: true (speed boost, slight quality loss)
teacache_threshold: 0.15 (lower = better quality)
```

**Installation:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/kijai/ComfyUI-WanVideoWrapper
pip install -r requirements.txt
```

#### HunyuanVideoWrapper
**Purpose:** ComfyUI integration for Tencent's HunyuanVideo model.

**Key Nodes:**
- `HunyuanVideoLoader`: Load model with multi-GPU support
- `HunyuanVideoSampler`: Sample with Hunyuan-specific settings
- `HunyuanVideoT2V`: Text-to-video pipeline
- `HunyuanVideoI2V`: Image-to-video pipeline
- `HunyuanVideoLoRALoader`: Load trained LoRAs
- `HunyuanVideoTextEncoder`: Dual encoder conditioning

**Multi-GPU Setup in ComfyUI:**
```
# In the loader node:
device_map: auto          # Automatic GPU distribution
tensor_parallel: 2        # Number of GPUs for tensor parallelism
offload_to_cpu: false     # Keep model on GPU (faster)
low_vram_mode: false      # Disable if VRAM is sufficient
```

**Installation:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/kijai/ComfyUI-HunyuanVideoWrapper
pip install -r requirements.txt
# Requires flash-attn for optimal performance
pip install flash-attn --no-build-isolation
```

#### CogVideoXWrapper
**Purpose:** ComfyUI wrapper for CogVideoX series models.

**Key Nodes:**
- `CogVideoXLoader`: Load CogVideoX model
- `CogVideoXSampler`: Sample with CogVideoX parameters
- `CogVideoXT2V`: Text-to-video generation
- `CogVideoXI2V`: Image-to-video generation
- `CogVideoXTextEncoder`: T5-based text encoding

**Optimal Node Settings:**
```
model: CogVideoX-5B
steps: 50
cfg: 6.0
scheduler: DDIM
width: 1360
height: 768
num_frames: 49  # or 97, 145 (multiples of 48 + 1)
```

**Installation:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/kijai/ComfyUI-CogVideoXWrapper
pip install -r requirements.txt
```

---

### 2.3 Enhancement and Utility Nodes

#### IP-Adapter Plus
**Purpose:** Image Prompt Adapter for character and style consistency. Allows
using reference images as conditioning alongside text prompts.

**Key Nodes:**
- `IPAdapterApply`: Basic IP-Adapter application
- `IPAdapterApplyFaceID`: Face-specific adaptation
- `IPAdapterBatch`: Batch processing for multiple references
- `IPAdapterCombineEmbeds`: Combine multiple reference embeddings
- `IPAdapterEncoder`: Encode reference images
- `IPAdapterStyleComposition`: Style and content separation

**Available Models:**
- ip-adapter_sd15.safetensors (SD1.5 general)
- ip-adapter_sd15_plus.safetensors (SD1.5 enhanced)
- ip-adapter-faceid-plusv2_sd15.safetensors (SD1.5 FaceID)
- ip-adapter_sdxl.safetensors (SDXL general)
- ip-adapter-faceid-plusv2_sdxl.safetensors (SDXL FaceID)

**Installation:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus
# Download models to ComfyUI/models/ipadapter/
```

#### Steerable Motion
**Purpose:** Fine-grained control over camera and object motion in AnimateDiff
and video generation workflows.

**Key Nodes:**
- `SteerableMotion_Apply`: Apply motion control
- `SteerableMotion_CameraControl`: Pan, tilt, zoom, rotate
- `SteerableMotion_ObjectMotion`: Object-level motion control
- `SteerableMotion_BatchInterpolate`: Smooth motion interpolation

**Camera Motion Presets:**
- Pan Left/Right (speed: 0.1-2.0)
- Tilt Up/Down (speed: 0.1-2.0)
- Zoom In/Out (speed: 0.1-2.0)
- Rotate CW/CCW (speed: 0.1-2.0)
- Dolly In/Out (3D depth-aware)
- Custom path (keyframe-based)

#### GIMM-VFI (Generative Interpolation for Multi-frame Motion)
**Purpose:** AI-powered frame interpolation for increasing video frame rate
and creating smooth slow-motion effects.

**Key Nodes:**
- `GIMMVFI_Interpolate`: Interpolate between frames
- `GIMMVFI_BatchInterpolate`: Process entire video sequences
- `GIMMVFI_SlowMotion`: Create slow-motion effects

**Interpolation Modes:**
- 2x: Double frame rate (24fps -> 48fps)
- 4x: Quadruple frame rate (24fps -> 96fps)
- 8x: 8x interpolation (24fps -> 192fps, for extreme slow-mo)
- Custom: Specify exact target frame rate

**Quality vs RIFE Comparison:**
- GIMM-VFI: Better for complex motion, fewer artifacts on occlusion
- RIFE: Faster, good for simple motion, lower VRAM
- Recommendation: Use GIMM-VFI for final production, RIFE for previews

#### SeedVR2
**Purpose:** AI video upscaling model for production-quality enhancement
from generated video resolution to 1080p or 4K output.

**Key Nodes:**
- `SeedVR2_Upscale`: Upscale video with AI enhancement
- `SeedVR2_Loader`: Load SeedVR2 model with precision options
- `SeedVR2_BatchProcess`: Process entire video batches

**Upscaling Options:**
- 2x: 720p to 1440p or 540p to 1080p
- 4x: 480p to 1920p (4K-adjacent)
- Custom scale: Arbitrary scale factors

**Configuration:**
```
model: SeedVR2_x2 or SeedVR2_x4
tile_size: 512 (reduce if VRAM limited)
tile_overlap: 64
temporal_window: 8 (frames processed together)
denoise_strength: 0.3-0.5 (higher = more enhancement, risk of artifacts)
```

#### TopazVideoAI (External Integration)
**Purpose:** Professional video enhancement suite for upscaling, denoising,
frame interpolation, and stabilization. Runs as external process.

**Integration Methods:**
1. ComfyUI node (community): Calls Topaz CLI from within workflow
2. Post-processing: Export from ComfyUI, process in Topaz, reimport
3. Batch script: Automate Topaz processing via command line

**Key Models in Topaz:**
- Proteus (v5): General purpose upscaling/enhancement
- Artemis (v4): Animation and CGI optimized
- Gaia (v3): High-quality photographic upscaling
- Chronos (v3): Frame interpolation
- Nyx (v3): Low-light and noise reduction

**CLI Example:**
```bash
ffmpeg -i input.mp4 -c:v png output_frames/%04d.png
tvai --model proteus-v5 --scale 2 --input output_frames/ --output enhanced/
ffmpeg -framerate 24 -i enhanced/%04d.png -c:v libx264 -crf 18 output.mp4
```

---

## Section 3: Pipeline Architectures

### 3.1 Text-to-Video (T2V) Pipeline

**Standard T2V Flow:**
```
[Text Prompt]
    |
    v
[Text Encoder] (T5-XXL + CLIP-L)
    |
    v
[Diffusion Model] (Wan/Hunyuan/CogVideoX/LTX)
    |  - Steps: 30-50
    |  - CFG: 5.5-7.5
    |  - Scheduler: Euler/DPM++/DDIM
    v
[VAE Decoder] (Model-specific 3D VAE)
    |
    v
[Raw Video] (Native resolution, 16-24fps)
    |
    v
[Frame Interpolation] (GIMM-VFI 2x-4x)
    |
    v
[Upscaling] (SeedVR2 2x)
    |
    v
[Final Video] (1080p/4K, 48-60fps)
```

**Prompt Structure for T2V:**
```
[Scene Description]. [Subject Description]. [Action Description].
[Camera Movement]. [Lighting]. [Style/Mood]. [Technical Specs].

Example:
"A young woman with red hair walks through a neon-lit Tokyo street at night.
She wears a black leather jacket and looks up at the glowing signs.
Slow tracking shot following from behind. Cinematic lighting with
blue and pink neon reflections. Cyberpunk aesthetic, photorealistic,
8K quality, shallow depth of field."
```

### 3.2 Image-to-Video (I2V) Pipeline

**Standard I2V Flow:**
```
[Reference Image] + [Text Prompt]
    |                    |
    v                    v
[Image Encoder]    [Text Encoder]
    |                    |
    +--------+-----------+
             |
             v
    [Diffusion Model] (I2V variant)
             |
             v
    [VAE Decoder]
             |
             v
    [Raw Video] (Image comes alive)
             |
             v
    [Enhancement Pipeline]
             |
             v
    [Final Video]
```

**I2V Best Practices:**
- Input image should be high quality (at least 1024px on longest side)
- Match aspect ratio of input image to target video resolution
- Keep prompt consistent with image content (do not contradict the image)
- Use motion descriptions: "slowly turns head", "wind blows hair"
- Specify what should NOT move: "static background, only face moves"
- CFG scale often lower for I2V (4.0-6.0) to preserve image details

**I2V Model Recommendations by Use Case:**

| Use Case | Recommended Model | Reason |
|----------|------------------|--------|
| Product showcase | Wan 2.1 14B I2V | Best detail preservation |
| Character animation | HunyuanVideo I2V | Natural human motion |
| Artistic animation | AnimateDiff + SD1.5 | Style preservation |
| Quick prototype | LTX-2 2B | Fastest inference |

### 3.3 Video-to-Video (V2V) Style Transfer Pipeline

**V2V Flow:**
```
[Source Video] + [Style Reference] + [Text Prompt]
    |                |                    |
    v                v                    v
[Frame Extract]  [Style Encode]    [Text Encode]
    |                |                    |
    v                v                    v
[ControlNet]    [IP-Adapter]       [Conditioning]
    |                |                    |
    +--------+-------+--------------------+
             |
             v
    [Diffusion Model] (V2V mode)
         |  - denoise_strength: 0.4-0.7
         v
    [VAE Decoder]
         |
         v
    [Styled Video]
         |
         v
    [Temporal Smoothing]
         |
         v
    [Final Video]
```

**Denoise Strength Guide:**
- 0.3-0.4: Subtle style adjustment, preserves most source detail
- 0.5-0.6: Moderate style transfer, good balance
- 0.7-0.8: Strong style transfer, source used mainly for motion/structure
- 0.9-1.0: Almost full regeneration, only motion preserved

**ControlNet Combinations for V2V:**
- Depth + OpenPose: Best for character-focused style transfer
- Canny + Depth: Best for architectural/scene style transfer
- SoftEdge + IP-Adapter: Best for artistic style transfer
- Lineart + Color: Best for anime/illustration style transfer

### 3.4 Multi-Shot Composition with Character Consistency

**Multi-Shot Pipeline:**
```
[Character Design Phase]
    |
    v
[Generate Reference Sheet] (6-10 angles, Flux/SD)
    |
    v
[Extract Face Embeddings] (InsightFace)
    |
    v
[Create IP-Adapter FaceID Embeds]
    |
    v
[Per-Shot Generation]
    |-- Shot 1: [FaceID + Prompt + ControlNet] -> Video
    |-- Shot 2: [FaceID + Prompt + ControlNet] -> Video
    |-- Shot 3: [FaceID + Prompt + ControlNet] -> Video
    |-- ...
    v
[Consistency Review]
    |  - Check face similarity across shots
    |  - Check clothing/style consistency
    |  - Check lighting continuity
    v
[Enhancement Pipeline] (per shot)
    |
    v
[Audio Integration]
    |
    v
[Final Assembly] (NLE or ffmpeg)
```

---

## Section 4: Character Consistency

### 4.1 IP-Adapter FaceID Plus V2

**Overview:**
IP-Adapter FaceID Plus V2 is the primary tool for maintaining character face
consistency across multiple video shots. It combines InsightFace face detection
with IP-Adapter image prompting to lock in facial features.

**Setup Requirements:**
1. IP-Adapter Plus custom nodes installed
2. InsightFace model (antelopev2 or buffalo_l)
3. FaceID Plus V2 model file
4. CLIP Vision model (ViT-H or ViT-G)

**Model Downloads:**
```
# IP-Adapter FaceID models -> ComfyUI/models/ipadapter/
ip-adapter-faceid-plusv2_sd15.safetensors
ip-adapter-faceid-plusv2_sdxl.safetensors

# CLIP Vision models -> ComfyUI/models/clip_vision/
CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors
CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors

# InsightFace models -> ComfyUI/models/insightface/models/
antelopev2/  (recommended)
buffalo_l/   (alternative)
```

**Node Configuration:**
```
# IPAdapterApplyFaceID node:
weight: 0.7-0.85 (face strength)
weight_type: style transfer
combine_embeds: norm average
start_at: 0.0
end_at: 1.0
unfold_batch: true

# InsightFace node:
provider: CUDA (GPU) or CPU
model: antelopev2
```

**Weight Tuning Guide:**
- 0.5-0.6: Light resemblance, more prompt flexibility
- 0.7-0.8: Strong resemblance, good prompt/face balance (recommended)
- 0.85-0.95: Very strong face lock, may override prompt details
- 1.0: Maximum face adherence, prompt has minimal influence on face

### 4.2 Reference Image Protocol

**Generating a Character Reference Sheet:**

A proper reference sheet contains 6-10 images of the character from different
angles and with different expressions. This ensures the FaceID embedding captures
the full range of the character's appearance.

**Required Angles (minimum 6):**
1. Front view (neutral expression)
2. 3/4 left view (slight smile)
3. 3/4 right view (slight smile)
4. Left profile
5. Right profile
6. Front view (different expression - serious/happy)

**Recommended Additional Angles (up to 10):**
7. Slight upward angle (chin up)
8. Slight downward angle (chin down)
9. Front view with different lighting
10. Action pose (relevant to video content)

**Image Specifications:**
- Resolution: 512x512 minimum, 1024x1024 recommended
- Format: PNG (lossless) preferred
- Background: Neutral/solid color for best face detection
- Lighting: Even, no harsh shadows on face
- Face size: At least 256x256 pixels within the frame

**Generating References with Flux/SD:**
```
Prompt template:
"Portrait photo of [character description], [angle],
[expression], [lighting], studio photography,
white background, high resolution, sharp focus"

Use same seed + similar prompt structure for consistency.
ControlNet openpose can help maintain consistent poses.
```

### 4.3 InsightFace Requirements

**InsightFace** is the face detection and recognition library required by
IP-Adapter FaceID for extracting face embeddings.

**Installation:**
```bash
pip install insightface
pip install onnxruntime-gpu  # For GPU acceleration

# If build fails:
pip install insightface --no-build-isolation
# Or use pre-built wheels from:
# https://github.com/Gourieff/Assets/tree/main/Insightface
```

**Model Setup:**
```bash
# Models should be placed in:
# ComfyUI/models/insightface/models/antelopev2/

# Required files for antelopev2:
1det_10g.onnx         # Face detection
2d106det.onnx         # 2D landmark detection
genderage.onnx        # Gender and age estimation
glintr100.onnx        # Face recognition (embedding)
scrfd_10g_bnkps.onnx  # Face detection (alternative)
```

**Troubleshooting:**
- "No face detected": Ensure face is clearly visible, well-lit, front-facing
- CUDA out of memory: Use CPU provider for InsightFace (it's fast enough)
- Model not found: Check path matches exactly (case-sensitive on Linux)
- Multiple faces: Use face index parameter to select specific face

### 4.4 Combine Methods

When using multiple reference images, IP-Adapter offers several methods to
combine their embeddings:

**Concat (Concatenation):**
- Stacks all embeddings and processes them together
- Preserves unique features from each reference
- Higher memory usage (scales linearly with references)
- Best for: 2-3 references with distinct features to preserve

**Average:**
- Simple arithmetic mean of all embeddings
- Smooths out variations between references
- Consistent memory usage regardless of reference count
- Best for: Many references (6+) where you want a "mean" face

**Norm Average (Normalized Average):**
- Averages embeddings then normalizes to unit length
- Maintains embedding magnitude consistency
- Prevents any single reference from dominating
- Best for: Production use, most consistent results (RECOMMENDED)

**Comparison:**
```
Quality Ranking:  Norm Average > Average > Concat
Memory Usage:     Concat > Average = Norm Average
Consistency:      Norm Average > Average > Concat
Speed:            Average = Norm Average > Concat
```

---

## Section 5: Upscaling and Enhancement

### 5.1 SeedVR2 for Production 1080p/4K

**Overview:**
SeedVR2 is a video-aware upscaling model that understands temporal coherence,
producing consistent upscaled frames without the flickering common in
per-frame image upscalers.

**Workflow Integration:**
```
[Generated Video] (480p-720p, 16-24fps)
    |
    v
[SeedVR2 Upscaler] (2x or 4x)
    |  - tile_size: 512
    |  - temporal_window: 8
    |  - denoise_strength: 0.35
    v
[Upscaled Video] (1080p-4K, same fps)
```

**Quality Settings by Target:**

| Target | Scale | Tile Size | Denoise | Quality |
|--------|-------|-----------|---------|---------|
| 1080p (from 540p) | 2x | 512 | 0.3 | High |
| 1080p (from 720p) | 1.5x | 640 | 0.25 | Very High |
| 4K (from 720p) | ~3x | 512 | 0.35 | High |
| 4K (from 1080p) | 2x | 512 | 0.3 | Very High |

**Tips for Best Results:**
- Always upscale AFTER frame interpolation (upscaling fewer frames is faster)
- Use temporal_window of 8+ for smooth temporal transitions
- Lower denoise_strength preserves more original detail
- Higher denoise_strength adds sharpness but may introduce artifacts
- Process in batches to manage VRAM (batch_size: 4-8 frames)

### 5.2 GIMM-VFI for Frame Interpolation

**Overview:**
GIMM-VFI produces temporally consistent intermediate frames using a generative
model that understands complex motion, occlusion, and deformation.

**Standard Interpolation Workflow:**
```
[16fps Video]
    |
    v
[GIMM-VFI 2x] -> [32fps Video]
    |
    v
[GIMM-VFI 2x] -> [64fps Video] (optional, for 60fps target)
    |
    v
[Final fps adjustment] (64fps -> 60fps or 48fps)
```

**Model Comparison:**

| Model | Quality | Speed | VRAM | Best For |
|-------|---------|-------|------|----------|
| GIMM-VFI | Excellent | Slow | 8 GB | Production, complex motion |
| RIFE v4.6 | Very Good | Very Fast | 2 GB | Preview, simple motion |
| FILM | Good | Fast | 4 GB | Natural video, photography |
| AMT | Good | Moderate | 6 GB | Anime, illustration |

### 5.3 Topaz Video AI Integration

**CLI Automation Script:**
```bash
#!/bin/bash
# topaz_enhance.sh - Automate Topaz Video AI processing

INPUT="$1"
OUTPUT="$2"
MODEL="${3:-proteus-v5}"
SCALE="${4:-2}"

tvai_cli \
  --input "$INPUT" \
  --output "$OUTPUT" \
  --model "$MODEL" \
  --scale "$SCALE" \
  --format mp4 \
  --codec h265 \
  --quality 95 \
  --grain 0 \
  --blur 0 \
  --compression 0
```

**Recommended Topaz Settings for AI Video:**

| Artifact Type | Model | Settings |
|--------------|-------|----------|
| General upscale | Proteus v5 | scale:2, denoise:20, sharpen:30 |
| Anime/cartoon | Artemis v4 | scale:2, denoise:10, sharpen:20 |
| Heavy artifacts | Proteus v5 | scale:1, denoise:40, deblock:30 |
| Frame interp | Chronos v3 | fps:60, sensitivity:50 |

### 5.4 Dual-Stage Enhancement Pipeline

**Recommended Production Pipeline:**
```
[Raw AI Video] (720x1280, 16fps)
    |
    |-- Stage 1: Frame Interpolation
    |   [GIMM-VFI 2x] -> 32fps
    |   [GIMM-VFI 2x] -> 64fps (if targeting 60fps)
    |
    |-- Stage 2: Upscaling
    |   [SeedVR2 2x] -> 1440x2560 (2K)
    |   OR
    |   [SeedVR2 + Topaz] -> 2160x3840 (4K)
    |
    v
[Final Video] (2K/4K, 48-60fps)
```

**Why This Order Matters:**
1. Interpolation first means fewer frames to upscale (cost savings)
2. Upscaling interpolated frames is less likely to amplify artifacts
3. Temporal coherence is maintained through the interpolation step
4. Upscaling adds detail that would be lost if done before interpolation

**Performance Estimates (RTX 4090):**

| Stage | Input | Output | Time |
|-------|-------|--------|------|
| GIMM-VFI 2x | 5s@16fps (80 frames) | 5s@32fps (160 frames) | ~2 min |
| GIMM-VFI 2x | 5s@32fps (160 frames) | 5s@64fps (320 frames) | ~4 min |
| SeedVR2 2x | 320 frames @ 720p | 320 frames @ 1440p | ~8 min |
| Total | 5s clip | 2K@64fps | ~14 min |

---

## Section 6: Audio Integration

### 6.1 ElevenLabs

**Overview:**
ElevenLabs is the leading AI voice and audio platform, offering 10,000+ voices
with industry-leading naturalness. Their expanding product suite now includes
video-to-SFX and text-to-SFX capabilities.

**Product Suite:**

| Product | Description | API Endpoint |
|---------|-------------|-------------|
| Text-to-Speech | 10K+ voices, 32 languages | /v1/text-to-speech |
| Voice Cloning | Clone any voice (5+ min audio) | /v1/voice-clone |
| Speech-to-Speech | Voice conversion | /v1/speech-to-speech |
| Video-to-SFX | Generate sound effects from video | /v1/video-to-sfx |
| Text-to-SFX | Generate SFX from descriptions | /v1/text-to-sfx |
| Audio Isolation | Separate voice from background | /v1/audio-isolation |
| Dubbing | Automated video dubbing | /v1/dubbing |

**Voice Selection Guide:**
- Narration: "Adam", "Rachel", "Antoni" (stable, professional)
- Character dialogue: Use Voice Design to create unique voices
- Multilingual: "Eleven Multilingual v2" model (32 languages)
- Emotional range: "Eleven Turbo v2.5" (fastest, good emotion)

**API Usage Example:**
```python
from elevenlabs import ElevenLabs

client = ElevenLabs(api_key="your_key")

audio = client.text_to_speech.convert(
    voice_id="pNInz6obpgDQGcFmaJgB",  # Adam
    text="Welcome to our product showcase.",
    model_id="eleven_multilingual_v2",
    voice_settings={
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.5,
        "use_speaker_boost": True
    }
)
```

**Video-to-SFX Workflow:**
1. Export video clip (MP4, max 30 seconds)
2. Upload to Video-to-SFX API endpoint
3. AI analyzes visual content and generates matching sound effects
4. Download generated SFX and layer in NLE/ffmpeg

**Text-to-SFX Examples:**
```
"Gentle rain on a window with distant thunder"
"Futuristic spaceship engine humming"
"Busy cafe ambience with coffee machine and chatter"
"Sword being drawn from a metal sheath"
```

### 6.2 Suno

**Overview:**
Suno generates complete songs with vocals, instrumentals, and arrangement from
text descriptions or lyrics. Ideal for background music, theme songs, and
musical content.

**Key Capabilities:**
- Full songs with vocals (up to 4 minutes)
- Custom lyrics support
- Genre-specific generation (pop, rock, electronic, classical, etc.)
- Instrumental-only option
- Style tags for fine control
- Extend/continue existing generations

**Prompt Structure:**
```
[Style Tags] [Genre] [Mood] [Instrumentation]

Example:
"Cinematic orchestral, epic, building intensity, strings and brass,
dramatic percussion, film score style"

With lyrics:
"[Verse 1]
Walking through the neon lights
City sleeps but I'm alive
[Chorus]
We are the future, we are the flame
Nothing will ever be the same"
```

**Best Use Cases for Video:**
- Background music for short-form content
- Theme songs for series/channels
- Musical sequences in animations
- Jingles and brand audio

### 6.3 Udio

**Overview:**
Udio specializes in instrumental music generation with fine-grained control over
arrangement, instrumentation, and musical structure. Excellent for underscoring
video content.

**Key Capabilities:**
- High-quality instrumentals (up to 15 minutes with extend)
- Genre precision (sub-genre level control)
- BPM and key specification
- Section control (intro, verse, chorus, bridge, outro)
- Stem separation (drums, bass, melody, other)
- Remix/variation generation

**Prompt Structure:**
```
[Genre/Sub-genre], [BPM], [Key], [Mood], [Instruments]

Example:
"Lo-fi hip hop, 85 BPM, C minor, relaxed and nostalgic,
dusty vinyl piano, soft drums, ambient pads, warm bass"

Example (cinematic):
"Cinematic ambient, 60 BPM, D minor, mysterious and tense,
ethereal synth pads, deep sub bass, sparse piano notes,
atmospheric textures"
```

**Audio-Video Sync Workflow:**
1. Determine video duration and pacing
2. Set BPM to match edit rhythm (cuts per beat)
3. Generate music with appropriate duration
4. Use stem separation for mixing flexibility
5. Layer with SFX from ElevenLabs
6. Final mix in audio editor or ffmpeg

### 6.4 Audio Mixing with ffmpeg

**Basic Audio-Video Combination:**
```bash
# Add single audio track to video
ffmpeg -i video.mp4 -i audio.mp3 \
  -c:v copy -c:a aac -b:a 192k \
  -shortest output.mp4

# Mix multiple audio tracks
ffmpeg -i video.mp4 \
  -i voice.mp3 \
  -i music.mp3 \
  -i sfx.mp3 \
  -filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.3[music];[3:a]volume=0.6[sfx];[voice][music][sfx]amix=inputs=3:duration=first[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 256k \
  output.mp4
```

**Volume Balance Guidelines:**
- Voice/Narration: 0 dB (reference level)
- Background Music: -12 to -18 dB
- Sound Effects: -6 to -12 dB
- Ambient/Foley: -18 to -24 dB

---

## Section 7: Best Practices

### 7.1 Prompt Engineering Tips per Model

**Wan 2.1/2.2:**
- Front-load the subject and action
- Include camera movement explicitly ("slow dolly in", "tracking shot")
- Specify lighting ("golden hour", "neon-lit", "high key")
- Use quality boosters: "cinematic, 8K, photorealistic, masterpiece"
- Negative prompt: "blurry, distorted, low quality, watermark, text"
- Wan responds well to detailed scene descriptions (3-5 sentences)

**HunyuanVideo:**
- Supports both English and Chinese prompts
- Excellent at following detailed human action descriptions
- Specify clothing and accessories for consistency
- Include environment details for scene grounding
- Responds well to emotional/mood descriptors
- Keep prompts under 200 tokens for best results

**CogVideoX:**
- Concise prompts work better (1-2 sentences)
- Focus on single clear action per generation
- Resolution-aware: mention "vertical video" for portrait mode
- Good at abstract and artistic descriptions
- Works well with style keywords (anime, watercolor, oil painting)

**LTX-2:**
- Follows ComfyUI-native prompt syntax
- Supports prompt weighting: (important:1.3), (less important:0.7)
- Separate positive and negative prompts
- Responds well to technical photography terms
- Shorter prompts (1-3 sentences) often outperform verbose ones

**AnimateDiff:**
- Inherits prompt style from base SD checkpoint
- Add motion descriptors: "walking", "flowing", "spinning"
- Use motion LoRAs for camera control
- Prompt per-frame scheduling for complex sequences
- Works with standard SD prompt weighting

### 7.2 VRAM Optimization Strategies

**General Strategies:**
1. **Model Offloading:** Move unused model components to CPU/RAM
2. **FP8 Quantization:** 40% VRAM reduction with minimal quality loss
3. **Tiled VAE Decoding:** Process VAE in tiles to reduce peak VRAM
4. **Attention Slicing:** Trade speed for memory in attention layers
5. **Sequential CPU Offload:** Offload each layer after computation
6. **TeaCache:** Cache and reuse intermediate computations (Wan specific)

**VRAM Budget by GPU:**

| GPU | VRAM | Recommended Models |
|-----|------|--------------------|
| RTX 3060 12GB | 12 GB | Wan 5B (FP8), CogVideoX-5B (INT8), AnimateDiff |
| RTX 3090 24GB | 24 GB | Wan 14B (FP8), HunyuanVideo, CogVideoX-5B, LTX-13B |
| RTX 4090 24GB | 24 GB | All models, fastest inference |
| RTX 5090 32GB | 32 GB | All models, full precision, multi-model |
| A100 40GB | 40 GB | All models, production server |
| A100 80GB | 80 GB | Multi-model serving, batch processing |

**ComfyUI VRAM Settings:**
```
# Launch flags for memory management:
--lowvram          # Aggressive offloading (slowest, least VRAM)
--normalvram       # Standard offloading
--highvram         # Keep everything on GPU (fastest, most VRAM)
--gpu-only         # Force all operations on GPU
--fp8_e4m3fn       # FP8 quantization (Wan, Hunyuan)
--fp8_e5m2         # FP8 alternative format
```

### 7.3 Quality Checklist per Shot

**Before Generation:**
- [ ] Prompt reviewed and spell-checked
- [ ] Model selected appropriate for content type
- [ ] Resolution matches target aspect ratio
- [ ] Duration sufficient for intended action
- [ ] Reference images prepared (if using I2V or FaceID)
- [ ] Seed documented for reproducibility

**After Generation:**
- [ ] Subject matches prompt description
- [ ] Motion is natural and smooth
- [ ] No temporal flickering or jitter
- [ ] No morphing artifacts on faces/hands
- [ ] Background is stable (no swimming/warping)
- [ ] Colors are consistent throughout clip
- [ ] No watermarks or text artifacts

**After Enhancement:**
- [ ] Upscaling preserved important details
- [ ] Frame interpolation is smooth (no ghosting)
- [ ] No new artifacts introduced by enhancement
- [ ] Final resolution meets target specification
- [ ] File size is within delivery requirements

### 7.4 Common Artifacts and Fixes

**Temporal Flickering:**
- Cause: Inconsistent denoising between frames
- Fix: Increase steps, use temporal smoothing, lower CFG
- Prevention: Use models with strong temporal attention (Wan 2.2, Hunyuan)

**Face Morphing / Melting:**
- Cause: Model uncertainty about face details
- Fix: Use FaceID for consistency, generate at higher resolution
- Prevention: Clear face description in prompt, reference images

**Hand Deformities:**
- Cause: Training data limitations for complex hand poses
- Fix: Regenerate with ControlNet hand pose guidance
- Prevention: Use hand-focused ControlNet, avoid complex hand interactions

**Background Swimming / Warping:**
- Cause: Lack of scene anchoring in the model
- Fix: Use depth ControlNet, add "static background" to prompt
- Prevention: Include environment anchors in prompt ("brick wall", "wooden table")

**Color Banding:**
- Cause: Low precision VAE decoding, compression
- Fix: Use FP32 VAE, increase output bitrate
- Prevention: Always decode VAE at FP32, use CRF 18 or lower for export

**Motion Blur Artifacts:**
- Cause: Frame interpolation on fast motion
- Fix: Lower interpolation factor, use GIMM-VFI instead of RIFE
- Prevention: Generate at higher FPS natively, reduce motion speed in prompt

**Prompt Bleed / Style Drift:**
- Cause: Long prompts causing token competition
- Fix: Simplify prompt, use prompt weighting
- Prevention: Front-load important elements, keep prompts focused

**Audio-Video Desync:**
- Cause: Frame rate mismatch after processing
- Fix: Re-encode with correct fps metadata
- Prevention: Maintain consistent fps through pipeline, use -r flag in ffmpeg

---

## Appendix A: Model Download Links and Checksums

**Wan 2.1 Models:**
```
# Hugging Face:
https://huggingface.co/Wan-AI/Wan2.1-T2V-14B
https://huggingface.co/Wan-AI/Wan2.1-T2V-5B
https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B
https://huggingface.co/Wan-AI/Wan2.1-I2V-14B
```

**HunyuanVideo:**
```
https://huggingface.co/tencent/HunyuanVideo
```

**CogVideoX:**
```
https://huggingface.co/THUDM/CogVideoX-5b
https://huggingface.co/THUDM/CogVideoX-5b-I2V
```

**LTX-2:**
```
https://huggingface.co/Lightricks/LTX-Video
```

## Appendix B: Hardware Recommendations

**Minimum Production Setup:**
- GPU: NVIDIA RTX 4090 (24 GB VRAM)
- RAM: 64 GB DDR5
- Storage: 2 TB NVMe SSD (models alone need ~200 GB)
- CPU: AMD Ryzen 9 / Intel i9 (12+ cores)

**Recommended Production Setup:**
- GPU: 2x NVIDIA RTX 4090 or 1x A100 80GB
- RAM: 128 GB DDR5
- Storage: 4 TB NVMe SSD + 8 TB HDD for output
- CPU: AMD Threadripper / Intel Xeon (24+ cores)

**Cloud Alternatives:**
- RunPod: A100 80GB instances (~$2.50/hr)
- Lambda Labs: H100 instances (~$3.00/hr)
- Vast.ai: Community GPUs (variable pricing)
- ComfyUI cloud: Managed ComfyUI instances

## Appendix C: Glossary

| Term | Definition |
|------|-----------|
| T2V | Text-to-Video generation |
| I2V | Image-to-Video generation |
| V2V | Video-to-Video style transfer |
| DiT | Diffusion Transformer architecture |
| MoE | Mixture of Experts (selective computation) |
| VAE | Variational Autoencoder (latent space codec) |
| CFG | Classifier-Free Guidance (prompt adherence control) |
| LoRA | Low-Rank Adaptation (efficient fine-tuning) |
| FPS | Frames Per Second |
| CRF | Constant Rate Factor (video quality/compression) |
| NLE | Non-Linear Editor (Premiere, DaVinci, etc.) |
| FP8 | 8-bit floating point (reduced precision) |
| FP16 | 16-bit floating point (half precision) |
| FP32 | 32-bit floating point (full precision) |
| VRAM | Video Random Access Memory (GPU memory) |
| SFX | Sound Effects |
