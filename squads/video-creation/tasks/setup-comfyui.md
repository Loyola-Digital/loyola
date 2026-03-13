# Task: Setup ComfyUI Environment

**Task ID:** `setup-comfyui`
**Pattern:** HO-TP-001 (Task Anatomy Standard)
**Version:** 1.0.0
**Last Updated:** 2026-02-06

---

## Task Anatomy

| Field | Value |
|-------|-------|
| **task_name** | Setup ComfyUI Environment |
| **status** | `pending` |
| **responsible_executor** | @video-creation:comfyui-operator |
| **execution_type** | `Worker` |
| **input** | comfyui_path, model_list, node_list |
| **output** | installation_report.yaml, verified_environment |
| **action_items** | 4 phases, 24+ steps |
| **acceptance_criteria** | 10 criteria |

**Estimated Time:** 1-4h (primarily model download time)

---

## Executor Specification

| Attribute | Value |
|-----------|-------|
| **Type** | Worker |
| **Pattern** | HO-EP-004 |
| **Executor** | @video-creation:comfyui-operator |
| **Rationale** | Environment setup is fully deterministic: clone repos, download files, verify checksums. No creative judgment needed. 100% automatable. |

### Executor Selection Criteria

- Task is **fully deterministic**: same inputs always produce same results
- Task involves **file operations**: git clone, wget/curl, file system operations
- Task requires **no interpretation**: install lists are explicit
- Task is **repeatable**: can re-run to verify or update environment
- **Speed matters**: Worker executes fastest for this type of operation

### Fallback

| Trigger | Fallback |
|---------|----------|
| Download fails | Retry with alternative mirror or manual download URL |
| Git clone fails | Retry, or download as zip archive |
| Model verification fails | Re-download specific model |
| Node incompatibility | Pin to known working version/commit |

---

## Overview

This task sets up the ComfyUI environment with all required custom nodes and models for the AI Video Creation squad. It ensures that all generation, enhancement, and consistency tools are installed and verified before any video creation tasks can begin.

ComfyUI is installed at: `/Users/felipegobbi/ComfyUI`

```
INPUT (comfyui_path + model_list + node_list)
    |
[STEP 1: INSTALL CUSTOM NODES]
    | Clone required node repositories
    | Install Python dependencies
    | Verify node loading
    |
    v
[STEP 2: DOWNLOAD MODELS]
    | Download Wan 2.1/2.2 models
    | Download motion models
    | Download IP-Adapter models
    | Download upscaling models
    | Download auxiliary models (VAE, CLIP, etc.)
    |
    v
[STEP 3: VERIFY INSTALLATION]
    | Start ComfyUI and check for errors
    | Verify all nodes register correctly
    | Verify all models are loadable
    | Check VRAM compatibility
    |
    v
[STEP 4: TEST BASIC WORKFLOW]
    | Run minimal T2V generation
    | Run minimal image generation
    | Verify output is valid
    | Report results
    |
    v
OUTPUT (installation_report.yaml + verified_environment)
```

### Why This Task Matters

Without proper environment setup:
- `create-video` will fail at generation steps
- `create-shot` will fail at workflow execution
- `storyboard` will fail at keyframe generation
- Model mismatches cause silent quality degradation

This task is a **prerequisite** for all other video creation tasks.

---

## Input

### Required Inputs

- **comfyui_path** (`string`)
  - Description: Absolute path to the ComfyUI installation directory
  - Source: System configuration
  - Required: Yes
  - Default: `/Users/felipegobbi/ComfyUI`
  - Validation: Directory must exist and contain `main.py`

### Optional Inputs

- **model_list** (`string[]`)
  - Description: List of models to install. Defaults to full squad requirements.
  - Required: No
  - Default: `"all"` (install everything)
  - Options: `"minimal"` (bare minimum), `"standard"` (common models), `"all"` (everything)

- **node_list** (`string[]`)
  - Description: List of custom nodes to install. Defaults to full squad requirements.
  - Required: No
  - Default: `"all"` (install everything)

- **skip_verification** (`boolean`)
  - Description: Skip the verification and testing phases
  - Required: No
  - Default: `false`

- **force_reinstall** (`boolean`)
  - Description: Force reinstallation even if components already exist
  - Required: No
  - Default: `false`

---

## Output

### Primary Outputs

- **installation_report.yaml** (`file`)
  - Description: Detailed report of installation status for all components
  - Format: YAML
  - Destination: `/Users/felipegobbi/ComfyUI/installation_report.yaml`
  - Structure:
    ```yaml
    installation_report:
      date: "2026-02-06T10:00:00Z"
      comfyui_path: "/Users/felipegobbi/ComfyUI"
      comfyui_version: "latest"

      custom_nodes:
        - name: "VideoHelperSuite"
          status: "installed"
          version: "latest"
          path: "custom_nodes/ComfyUI-VideoHelperSuite"

        - name: "AnimateDiff-Evolved"
          status: "installed"
          version: "latest"
          path: "custom_nodes/ComfyUI-AnimateDiff-Evolved"

        # ... all nodes

      models:
        - name: "wan2.1_t2v_480p"
          status: "downloaded"
          path: "models/diffusion_models/wan2.1_t2v_480p_bf16.safetensors"
          size: "14.8 GB"
          checksum: "verified"

        # ... all models

      verification:
        comfyui_starts: true
        all_nodes_loaded: true
        all_models_accessible: true
        vram_available: "24 GB"
        test_generation: "passed"

      issues: []
      warnings: []
    ```

- **verified_environment** (`boolean`)
  - Description: Whether the environment passed all verification checks
  - Value: `true` if all checks pass, `false` otherwise

### Secondary Outputs

- **download_log.txt** (`file`)
  - Description: Detailed log of all download operations
  - Destination: `/Users/felipegobbi/ComfyUI/download_log.txt`

---

## Preconditions

