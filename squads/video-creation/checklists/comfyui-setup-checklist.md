# ComfyUI Setup Checklist

> Verification checklist for setting up ComfyUI with all required custom nodes,
> models, and dependencies for the Video Creation Squad pipeline.

---

## 1. ComfyUI Core Installation

### Base Installation
- [ ] Python 3.10 or 3.11 installed (3.12+ may have compatibility issues)
- [ ] Git installed and accessible from command line
- [ ] NVIDIA GPU drivers updated to latest stable version
- [ ] CUDA Toolkit installed (12.1+ recommended)
- [ ] cuDNN installed and paths configured

### ComfyUI Setup
- [ ] ComfyUI cloned from official repository
  ```bash
  git clone https://github.com/comfyanonymous/ComfyUI.git
  ```
- [ ] Python virtual environment created and activated
  ```bash
  python -m venv venv
  source venv/bin/activate  # Linux/Mac
  venv\Scripts\activate     # Windows
  ```
- [ ] Requirements installed
  ```bash
  pip install -r requirements.txt
  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
  ```
- [ ] ComfyUI launches successfully
  ```bash
  python main.py
  ```
- [ ] Web UI accessible at http://127.0.0.1:8188
- [ ] GPU detected (check terminal output on startup)
- [ ] Test workflow runs successfully (load default workflow, queue prompt)

### ComfyUI Manager
- [ ] ComfyUI Manager installed
  ```bash
  cd ComfyUI/custom_nodes
  git clone https://github.com/ltdrdata/ComfyUI-Manager.git
  ```
- [ ] Manager accessible from UI menu
- [ ] "Install Missing Nodes" feature tested and working

---

## 2. Custom Nodes Installation

### Core Video Nodes (Required)

- [ ] **VideoHelperSuite**
  ```bash
  cd ComfyUI/custom_nodes
  git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite
  pip install -r ComfyUI-VideoHelperSuite/requirements.txt
  ```
  - [ ] VHS_LoadVideo node available
  - [ ] VHS_VideoCombine node available
  - [ ] ffmpeg accessible from system PATH

- [ ] **AnimateDiff-Evolved**
  ```bash
  git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved
  ```
  - [ ] ADE_AnimateDiffLoaderGen1 node available
  - [ ] ADE_UseEvolvedSampling node available

- [ ] **Advanced-ControlNet**
  ```bash
  git clone https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet
  ```
  - [ ] ACN_AdvancedControlNetApply node available
  - [ ] ACN_SparseCtrlLoaderAdv node available

### Model-Specific Wrappers (Required)

- [ ] **WanVideoWrapper**
  ```bash
  git clone https://github.com/kijai/ComfyUI-WanVideoWrapper
  pip install -r ComfyUI-WanVideoWrapper/requirements.txt
  ```
  - [ ] WanVideoLoader node available
  - [ ] WanVideoSampler node available
  - [ ] WanVideoT2V node available
  - [ ] WanVideoI2V node available

- [ ] **HunyuanVideoWrapper**
  ```bash
  git clone https://github.com/kijai/ComfyUI-HunyuanVideoWrapper
  pip install -r ComfyUI-HunyuanVideoWrapper/requirements.txt
  ```
  - [ ] HunyuanVideoLoader node available
  - [ ] HunyuanVideoSampler node available
  - [ ] flash-attn installed (optional but recommended)
    ```bash
    pip install flash-attn --no-build-isolation
    ```

- [ ] **CogVideoXWrapper**
  ```bash
  git clone https://github.com/kijai/ComfyUI-CogVideoXWrapper
  pip install -r ComfyUI-CogVideoXWrapper/requirements.txt
  ```
  - [ ] CogVideoXLoader node available
  - [ ] CogVideoXSampler node available

### Enhancement Nodes (Required)

- [ ] **IP-Adapter Plus**
  ```bash
  git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus
  ```
  - [ ] IPAdapterApply node available
  - [ ] IPAdapterApplyFaceID node available
  - [ ] IPAdapterCombineEmbeds node available

- [ ] **GIMM-VFI (Frame Interpolation)**
  ```bash
  git clone https://github.com/kijai/ComfyUI-GIMM-VFI
  pip install -r ComfyUI-GIMM-VFI/requirements.txt
  ```
  - [ ] GIMMVFI_Interpolate node available

### Utility Nodes (Recommended)

- [ ] **Steerable Motion**
  ```bash
  git clone https://github.com/banodoco/Steerable-Motion
  pip install -r Steerable-Motion/requirements.txt
  ```
  - [ ] SteerableMotion_CameraControl node available

- [ ] **ComfyUI KJNodes**
  ```bash
  git clone https://github.com/kijai/ComfyUI-KJNodes
  ```
  - [ ] Utility nodes available (GetImageSize, ConditioningSetArea, etc.)

- [ ] **ComfyUI Impact Pack**
  ```bash
  git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack
  pip install -r ComfyUI-Impact-Pack/requirements.txt
  ```
  - [ ] Face detection and segmentation nodes available

- [ ] **ComfyUI WD14 Tagger**
  ```bash
  git clone https://github.com/pythongosssss/ComfyUI-WD14-Tagger
  ```
  - [ ] Image tagging node available (useful for prompt engineering)

---

## 3. Model Downloads

### Text Encoders

- [ ] **T5-XXL** (Required for Wan, CogVideoX, Hunyuan)
  ```
  Path: ComfyUI/models/text_encoders/t5xxl_fp16.safetensors
  Size: ~9.5 GB (FP16) or ~4.8 GB (FP8)
  Source: https://huggingface.co/comfyanonymous/flux_text_encoders
  ```

- [ ] **CLIP-L** (Required for Wan, Flux)
  ```
  Path: ComfyUI/models/text_encoders/clip_l.safetensors
  Size: ~246 MB
  Source: https://huggingface.co/comfyanonymous/flux_text_encoders
  ```

### Video Generation Models

- [ ] **Wan 2.1 14B** (Primary T2V/I2V model)
  ```
  Path: ComfyUI/models/diffusion_models/wan2.1_t2v_14B_fp16.safetensors
  Size: ~28 GB (FP16) or ~14 GB (FP8)
  Source: https://huggingface.co/Wan-AI/Wan2.1-T2V-14B
  ```

- [ ] **Wan 2.1 5B** (Lighter alternative)
  ```
  Path: ComfyUI/models/diffusion_models/wan2.1_t2v_5B_fp16.safetensors
  Size: ~10 GB (FP16) or ~5 GB (FP8)
  Source: https://huggingface.co/Wan-AI/Wan2.1-T2V-5B
  ```

- [ ] **Wan VAE**
  ```
  Path: ComfyUI/models/vae/wan_vae.safetensors
  Size: ~335 MB
  Source: Included in Wan model repository
  ```

- [ ] **HunyuanVideo**
  ```
  Path: ComfyUI/models/diffusion_models/hunyuan_video_720_fp16.safetensors
  Size: ~26 GB (FP16) or ~13 GB (FP8)
  Source: https://huggingface.co/tencent/HunyuanVideo
  ```

- [ ] **CogVideoX-5B**
  ```
  Path: ComfyUI/models/diffusion_models/cogvideox_5b_fp16.safetensors
  Size: ~10 GB (FP16)
  Source: https://huggingface.co/THUDM/CogVideoX-5b
  ```

- [ ] **LTX-2** (Select appropriate tier)
  ```
  Path: ComfyUI/models/diffusion_models/ltx2_[SIZE].safetensors
  Source: https://huggingface.co/Lightricks/LTX-Video
  ```

### AnimateDiff Motion Models

- [ ] **Motion Module v3 (SD1.5)**
  ```
  Path: ComfyUI/models/animatediff_models/mm_sd15_v3.safetensors
  Size: ~1.5 GB
  ```

- [ ] **Motion Module SDXL Beta**
  ```
  Path: ComfyUI/models/animatediff_models/mm_sdxl_v10_beta.safetensors
  Size: ~1.7 GB
  ```