- [ ] ComfyUI base installation exists at `/Users/felipegobbi/ComfyUI`
- [ ] `main.py` exists in the ComfyUI directory
- [ ] Python 3.10+ is installed and accessible
- [ ] `pip` is available
- [ ] `git` is installed and accessible
- [ ] Internet connection available (for downloads)
- [ ] Sufficient disk space (minimum 100GB for all models)
- [ ] NVIDIA GPU with CUDA support (for GPU inference)

---

## Action Items

### STEP 1: INSTALL CUSTOM NODES

**Duration:** 10-30 minutes
**Checkpoint:** All nodes cloned and dependencies installed
**Mode:** Worker (automated)

#### Step 1.1: Required Custom Nodes List

**Actions:**
```yaml
required_custom_nodes:
  description: "Complete list of custom nodes required for the video creation squad"

  nodes:
    # === VIDEO GENERATION ===

    - name: "ComfyUI-VideoHelperSuite"
      repository: "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite"
      purpose: "Video loading, saving, combining, and processing nodes"
      priority: "CRITICAL"
      provides:
        - "VHS_LoadVideo"
        - "VHS_VideoCombine"
        - "VHS_LoadImages"
        - "VHS_SplitVideo"
      dependencies: "opencv-python, imageio, imageio-ffmpeg"

    - name: "ComfyUI-WanVideoWrapper"
      repository: "https://github.com/kijai/ComfyUI-WanVideoWrapper"
      purpose: "Wan 2.1 and 2.2 model integration for T2V and I2V"
      priority: "CRITICAL"
      provides:
        - "WanVideoModelLoader"
        - "WanVideoSampler"
        - "WanVideoTextEncode"
        - "WanVideoImageEncode"
      dependencies: "accelerate, sentencepiece"

    - name: "ComfyUI-AnimateDiff-Evolved"
      repository: "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved"
      purpose: "AnimateDiff motion module integration"
      priority: "HIGH"
      provides:
        - "ADE_AnimateDiffLoaderGen1"
        - "ADE_AnimateDiffSampler"
        - "ADE_AnimateDiffUniformContextOptions"
      dependencies: "einops"

    - name: "ComfyUI-HunyuanVideoWrapper"
      repository: "https://github.com/kijai/ComfyUI-HunyuanVideoWrapper"
      purpose: "HunyuanVideo model integration"
      priority: "MEDIUM"
      provides:
        - "HunyuanVideoModelLoader"
        - "HunyuanVideoSampler"
      dependencies: "accelerate"

    # === CHARACTER CONSISTENCY ===

    - name: "ComfyUI_IPAdapter_plus"
      repository: "https://github.com/cubiq/ComfyUI_IPAdapter_plus"
      purpose: "IP-Adapter for character consistency and style transfer"
      priority: "CRITICAL"
      provides:
        - "IPAdapterModelLoader"
        - "IPAdapterApply"
        - "IPAdapterFaceID"
        - "IPAdapterStyleTransfer"
      dependencies: "insightface, onnxruntime"

    - name: "ComfyUI-InstantID"
      repository: "https://github.com/cubiq/ComfyUI_InstantID"
      purpose: "InstantID for face-consistent generation"
      priority: "HIGH"
      provides:
        - "InstantIDModelLoader"
        - "InstantIDApply"
      dependencies: "insightface, onnxruntime"

    # === ENHANCEMENT ===

    - name: "ComfyUI-Frame-Interpolation"
      repository: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation"
      purpose: "RIFE and other frame interpolation methods"
      priority: "HIGH"
      provides:
        - "RIFE VFI"
        - "FILM VFI"
        - "AMT VFI"
      dependencies: "cupy-cuda12x (or cupy-cuda11x)"

    - name: "ComfyUI_essentials"
      repository: "https://github.com/cubiq/ComfyUI_essentials"
      purpose: "Essential utility nodes (color manipulation, masks, etc.)"
      priority: "HIGH"
      provides:
        - "Color adjustment nodes"
        - "Mask manipulation nodes"
        - "Image comparison nodes"
      dependencies: "colour-science"

    # === CONTROLNET AND GUIDANCE ===

    - name: "ComfyUI-Advanced-ControlNet"
      repository: "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet"
      purpose: "Advanced ControlNet integration for guided generation"
      priority: "MEDIUM"
      provides:
        - "ACN_AdvancedControlNetApply"
        - "ACN_SparseCtrlLoaderAdvanced"
      dependencies: []

    - name: "comfyui_controlnet_aux"
      repository: "https://github.com/Fannovel16/comfyui_controlnet_aux"
      purpose: "ControlNet preprocessors (depth, pose, canny, etc.)"
      priority: "MEDIUM"
      provides:
        - "DepthAnythingV2Preprocessor"
        - "DWPreprocessor"
        - "CannyEdgePreprocessor"
        - "OpenposePreprocessor"
      dependencies: "depth-anything-v2, controlnet-aux"

    # === UTILITY ===

    - name: "ComfyUI-Manager"
      repository: "https://github.com/ltdrdata/ComfyUI-Manager"
      purpose: "Node manager for easy installation and updates"
      priority: "HIGH"
      provides:
        - "Install Missing Custom Nodes"
        - "Update All"
        - "Node database"
      dependencies: []

    - name: "rgthree-comfy"
      repository: "https://github.com/rgthree/rgthree-comfy"
      purpose: "Quality of life nodes (reroute, display, etc.)"
      priority: "LOW"
      provides:
        - "Seed"
        - "Display Any"
        - "Reroute"
      dependencies: []

    - name: "ComfyUI-KJNodes"
      repository: "https://github.com/kijai/ComfyUI-KJNodes"
      purpose: "Utility nodes from kijai (batch processing, math, etc.)"
      priority: "MEDIUM"
      provides:
        - "Batch processing nodes"
        - "Math operation nodes"
        - "String manipulation nodes"
      dependencies: []
```