### ControlNet Models

- [ ] **OpenPose (SD1.5)**
  ```
  Path: ComfyUI/models/controlnet/control_v11p_sd15_openpose.safetensors
  ```

- [ ] **Depth (SD1.5)**
  ```
  Path: ComfyUI/models/controlnet/control_v11f1p_sd15_depth.safetensors
  ```

- [ ] **Canny (SD1.5)**
  ```
  Path: ComfyUI/models/controlnet/control_v11p_sd15_canny.safetensors
  ```

- [ ] **SparseCtrl**
  ```
  Path: ComfyUI/models/controlnet/control_v11_sd15_sparsectrl_scribble.safetensors
  ```

### IP-Adapter Models

- [ ] **IP-Adapter SD1.5 Plus**
  ```
  Path: ComfyUI/models/ipadapter/ip-adapter-plus_sd15.safetensors
  ```

- [ ] **IP-Adapter FaceID Plus V2 (SD1.5)**
  ```
  Path: ComfyUI/models/ipadapter/ip-adapter-faceid-plusv2_sd15.safetensors
  ```

- [ ] **IP-Adapter FaceID Plus V2 (SDXL)**
  ```
  Path: ComfyUI/models/ipadapter/ip-adapter-faceid-plusv2_sdxl.safetensors
  ```

- [ ] **CLIP Vision ViT-H**
  ```
  Path: ComfyUI/models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors
  ```

### InsightFace Models

- [ ] **AntelopeV2**
  ```
  Path: ComfyUI/models/insightface/models/antelopev2/
  Files:
    - 1det_10g.onnx
    - 2d106det.onnx
    - genderage.onnx
    - glintr100.onnx
    - scrfd_10g_bnkps.onnx
  ```

- [ ] **InsightFace Python Package**
  ```bash
  pip install insightface
  pip install onnxruntime-gpu
  ```

### Upscaling Models

- [ ] **SeedVR2 (2x)**
  ```
  Path: ComfyUI/models/upscale_models/SeedVR2_x2.safetensors
  ```

- [ ] **SeedVR2 (4x)**
  ```
  Path: ComfyUI/models/upscale_models/SeedVR2_x4.safetensors
  ```

- [ ] **GIMM-VFI Model**
  ```
  Path: ComfyUI/models/frame_interpolation/gimm_vfi.pth
  ```

### Base Stable Diffusion Checkpoints (for AnimateDiff)

- [ ] **At least one SD1.5 checkpoint** (for AnimateDiff workflows)
  ```
  Path: ComfyUI/models/checkpoints/
  Recommended: Realistic Vision v5.1, DreamShaper v8, RevAnimated v2
  ```

- [ ] **At least one SDXL checkpoint** (optional, for SDXL AnimateDiff)
  ```
  Path: ComfyUI/models/checkpoints/
  Recommended: Juggernaut XL, RealVisXL
  ```

---

## 4. System Dependencies

### Required System Packages