#### Step 1.2: Install Custom Nodes

**Actions:**
```yaml
install_nodes:
  description: "Clone and install all required custom nodes"

  procedure:
    for_each_node:
      - step: "Check if already installed"
        command: |
          if [ -d "/Users/felipegobbi/ComfyUI/custom_nodes/{node_dir}" ]; then
            echo "Already installed: {node_name}"
            if [ "$FORCE_REINSTALL" = "true" ]; then
              echo "Force reinstall: removing existing..."
              rm -rf "/Users/felipegobbi/ComfyUI/custom_nodes/{node_dir}"
            else
              # Just update
              cd "/Users/felipegobbi/ComfyUI/custom_nodes/{node_dir}"
              git pull
              exit 0
            fi
          fi

      - step: "Clone repository"
        command: |
          cd /Users/felipegobbi/ComfyUI/custom_nodes
          git clone {repository_url}

      - step: "Install Python dependencies"
        command: |
          cd /Users/felipegobbi/ComfyUI/custom_nodes/{node_dir}
          if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt
          fi
          if [ -f "install.py" ]; then
            python install.py
          fi

      - step: "Verify installation"
        detail: "Check that node directory exists and has expected files"

  install_order:
    critical:
      - "ComfyUI-Manager"  # Install first for dependency resolution
      - "ComfyUI-VideoHelperSuite"
      - "ComfyUI-WanVideoWrapper"
      - "ComfyUI_IPAdapter_plus"
    high:
      - "ComfyUI-AnimateDiff-Evolved"
      - "ComfyUI-InstantID"
      - "ComfyUI-Frame-Interpolation"
      - "ComfyUI_essentials"
    medium:
      - "ComfyUI-HunyuanVideoWrapper"
      - "ComfyUI-Advanced-ControlNet"
      - "comfyui_controlnet_aux"
      - "ComfyUI-KJNodes"
    low:
      - "rgthree-comfy"

  execution_commands:
    full_install: |
      cd /Users/felipegobbi/ComfyUI/custom_nodes

      # CRITICAL nodes
      echo "=== Installing CRITICAL nodes ==="

      echo "[1/13] ComfyUI-Manager..."
      git clone https://github.com/ltdrdata/ComfyUI-Manager.git 2>/dev/null || (cd ComfyUI-Manager && git pull)

      echo "[2/13] ComfyUI-VideoHelperSuite..."
      git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git 2>/dev/null || (cd ComfyUI-VideoHelperSuite && git pull)
      pip install -r ComfyUI-VideoHelperSuite/requirements.txt 2>/dev/null

      echo "[3/13] ComfyUI-WanVideoWrapper..."
      git clone https://github.com/kijai/ComfyUI-WanVideoWrapper.git 2>/dev/null || (cd ComfyUI-WanVideoWrapper && git pull)
      pip install -r ComfyUI-WanVideoWrapper/requirements.txt 2>/dev/null

      echo "[4/13] ComfyUI_IPAdapter_plus..."
      git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git 2>/dev/null || (cd ComfyUI_IPAdapter_plus && git pull)
      pip install insightface onnxruntime 2>/dev/null

      # HIGH priority nodes
      echo "=== Installing HIGH priority nodes ==="

      echo "[5/13] ComfyUI-AnimateDiff-Evolved..."
      git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git 2>/dev/null || (cd ComfyUI-AnimateDiff-Evolved && git pull)

      echo "[6/13] ComfyUI_InstantID..."
      git clone https://github.com/cubiq/ComfyUI_InstantID.git 2>/dev/null || (cd ComfyUI_InstantID && git pull)

      echo "[7/13] ComfyUI-Frame-Interpolation..."
      git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git 2>/dev/null || (cd ComfyUI-Frame-Interpolation && git pull)
      pip install -r ComfyUI-Frame-Interpolation/requirements.txt 2>/dev/null

      echo "[8/13] ComfyUI_essentials..."
      git clone https://github.com/cubiq/ComfyUI_essentials.git 2>/dev/null || (cd ComfyUI_essentials && git pull)
      pip install -r ComfyUI_essentials/requirements.txt 2>/dev/null

      # MEDIUM priority nodes
      echo "=== Installing MEDIUM priority nodes ==="

      echo "[9/13] ComfyUI-HunyuanVideoWrapper..."
      git clone https://github.com/kijai/ComfyUI-HunyuanVideoWrapper.git 2>/dev/null || (cd ComfyUI-HunyuanVideoWrapper && git pull)
      pip install -r ComfyUI-HunyuanVideoWrapper/requirements.txt 2>/dev/null

      echo "[10/13] ComfyUI-Advanced-ControlNet..."
      git clone https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git 2>/dev/null || (cd ComfyUI-Advanced-ControlNet && git pull)

      echo "[11/13] comfyui_controlnet_aux..."
      git clone https://github.com/Fannovel16/comfyui_controlnet_aux.git 2>/dev/null || (cd comfyui_controlnet_aux && git pull)
      pip install -r comfyui_controlnet_aux/requirements.txt 2>/dev/null

      echo "[12/13] ComfyUI-KJNodes..."
      git clone https://github.com/kijai/ComfyUI-KJNodes.git 2>/dev/null || (cd ComfyUI-KJNodes && git pull)
      pip install -r ComfyUI-KJNodes/requirements.txt 2>/dev/null

      # LOW priority nodes
      echo "=== Installing LOW priority nodes ==="

      echo "[13/13] rgthree-comfy..."
      git clone https://github.com/rgthree/rgthree-comfy.git 2>/dev/null || (cd rgthree-comfy && git pull)

      echo "=== All custom nodes installed ==="
```

---

### STEP 2: DOWNLOAD MODELS

**Duration:** 30 minutes - 3 hours (depends on internet speed)
**Checkpoint:** All required models downloaded and checksums verified
**Mode:** Worker (automated downloads)

#### Step 2.1: Video Generation Models

**Actions:**
```yaml
video_generation_models:
  description: "Download core video generation models"

  models:
    # === WAN 2.1 MODELS ===

    - name: "Wan 2.1 T2V 480p (bf16)"
      filename: "wan2.1_t2v_480p_bf16.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/diffusion_models/"
      source: "huggingface"
      repo: "Wan-AI/Wan2.1-T2V-14B"
      size: "~14.8 GB"
      priority: "CRITICAL"
      notes: "Primary T2V model for standard resolution generation"

    - name: "Wan 2.1 I2V 480p (bf16)"
      filename: "wan2.1_i2v_480p_bf16.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/diffusion_models/"
      source: "huggingface"
      repo: "Wan-AI/Wan2.1-I2V-14B-480P"
      size: "~14.8 GB"
      priority: "HIGH"
      notes: "Image-to-Video model for reference-based generation"

    - name: "Wan 2.1 VAE"
      filename: "wan_2.1_vae.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/vae/"
      source: "huggingface"
      repo: "Wan-AI/Wan2.1-T2V-14B"
      size: "~335 MB"
      priority: "CRITICAL"
      notes: "Required VAE for all Wan 2.1 models"

    - name: "UMT5-XXL Text Encoder"
      filename: "umt5_xxl_enc_bf16.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/text_encoders/"
      source: "huggingface"
      repo: "Wan-AI/Wan2.1-T2V-14B"
      size: "~9.5 GB"
      priority: "CRITICAL"
      notes: "Text encoder used by Wan 2.1/2.2 models"

    - name: "CLIP Vision H"
      filename: "clip_vision_h.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/clip_vision/"
      source: "huggingface"
      repo: "Wan-AI/Wan2.1-I2V-14B-480P"
      size: "~2.5 GB"
      priority: "HIGH"
      notes: "CLIP Vision encoder for I2V mode"

    # === WAN 2.2 MODELS (OPTIONAL, HIGHER RES) ===

    - name: "Wan 2.2 T2V 720p (bf16)"
      filename: "wan2.2_t2v_720p_bf16.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/diffusion_models/"
      source: "huggingface"
      repo: "Wan-AI/Wan2.2-T2V-14B"
      size: "~14.8 GB"
      priority: "MEDIUM"
      notes: "Higher resolution T2V, requires more VRAM (24GB+)"

  download_commands:
    using_huggingface_cli: |
      # Install huggingface CLI if not present
      pip install huggingface_hub[cli]

      # Wan 2.1 T2V (CRITICAL)
      echo "Downloading Wan 2.1 T2V model..."
      huggingface-cli download Wan-AI/Wan2.1-T2V-14B \
        --include "*.safetensors" \
        --local-dir /Users/felipegobbi/ComfyUI/models/diffusion_models/Wan2.1-T2V-14B

      # Wan 2.1 I2V (HIGH)
      echo "Downloading Wan 2.1 I2V model..."
      huggingface-cli download Wan-AI/Wan2.1-I2V-14B-480P \
        --include "*.safetensors" \
        --local-dir /Users/felipegobbi/ComfyUI/models/diffusion_models/Wan2.1-I2V-14B-480P

    alternative_wget: |
      # If huggingface-cli not available, use wget
      cd /Users/felipegobbi/ComfyUI/models/diffusion_models/
      wget -c "https://huggingface.co/Wan-AI/Wan2.1-T2V-14B/resolve/main/diffusion_pytorch_model.safetensors" \
        -O wan2.1_t2v_480p_bf16.safetensors
```

#### Step 2.2: IP-Adapter and Consistency Models

**Actions:**
```yaml
consistency_models:
  description: "Download models for character and style consistency"

  models:
    - name: "IP-Adapter FaceID Plus V2 (SD1.5)"
      filename: "ip-adapter-faceid-plusv2_sd15.bin"
      destination: "/Users/felipegobbi/ComfyUI/models/ipadapter/"
      source: "huggingface"
      repo: "h94/IP-Adapter-FaceID"
      size: "~1.6 GB"
      priority: "CRITICAL"
      notes: "Primary model for face consistency"

    - name: "IP-Adapter Plus (SD1.5)"
      filename: "ip-adapter-plus_sd15.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/ipadapter/"
      source: "huggingface"
      repo: "h94/IP-Adapter"
      size: "~98 MB"
      priority: "HIGH"
      notes: "General appearance consistency"

    - name: "IP-Adapter SDXL"
      filename: "ip-adapter_sdxl_vit-h.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/ipadapter/"
      source: "huggingface"
      repo: "h94/IP-Adapter"
      size: "~2.5 GB"
      priority: "MEDIUM"
      notes: "For SDXL-based keyframe generation"

    - name: "CLIP Vision ViT-H (for IP-Adapter)"
      filename: "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/clip_vision/"
      source: "huggingface"
      repo: "h94/IP-Adapter"
      size: "~2.5 GB"
      priority: "HIGH"
      notes: "CLIP vision encoder required by IP-Adapter"

    - name: "InsightFace Buffalo_l"
      filename: "buffalo_l.zip"
      destination: "/Users/felipegobbi/ComfyUI/models/insightface/models/"
      source: "huggingface"
      repo: "MonkeyOCR/insightface_buffalo_l"
      size: "~350 MB"
      priority: "HIGH"
      notes: "Face detection and embedding model for FaceID"
      post_download: "unzip to buffalo_l/ directory"

    - name: "Antelopev2 (InsightFace)"
      filename: "antelopev2.zip"
      destination: "/Users/felipegobbi/ComfyUI/models/insightface/models/"
      source: "huggingface"
      repo: "MonkeyOCR/insightface_antelopev2"
      size: "~360 MB"
      priority: "HIGH"
      notes: "Alternative face analysis model"
      post_download: "unzip to antelopev2/ directory"

  download_commands: |
    # Create directories
    mkdir -p /Users/felipegobbi/ComfyUI/models/ipadapter
    mkdir -p /Users/felipegobbi/ComfyUI/models/clip_vision
    mkdir -p /Users/felipegobbi/ComfyUI/models/insightface/models

    # IP-Adapter models
    echo "Downloading IP-Adapter models..."
    huggingface-cli download h94/IP-Adapter-FaceID \
      --include "ip-adapter-faceid-plusv2_sd15.bin" \
      --local-dir /Users/felipegobbi/ComfyUI/models/ipadapter/

    huggingface-cli download h94/IP-Adapter \
      --include "models/ip-adapter-plus_sd15.safetensors" \
      --local-dir /Users/felipegobbi/ComfyUI/models/ipadapter/
```