- [ ] **ffmpeg** (Required for VideoHelperSuite)
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt install ffmpeg

  # Windows
  # Download from https://ffmpeg.org/download.html and add to PATH
  ```
  - [ ] Verify: `ffmpeg -version` returns version info

- [ ] **Git LFS** (Required for large model downloads)
  ```bash
  git lfs install
  ```

### Python Dependencies (Beyond requirements.txt)

- [ ] **flash-attn** (Recommended for HunyuanVideo)
  ```bash
  pip install flash-attn --no-build-isolation
  ```

- [ ] **xformers** (Recommended for memory-efficient attention)
  ```bash
  pip install xformers
  ```

- [ ] **triton** (Required for some optimizations on Linux)
  ```bash
  pip install triton
  ```

---

## 5. Test Workflows

### Test 1: Basic T2V Generation
- [ ] Load Wan 2.1 5B model (or smallest available)
- [ ] Set resolution: 480x848
- [ ] Set frames: 33 (2 seconds at 16fps)
- [ ] Prompt: "A cat walking on a garden path, sunny day, cinematic"
- [ ] Queue prompt and verify video output generated
- [ ] Output saved as video file via VHS_VideoCombine

### Test 2: I2V Generation
- [ ] Load any I2V model (Wan I2V or CogVideoX I2V)
- [ ] Load a test image as input
- [ ] Set appropriate resolution matching image aspect ratio
- [ ] Prompt describing motion for the image
- [ ] Queue and verify the image animates correctly

### Test 3: AnimateDiff Pipeline
- [ ] Load SD1.5 checkpoint
- [ ] Load motion module v3
- [ ] Configure AnimateDiff-Evolved nodes
- [ ] Set context_length: 16, overlap: 4
- [ ] Generate 48 frames
- [ ] Verify smooth animation output

### Test 4: IP-Adapter FaceID
- [ ] Load SD1.5 checkpoint and IP-Adapter FaceID Plus V2
- [ ] Load a reference face image
- [ ] Configure InsightFace node (test both CUDA and CPU providers)
- [ ] Generate image with face consistency
- [ ] Verify output face matches reference

### Test 5: Frame Interpolation
- [ ] Load a short test video (16fps)
- [ ] Apply GIMM-VFI 2x interpolation
- [ ] Verify output is 32fps
- [ ] Check for interpolation artifacts

### Test 6: Upscaling
- [ ] Load SeedVR2 model
- [ ] Load a 480p test video
- [ ] Apply 2x upscaling
- [ ] Verify output resolution is doubled
- [ ] Check for upscaling artifacts

---

## 6. Configuration and Optimization

### VRAM Optimization
- [ ] ComfyUI launch flags configured for your GPU
  ```
  # 12 GB VRAM:
  python main.py --lowvram --fp8_e4m3fn

  # 24 GB VRAM:
  python main.py --normalvram

  # 24 GB VRAM (aggressive):
  python main.py --highvram
  ```
- [ ] Tiled VAE enabled for large resolution outputs
- [ ] Model caching configured (keep frequently used models in VRAM)

### Output Configuration
- [ ] Output directory set and accessible
  ```
  Default: ComfyUI/output/
  Custom: Set in ComfyUI settings or per-node
  ```
- [ ] Sufficient disk space verified (minimum 50 GB free recommended)
- [ ] Video codec defaults set (H.264 for compatibility, H.265 for quality)

### Network and API Keys (if using cloud services)
- [ ] ElevenLabs API key configured (for voice/SFX generation)
- [ ] Any other required API keys stored securely

---

## Setup Verification Summary

| Component | Status | Notes |
|-----------|--------|-------|
| ComfyUI Core | [ ] Pass / [ ] Fail | |
| VideoHelperSuite | [ ] Pass / [ ] Fail | |
| AnimateDiff-Evolved | [ ] Pass / [ ] Fail | |
| Advanced-ControlNet | [ ] Pass / [ ] Fail | |
| WanVideoWrapper | [ ] Pass / [ ] Fail | |
| HunyuanVideoWrapper | [ ] Pass / [ ] Fail | |
| CogVideoXWrapper | [ ] Pass / [ ] Fail | |
| IP-Adapter Plus | [ ] Pass / [ ] Fail | |
| GIMM-VFI | [ ] Pass / [ ] Fail | |
| Steerable Motion | [ ] Pass / [ ] Fail | |
| Text Encoders | [ ] Pass / [ ] Fail | |
| Video Models | [ ] Pass / [ ] Fail | |
| ControlNet Models | [ ] Pass / [ ] Fail | |
| IP-Adapter Models | [ ] Pass / [ ] Fail | |
| InsightFace | [ ] Pass / [ ] Fail | |
| Upscaling Models | [ ] Pass / [ ] Fail | |
| ffmpeg | [ ] Pass / [ ] Fail | |
| Test Workflows | [ ] Pass / [ ] Fail | |

**Setup completed by:** _______________
**Date:** _______________
**GPU(s):** _______________
**VRAM Total:** _______________
**Notes:** _______________