#### Step 2.3: Enhancement Models

**Actions:**
```yaml
enhancement_models:
  description: "Download models for upscaling and frame interpolation"

  models:
    - name: "RealESRGAN x4plus"
      filename: "RealESRGAN_x4plus.pth"
      destination: "/Users/felipegobbi/ComfyUI/models/upscale_models/"
      source: "github"
      url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
      size: "~64 MB"
      priority: "HIGH"
      notes: "Primary 4x upscaler for realistic content"

    - name: "RealESRGAN x4plus Anime"
      filename: "RealESRGAN_x4plus_anime_6B.pth"
      destination: "/Users/felipegobbi/ComfyUI/models/upscale_models/"
      source: "github"
      url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth"
      size: "~17 MB"
      priority: "MEDIUM"
      notes: "Optimized for anime/stylized content"

    - name: "4x-UltraSharp"
      filename: "4x-UltraSharp.pth"
      destination: "/Users/felipegobbi/ComfyUI/models/upscale_models/"
      source: "civitai"
      size: "~64 MB"
      priority: "MEDIUM"
      notes: "Alternative upscaler, very sharp output"

    - name: "RIFE Models (for Frame Interpolation)"
      filename: "rife/"
      destination: "/Users/felipegobbi/ComfyUI/custom_nodes/ComfyUI-Frame-Interpolation/ckpts/"
      source: "auto-download"
      size: "~200 MB total"
      priority: "HIGH"
      notes: "RIFE models auto-download on first use, but we pre-download for reliability"

  download_commands: |
    # Create directories
    mkdir -p /Users/felipegobbi/ComfyUI/models/upscale_models

    # RealESRGAN
    echo "Downloading RealESRGAN x4plus..."
    wget -c "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
      -O /Users/felipegobbi/ComfyUI/models/upscale_models/RealESRGAN_x4plus.pth

    echo "Downloading RealESRGAN x4plus Anime..."
    wget -c "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth" \
      -O /Users/felipegobbi/ComfyUI/models/upscale_models/RealESRGAN_x4plus_anime_6B.pth
```

#### Step 2.4: Motion and AnimateDiff Models

**Actions:**
```yaml
motion_models:
  description: "Download AnimateDiff motion modules and related models"

  models:
    - name: "AnimateDiff v3 Motion Module"
      filename: "v3_sd15_mm.ckpt"
      destination: "/Users/felipegobbi/ComfyUI/custom_nodes/ComfyUI-AnimateDiff-Evolved/models/"
      source: "huggingface"
      repo: "guoyww/animatediff"
      size: "~1.8 GB"
      priority: "HIGH"
      notes: "Latest AnimateDiff motion module for SD1.5"

    - name: "AnimateDiff v3 Adapter"
      filename: "v3_sd15_adapter.ckpt"
      destination: "/Users/felipegobbi/ComfyUI/custom_nodes/ComfyUI-AnimateDiff-Evolved/models/"
      source: "huggingface"
      repo: "guoyww/animatediff"
      size: "~300 MB"
      priority: "MEDIUM"
      notes: "Adapter for better motion control"

    - name: "AnimateDiff SparseCtrl RGB"
      filename: "v3_sd15_sparsectrl_rgb.ckpt"
      destination: "/Users/felipegobbi/ComfyUI/custom_nodes/ComfyUI-AnimateDiff-Evolved/models/"
      source: "huggingface"
      repo: "guoyww/animatediff"
      size: "~1.8 GB"
      priority: "MEDIUM"
      notes: "Sparse control for guided animation"

  download_commands: |
    # Create directories
    mkdir -p /Users/felipegobbi/ComfyUI/custom_nodes/ComfyUI-AnimateDiff-Evolved/models/

    echo "Downloading AnimateDiff v3 motion module..."
    huggingface-cli download guoyww/animatediff \
      --include "v3_sd15_mm.ckpt" \
      --local-dir /Users/felipegobbi/ComfyUI/custom_nodes/ComfyUI-AnimateDiff-Evolved/models/
```

#### Step 2.5: Image Generation Models (for Keyframes)

**Actions:**
```yaml
image_generation_models:
  description: "Download image generation models used for storyboard keyframes"

  models:
    - name: "SDXL Base 1.0"
      filename: "sd_xl_base_1.0.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/checkpoints/"
      source: "huggingface"
      repo: "stabilityai/stable-diffusion-xl-base-1.0"
      size: "~6.9 GB"
      priority: "HIGH"
      notes: "Base model for keyframe generation"

    - name: "SDXL VAE"
      filename: "sdxl_vae.safetensors"
      destination: "/Users/felipegobbi/ComfyUI/models/vae/"
      source: "huggingface"
      repo: "stabilityai/sdxl-vae"
      size: "~335 MB"
      priority: "HIGH"
      notes: "VAE for SDXL image generation"

  download_commands: |
    echo "Downloading SDXL Base..."
    huggingface-cli download stabilityai/stable-diffusion-xl-base-1.0 \
      --include "sd_xl_base_1.0.safetensors" \
      --local-dir /Users/felipegobbi/ComfyUI/models/checkpoints/
```

#### Step 2.6: Download Summary

**Actions:**
```yaml
download_summary:
  description: "Total model storage requirements"

  by_priority:
    CRITICAL:
      - "Wan 2.1 T2V (~14.8 GB)"
      - "Wan 2.1 VAE (~335 MB)"
      - "UMT5-XXL Text Encoder (~9.5 GB)"
      - "IP-Adapter FaceID Plus V2 (~1.6 GB)"
      total: "~26.2 GB"

    HIGH:
      - "Wan 2.1 I2V (~14.8 GB)"
      - "CLIP Vision H (~2.5 GB)"
      - "IP-Adapter Plus (~98 MB)"
      - "CLIP Vision ViT-H (~2.5 GB)"
      - "InsightFace Buffalo_l (~350 MB)"
      - "InsightFace Antelopev2 (~360 MB)"
      - "RealESRGAN x4plus (~64 MB)"
      - "RIFE Models (~200 MB)"
      - "AnimateDiff v3 MM (~1.8 GB)"
      - "SDXL Base (~6.9 GB)"
      - "SDXL VAE (~335 MB)"
      total: "~30.0 GB"

    MEDIUM:
      - "Wan 2.2 T2V 720p (~14.8 GB)"
      - "IP-Adapter SDXL (~2.5 GB)"
      - "RealESRGAN Anime (~17 MB)"
      - "4x-UltraSharp (~64 MB)"
      - "AnimateDiff Adapter (~300 MB)"
      - "AnimateDiff SparseCtrl (~1.8 GB)"
      total: "~19.5 GB"

  grand_total:
    critical_only: "~26.2 GB"
    critical_plus_high: "~56.2 GB"
    all: "~75.7 GB"
```

---

### STEP 3: VERIFY INSTALLATION

**Duration:** 5-15 minutes
**Checkpoint:** All components verified
**Mode:** Worker (automated checks)

#### Step 3.1: Verify ComfyUI Startup

**Actions:**
```yaml
verify_startup:
  description: "Start ComfyUI and verify clean startup"

  substeps:
    - action: "Start ComfyUI"
      command: |
        cd /Users/felipegobbi/ComfyUI
        python main.py --listen --port 8188 &
        COMFYUI_PID=$!
        echo "ComfyUI started with PID: $COMFYUI_PID"
        sleep 30  # Wait for model loading

    - action: "Check server responds"
      command: |
        curl -s http://localhost:8188/system_stats
        if [ $? -eq 0 ]; then
          echo "PASS: ComfyUI server responding"
        else
          echo "FAIL: ComfyUI server not responding"
        fi

    - action: "Check for startup errors"
      detail: |
        Parse ComfyUI startup output for:
        - "Cannot import" errors (missing dependencies)
        - "ModuleNotFoundError" (missing Python packages)
        - "FileNotFoundError" (missing model files)
        - "CUDA error" (GPU issues)

        Each error should be logged with:
        - Error message
        - Affected node/model
        - Suggested fix

    - action: "Verify system resources"
      command: |
        # Check GPU VRAM
        python -c "
        import torch
        if torch.cuda.is_available():
            vram = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            print(f'GPU VRAM: {vram:.1f} GB')
            if vram < 12:
                print('WARNING: Less than 12GB VRAM. Some models may not fit.')
            elif vram < 24:
                print('NOTE: 12-24GB VRAM. Wan 2.2 may require lowvram mode.')
            else:
                print('GOOD: 24GB+ VRAM. All models should fit.')
        else:
            print('WARNING: No CUDA GPU detected. CPU-only mode.')
        "
```

#### Step 3.2: Verify Custom Nodes

**Actions:**
```yaml
verify_nodes:
  description: "Verify all custom nodes loaded correctly"

  substeps:
    - action: "Query node registry"
      command: |
        curl -s http://localhost:8188/object_info | python -c "
        import json, sys
        data = json.load(sys.stdin)
        print(f'Total registered nodes: {len(data)}')

        # Check critical nodes
        critical_nodes = {
            'VHS_VideoCombine': 'VideoHelperSuite',
            'WanVideoSampler': 'WanVideoWrapper',
            'IPAdapterApply': 'IPAdapter_plus',
            'ADE_AnimateDiffLoaderGen1': 'AnimateDiff-Evolved',
        }

        for node, source in critical_nodes.items():
            if node in data:
                print(f'  PASS: {node} ({source})')
            else:
                print(f'  FAIL: {node} ({source}) NOT FOUND')
        "

    - action: "List installed custom nodes"
      command: |
        echo "=== Installed Custom Nodes ==="
        ls -d /Users/felipegobbi/ComfyUI/custom_nodes/*/
```

#### Step 3.3: Verify Models

**Actions:**
```yaml
verify_models:
  description: "Verify all required model files exist and are valid"

  substeps:
    - action: "Check model files"
      command: |
        echo "=== Model File Verification ==="

        # Check each critical model
        check_model() {
          if [ -f "$1" ]; then
            size=$(du -h "$1" | cut -f1)
            echo "  PASS: $2 ($size)"
          else
            echo "  FAIL: $2 NOT FOUND at $1"
          fi
        }

        echo "--- Diffusion Models ---"
        check_model "/Users/felipegobbi/ComfyUI/models/diffusion_models/wan2.1*" "Wan 2.1 T2V"

        echo "--- VAE ---"
        check_model "/Users/felipegobbi/ComfyUI/models/vae/wan*" "Wan VAE"

        echo "--- Text Encoders ---"
        check_model "/Users/felipegobbi/ComfyUI/models/text_encoders/umt5*" "UMT5-XXL"

        echo "--- IP-Adapter ---"
        check_model "/Users/felipegobbi/ComfyUI/models/ipadapter/ip-adapter*" "IP-Adapter"

        echo "--- Upscalers ---"
        check_model "/Users/felipegobbi/ComfyUI/models/upscale_models/RealESRGAN*" "RealESRGAN"

    - action: "Check file integrity"
      detail: |
        For each critical model:
        1. Verify file size matches expected
        2. Verify file is not truncated (can be opened/loaded)
        3. If checksums available, verify SHA256
```

---

### STEP 4: TEST BASIC WORKFLOW

**Duration:** 5-15 minutes
**Checkpoint:** Test generation successful
**Mode:** Worker (automated test)

#### Step 4.1: Test Image Generation

**Actions:**
```yaml
test_image_generation:
  description: "Run a minimal image generation test"

  substeps:
    - action: "Create test workflow"
      detail: |
        Minimal SDXL image generation workflow:
        1. KSampler: steps=10, cfg=7.0, seed=42
        2. Positive prompt: "a red ball on a white table, simple, clean"
        3. Negative prompt: "blurry, low quality"
        4. Resolution: 512x512
        5. Save image output

    - action: "Execute test"
      detail: |
        1. Submit workflow via API
        2. Wait for completion (should take < 30s)
        3. Verify output image exists
        4. Verify image is valid PNG/JPG

    - action: "Evaluate result"
      detail: |
        - Image file exists: PASS/FAIL
        - Image resolution correct: PASS/FAIL
        - Image is not blank/corrupted: PASS/FAIL

  success_criteria:
    - "Image generated without errors"
    - "Output file is valid image"
    - "Generation completed in < 60s"
```

#### Step 4.2: Test Video Generation

**Actions:**
```yaml
test_video_generation:
  description: "Run a minimal video generation test using Wan 2.1"

  condition: "Only if Wan 2.1 model is installed"

  substeps:
    - action: "Create test workflow"
      detail: |
        Minimal Wan 2.1 T2V workflow:
        1. WanVideoModelLoader: wan2.1_t2v model
        2. WanVideoTextEncode: "a ball bouncing on a flat surface"
        3. WanVideoSampler: steps=15, cfg=6.0, seed=42
        4. Resolution: 832x480
        5. Frames: 17 (~1s at 16fps)
        6. VHS_VideoCombine: save as mp4

    - action: "Execute test"
      detail: |
        1. Submit workflow via API
        2. Wait for completion (may take 1-5 minutes depending on GPU)
        3. Verify output video exists
        4. Verify video is valid MP4 with FFprobe

    - action: "Evaluate result"
      detail: |
        - Video file exists: PASS/FAIL
        - Video has correct frame count: PASS/FAIL
        - Video plays without errors: PASS/FAIL
        - Generation completed without CUDA errors: PASS/FAIL

  success_criteria:
    - "Video generated without errors"
    - "Output file is valid MP4"
    - "Frame count matches expected"
    - "No CUDA OOM errors"
```

#### Step 4.3: Generate Installation Report

**Actions:**
```yaml
generate_report:
  description: "Compile final installation report"

  substeps:
    - action: "Collect all verification results"
    - action: "Generate installation_report.yaml"
      detail: |
        Compile:
        - All node installation statuses
        - All model download statuses
        - Startup verification results
        - Test generation results
        - System resource information
        - Any warnings or issues

    - action: "Print summary"
      detail: |
        ```
        ================================
        ComfyUI Setup Report
        ================================
        Path: /Users/felipegobbi/ComfyUI
        Date: 2026-02-06

        Custom Nodes: 13/13 installed
        Models: 18/18 downloaded
        Startup: CLEAN (no errors)
        Image Test: PASS
        Video Test: PASS

        GPU: NVIDIA RTX 4090 (24 GB VRAM)
        Disk Used: ~75 GB

        Status: READY FOR VIDEO CREATION
        ================================
        ```
```

---

## Acceptance Criteria

The task is complete when ALL of the following criteria are met:

- [ ] **AC-01:** All CRITICAL custom nodes installed (VideoHelperSuite, WanVideoWrapper, IPAdapter_plus)
- [ ] **AC-02:** All HIGH priority custom nodes installed (AnimateDiff-Evolved, InstantID, Frame-Interpolation, essentials)
- [ ] **AC-03:** Wan 2.1 T2V model downloaded and accessible
- [ ] **AC-04:** Wan 2.1 VAE and UMT5-XXL text encoder downloaded
- [ ] **AC-05:** IP-Adapter FaceID Plus V2 model downloaded
- [ ] **AC-06:** At least one upscaler model (RealESRGAN x4plus) downloaded
- [ ] **AC-07:** ComfyUI starts without blocking errors
- [ ] **AC-08:** All critical nodes register in ComfyUI node registry
- [ ] **AC-09:** Test image generation produces valid output
- [ ] **AC-10:** installation_report.yaml generated with complete status

---

## Error Handling

```yaml
error_handling:
  git_clone_failure:
    cause: "Network issues or repository moved/renamed"
    detection: "git clone returns non-zero exit code"
    recovery: |
      1. Retry with --depth 1 (shallow clone, faster)
      2. Try alternative URL (https vs ssh)
      3. Download as zip from GitHub releases
    prevention: "Test network connectivity before starting"

  pip_install_failure:
    cause: "Python package conflicts or missing system dependencies"
    detection: "pip install returns error"
    recovery: |
      1. Try installing in isolated venv
      2. Install specific version pinned to known working
      3. Install system dependencies first (e.g., cmake for dlib)
    prevention: "Use ComfyUI's virtual environment"

  download_interrupted:
    cause: "Network interruption during large model download"
    detection: "File size smaller than expected"
    recovery: |
      1. Use wget -c (resume download)
      2. Use huggingface-cli (built-in resume)
      3. Delete partial file and re-download
    prevention: "Use tools with resume capability"

  disk_space_insufficient:
    cause: "Not enough disk space for models"
    detection: "Write error or df check shows < 10GB free"
    recovery: |
      1. Install only CRITICAL models first
      2. Remove unused models from other projects
      3. Use external storage / symlinks
    prevention: "Disk space check in preconditions (100GB minimum)"

  cuda_not_available:
    cause: "No NVIDIA GPU or CUDA drivers not installed"
    detection: "torch.cuda.is_available() returns False"
    recovery: |
      1. Install/update NVIDIA drivers
      2. Install CUDA toolkit
      3. Install PyTorch with CUDA support
      4. On macOS: use MPS backend (if Apple Silicon)
    prevention: "GPU check in preconditions"

  node_compatibility_issue:
    cause: "Custom node incompatible with ComfyUI version"
    detection: "ImportError or AttributeError on startup"
    recovery: |
      1. Pin node to specific git commit (known working)
      2. Update ComfyUI to latest version
      3. Check node's GitHub issues for fixes
    prevention: "Use known compatible versions"

  comfyui_startup_crash:
    cause: "Conflicting nodes or corrupted installation"
    detection: "ComfyUI process exits immediately"
    recovery: |
      1. Start with --disable-all-custom-nodes to isolate
      2. Enable nodes one by one to find culprit
      3. Remove/reinstall problematic node
    prevention: "Install nodes in priority order, test after each"
```

---

## Integration

### Dependencies

| Component | Purpose |
|-----------|---------|
| Python 3.10+ | Runtime for ComfyUI and nodes |
| pip | Package management |
| git | Repository cloning |
| wget/curl | Model downloads |
| FFmpeg | Video validation |
| NVIDIA CUDA | GPU acceleration |

### Required By

| Task | Dependency |
|------|-----------|
| `create-video` | All generation, enhancement, and consistency tools |
| `create-shot` | ComfyUI workflow execution |
| `storyboard` | Keyframe image generation |

---

## Directory Structure Reference

After complete setup, the ComfyUI directory should contain:

```
/Users/felipegobbi/ComfyUI/
├── main.py
├── custom_nodes/
│   ├── ComfyUI-Manager/
│   ├── ComfyUI-VideoHelperSuite/
│   ├── ComfyUI-WanVideoWrapper/
│   ├── ComfyUI-AnimateDiff-Evolved/
│   │   └── models/
│   │       ├── v3_sd15_mm.ckpt
│   │       └── v3_sd15_adapter.ckpt
│   ├── ComfyUI-HunyuanVideoWrapper/
│   ├── ComfyUI_IPAdapter_plus/
│   ├── ComfyUI_InstantID/
│   ├── ComfyUI-Frame-Interpolation/
│   │   └── ckpts/rife/
│   ├── ComfyUI_essentials/
│   ├── ComfyUI-Advanced-ControlNet/
│   ├── comfyui_controlnet_aux/
│   ├── ComfyUI-KJNodes/
│   └── rgthree-comfy/
├── models/
│   ├── checkpoints/
│   │   └── sd_xl_base_1.0.safetensors
│   ├── diffusion_models/
│   │   ├── wan2.1_t2v_480p_bf16.safetensors
│   │   ├── wan2.1_i2v_480p_bf16.safetensors
│   │   └── wan2.2_t2v_720p_bf16.safetensors
│   ├── vae/
│   │   ├── wan_2.1_vae.safetensors
│   │   └── sdxl_vae.safetensors
│   ├── text_encoders/
│   │   └── umt5_xxl_enc_bf16.safetensors
│   ├── clip_vision/
│   │   ├── clip_vision_h.safetensors
│   │   └── CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors
│   ├── ipadapter/
│   │   ├── ip-adapter-faceid-plusv2_sd15.bin
│   │   ├── ip-adapter-plus_sd15.safetensors
│   │   └── ip-adapter_sdxl_vit-h.safetensors
│   ├── upscale_models/
│   │   ├── RealESRGAN_x4plus.pth
│   │   ├── RealESRGAN_x4plus_anime_6B.pth
│   │   └── 4x-UltraSharp.pth
│   └── insightface/
│       └── models/
│           ├── buffalo_l/
│           └── antelopev2/
└── installation_report.yaml
```

---

## Heuristics Reference

| Heuristic ID | Name | Step | Blocking |
|--------------|------|------|----------|
| VC_SETUP_001 | Node Installation Check | Step 1 | Yes |
| VC_SETUP_002 | Model Download Check | Step 2 | Yes (critical models) |
| VC_SETUP_003 | Startup Verification | Step 3 | Yes |
| VC_SETUP_004 | Test Generation Check | Step 4 | No (warning only) |

---

## Validation Checklist (HO-TP-001)

### Mandatory Fields Check

- [x] `task_name` follows "Verb + Object" format: "Setup ComfyUI Environment"
- [x] `status` is one of: pending | in_progress | completed
- [x] `responsible_executor` is clearly specified: @video-creation:comfyui-operator
- [x] `execution_type` is one of: Human | Agent | Hybrid | Worker
- [x] `input` array has at least 1 item (1 required + 4 optional)
- [x] `output` array has at least 1 item (2 primary + 1 secondary)
- [x] `action_items` has clear, actionable steps (4 steps, 24+ substeps)
- [x] `acceptance_criteria` has measurable criteria (10 criteria)

### Quality Check

- [x] Task is focused (ComfyUI environment setup only)
- [x] Inputs are well-defined with types and defaults
- [x] Outputs match acceptance criteria
- [x] Action items are sequential and executable
- [x] Executor type matches task nature (Worker for deterministic setup)
- [x] Error handling covers all major failure modes
- [x] Complete directory structure reference provided

---

_Task Version: 1.0.0_
_Pattern: HO-TP-001 (Task Anatomy Standard)_
_Last Updated: 2026-02-06_
_Squad: video-creation_
_Lines: 300+_
_Compliant: Yes_
