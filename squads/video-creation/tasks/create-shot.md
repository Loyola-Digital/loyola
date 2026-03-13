# Task: Create Shot

**Task ID:** `create-shot`
**Pattern:** HO-TP-001 (Task Anatomy Standard)
**Version:** 1.0.0
**Last Updated:** 2026-02-06

---

## Task Anatomy

| Field | Value |
|-------|-------|
| **task_name** | Create Single Shot |
| **status** | `pending` |
| **responsible_executor** | @video-creation:comfyui-operator |
| **execution_type** | `Agent` |
| **input** | shot_description, model_choice, resolution, duration, style_reference |
| **output** | shot_video.mp4, comfyui_workflow.json |
| **action_items** | 4 phases, 18+ steps |
| **acceptance_criteria** | 8 criteria |

**Estimated Time:** 15-60m (depends on complexity and retry count)

---

## Executor Specification

| Attribute | Value |
|-----------|-------|
| **Type** | Agent |
| **Pattern** | HO-EP-002 |
| **Executor** | @video-creation:comfyui-operator |
| **Rationale** | Shot generation is a well-defined process: decompose description into prompt, configure workflow, execute, evaluate. AI can handle the full loop autonomously with quality thresholds. |

### Executor Selection Criteria

- Task is **pattern-based**: follows a repeatable prompt crafting and generation workflow
- Output is **evaluable**: quality can be assessed against clear criteria (motion, visual fidelity, prompt adherence)
- Retry logic is **deterministic**: adjust parameters and re-generate on failure
- Human review is not required per-shot (done at pipeline level in create-video consistency phase)

### Fallback

| Trigger | Fallback |
|---------|----------|
| 3+ failed generation attempts | Escalate to Hybrid (human prompt adjustment) |
| Model crashes repeatedly | Switch to alternative model |
| Output quality persistently low | Human manual ComfyUI operation |

---

## Overview

This task generates a single video shot from a textual description using ComfyUI. It is the atomic unit of video generation - the `create-video` pipeline calls this task once per shot in its shot list.

The task handles the full lifecycle of a single shot:
1. Craft an optimized prompt from the shot description
2. Select and configure the appropriate ComfyUI workflow
3. Execute generation with quality monitoring and retry logic
4. Refine the output (upscale, fix artifacts)

```
INPUT (shot_description + model + resolution + duration + style)
    |
[PHASE 1: PROMPT CRAFTING]
    | Decompose concept into model-optimized prompt
    | Build positive and negative prompts
    | Apply style tokens
    |
    v
[PHASE 2: WORKFLOW SETUP]
    | Select ComfyUI workflow template
    | Configure nodes and parameters
    | Load models and checkpoints
    |
    v
[PHASE 3: GENERATION]
    | Queue workflow in ComfyUI
    | Monitor progress
    | Review output quality
    | Iterate if needed (max 3 attempts)
    |
    v
[PHASE 4: REFINEMENT]
    | Upscale if below target resolution
    | Fix detected artifacts
    | Apply temporal smoothing
    |
    v
OUTPUT (shot_video.mp4 + comfyui_workflow.json)
```

---

## Input

### Required Inputs

- **shot_description** (`string | object`)
  - Description: Complete description of what the shot should contain
  - Source: User input or shot_list.yaml from create-video pipeline
  - Required: Yes
  - Validation: Minimum 20 characters
  - Format (object):
    ```yaml
    shot:
      id: "shot_001"
      description: "Wide establishing shot of neon-lit cityscape at night"
      camera:
        angle: "wide"
        movement: "slow pan right"
      subject: "City skyline"
      action: "Static environment with moving traffic and flickering neon signs"
      environment: "Cyberpunk city with towering skyscrapers and holographic billboards"
      lighting: "Night, neon lights (teal, magenta, orange), volumetric fog"
    ```

- **model_choice** (`string`)
  - Description: Which generation model to use
  - Source: User input or generation_strategy from create-video
  - Required: Yes
  - Options:
    | Model | Best For | Native Resolution | Native FPS | Max Duration |
    |-------|----------|-------------------|------------|--------------|
    | `wan2.1` | General purpose T2V/I2V | 832x480 | 16fps | 5s |
    | `wan2.2` | Higher resolution | 1280x720 | 16fps | 5s |
    | `hunyuan` | Realistic motion | 848x480 | 24fps | 6s |
    | `ltx-video` | Fast generation | 768x512 | 24fps | 5s |
    | `animatediff` | Style consistency | 512x512 | 8fps | 3s |
  - Default: `"wan2.1"`

- **resolution** (`string`)
  - Description: Target output resolution for this shot
  - Source: User input or project config
  - Required: Yes
  - Options: `"native"`, `"720p"`, `"1080p"`, `"2K"`, `"4K"`
  - Default: `"1080p"`
  - Note: Shot is generated at model native resolution and upscaled to target

- **duration** (`number`)
  - Description: Target duration in seconds
  - Source: User input or shot_list.yaml
  - Required: Yes
  - Validation: Minimum 1s, maximum 10s per generation (longer shots require stitching)
  - Default: `4`

- **style_reference** (`string | file`)
  - Description: Visual style reference (text description or image file)
  - Source: User input or style_guide.yaml from create-video
  - Required: Yes
  - Validation: If string, minimum 20 characters. If file, must be .png/.jpg/.webp
  - Example: `"Cyberpunk aesthetic, neon-lit, Blade Runner 2049 cinematography, teal and orange palette, shallow depth of field"`

### Optional Inputs

- **character_reference** (`object`)
  - Description: Character reference for IP-Adapter consistency
  - Required: No (only if character appears in shot)
  - Format:
    ```yaml
    character:
      name: "Detective Mira"
      ip_adapter_embed: "refs/ip_adapter_embeds/mira.safetensors"
      ip_adapter_weight: 0.85
      face_reference: "refs/characters/mira/face_front.png"
    ```

- **seed** (`number`)
  - Description: Random seed for reproducibility
  - Required: No
  - Default: Random

- **cfg_scale** (`number`)
  - Description: Classifier-Free Guidance scale
  - Required: No
  - Default: Model-dependent (typically 5.0-7.0)

- **steps** (`number`)
  - Description: Number of sampling steps
  - Required: No
  - Default: Model-dependent (typically 20-30)

- **sampler** (`string`)
  - Description: Sampling algorithm
  - Required: No
  - Options: `"euler"`, `"euler_a"`, `"dpm++_2m"`, `"dpm++_2m_karras"`, `"uni_pc"`
  - Default: `"euler_a"`

- **source_image** (`file`)
  - Description: Source image for I2V (Image-to-Video) generation
  - Required: No (only for I2V mode)
  - Validation: Must be .png or .jpg, resolution should match model input

- **negative_prompt_extra** (`string`)
  - Description: Additional negative prompt tokens to append
  - Required: No

---

## Output

### Primary Outputs

- **shot_video.mp4** (`file`)
  - Description: The generated video shot, optionally upscaled and refined
  - Format: H.264 MP4
  - Destination: `shots/shot_{id}/shot_video.mp4`
  - Quality: At target resolution and frame rate

- **comfyui_workflow.json** (`file`)
  - Description: The exact ComfyUI workflow used, including all parameters, for reproducibility
  - Format: ComfyUI API JSON format
  - Destination: `shots/shot_{id}/comfyui_workflow.json`
  - Contains: All node configurations, model selections, prompt text, seed, steps, CFG

### Secondary Outputs

- **prompt.txt** (`file`)
  - Description: The final positive and negative prompts used
  - Destination: `shots/shot_{id}/prompt.txt`

- **metadata.yaml** (`file`)
  - Description: Generation metadata including timing, attempts, quality scores
  - Destination: `shots/shot_{id}/metadata.yaml`
  - Format:
    ```yaml
    metadata:
      shot_id: "shot_001"
      model: "wan2.1"
      seed: 42
      steps: 25
      cfg_scale: 6.0
      sampler: "euler_a"
      native_resolution: "832x480"
      output_resolution: "1920x1080"
      native_fps: 16
      output_fps: 24
      duration_seconds: 4
      frame_count: 96
      generation_time: "45s"
      attempts: 1
      quality_score: 8.5
      upscaled: true
      refined: true
    ```

- **raw.mp4** (`file`)
  - Description: Raw generation output before any refinement
  - Destination: `shots/shot_{id}/raw.mp4`

---

## Preconditions

- [ ] ComfyUI is running at `/Users/felipegobbi/ComfyUI` (accessible at localhost:8188)
- [ ] Selected model is downloaded and available in ComfyUI
- [ ] Required custom nodes installed (VideoHelperSuite, model-specific wrapper)
- [ ] If IP-Adapter used: IP-Adapter models and embeddings available
- [ ] Sufficient VRAM for selected model and resolution
- [ ] Output directory exists or can be created

---

## Action Items

### PHASE 1: PROMPT CRAFTING

**Duration:** 2-5 minutes
**Checkpoint:** Prompt review (auto-validated)
**Heuristic:** `VC_PROMPT_001` - Prompt quality check
**Mode:** Agent (autonomous)

#### Step 1.1: Parse Shot Description

**Actions:**
```yaml
parse_description:
  description: "Extract structured information from the shot description"

  substeps:
    - action: "Extract visual elements"
      detail: |
        Parse the shot description (string or object) to identify:
        - Subject: Primary focus of the shot (who/what)
        - Action: What is happening (motion, interaction)
        - Environment: Setting, background, surroundings
        - Camera: Angle, movement, framing
        - Lighting: Light sources, quality, direction, color
        - Mood: Emotional tone, atmosphere
        - Special elements: Effects, particles, weather

    - action: "Determine generation mode"
      detail: |
        Based on parsed elements:
        - T2V (Text-to-Video): Default for most shots
          → When: No specific reference image needed
          → When: Scene can be described fully in text
        - I2V (Image-to-Video): When starting from a reference image
          → When: source_image provided
          → When: exact composition needed
          → When: character close-up requiring IP-Adapter
        - AnimateDiff: When style consistency is paramount
          → When: Abstract or stylized content
          → When: Shorter clips with specific aesthetic

  output:
    parsed_elements:
      subject: "string"
      action: "string"
      environment: "string"
      camera: "string"
      lighting: "string"
      mood: "string"
      generation_mode: "t2v | i2v | animatediff"
```

#### Step 1.2: Craft Positive Prompt

**Actions:**
```yaml
craft_positive_prompt:
  description: "Build optimized positive prompt for the selected model"

  substeps:
    - action: "Apply model-specific prompt engineering"
      detail: |
        Different models respond better to different prompt structures:

        **Wan 2.1/2.2 prompt structure:**
        ```
        [quality tokens], [subject description], [action], [environment],
        [camera angle and movement], [lighting], [style tokens]
        ```
        Example:
        ```
        masterpiece, best quality, cinematic,
        a detective woman with short black hair walks through a neon-lit alley,
        rain falling, puddles reflecting neon signs,
        medium shot tracking from the side,
        dramatic low-key lighting with teal and orange neon,
        cyberpunk aesthetic, Blade Runner style, film grain, anamorphic
        ```

        **HunyuanVideo prompt structure:**
        ```
        [detailed scene description in natural language],
        [camera description], [quality descriptors]
        ```

        **AnimateDiff prompt structure:**
        ```
        [standard SD1.5/SDXL prompt format],
        [motion descriptors added separately via motion module]
        ```

    - action: "Integrate style reference"
      detail: |
        Merge style_reference tokens into the prompt:
        1. Extract key style descriptors from style_reference
        2. Place style tokens after scene description
        3. Ensure no conflicting style instructions
        4. Add technical quality tokens:
           - "masterpiece, best quality" (for model quality guidance)
           - "cinematic, 8K, detailed" (for visual fidelity)
           - Style-specific: "film grain", "shallow depth of field", etc.

    - action: "Add camera motion tokens"
      detail: |
        Translate camera description to model-understood tokens:
        | Camera Description | Prompt Tokens |
        |-------------------|---------------|
        | Static | "static camera, locked off shot" |
        | Pan left/right | "camera panning [direction], horizontal movement" |
        | Tilt up/down | "camera tilting [direction], vertical movement" |
        | Dolly in/out | "camera moving [forward/backward], dolly shot" |
        | Tracking | "tracking shot, camera following subject" |
        | Crane | "crane shot, rising camera movement" |
        | Handheld | "handheld camera, slight shake" |

  output:
    positive_prompt: "Complete optimized positive prompt string"
```

#### Step 1.3: Craft Negative Prompt

**Actions:**
```yaml
craft_negative_prompt:
  description: "Build comprehensive negative prompt to prevent common artifacts"

  substeps:
    - action: "Apply base negative prompt"
      detail: |
        Universal negative tokens that apply to all video generation:
        ```
        worst quality, low quality, blurry, distorted, deformed,
        watermark, text, logo, signature, banner,
        extra limbs, extra fingers, mutated hands, bad anatomy,
        disfigured, poorly drawn face, mutation, ugly,
        jpeg artifacts, pixelated, noise, grain (unless wanted),
        static image, still frame, frozen,
        nsfw (unless intended), gore, violence (unless intended)
        ```

    - action: "Add model-specific negative tokens"
      detail: |
        **Wan 2.1/2.2 specific:**
        ```
        overexposed, underexposed, oversaturated,
        robotic movement, unnatural motion,
        flickering, temporal inconsistency
        ```

        **AnimateDiff specific:**
        ```
        morphing, melting, warping,
        inconsistent background, sliding camera
        ```

    - action: "Add shot-specific negative tokens"
      detail: |
        Based on shot content, add:
        - If character present: "wrong number of fingers, crossed eyes, asymmetric face"
        - If environment: "impossible architecture, floating objects"
        - If close-up: "uncanny valley, plastic skin, dead eyes"
        - Append any negative_prompt_extra from input

    - action: "Merge user extra negatives"
      detail: |
        If negative_prompt_extra provided:
        1. Append to constructed negative prompt
        2. Remove duplicates
        3. Ensure no contradictions with positive prompt

  output:
    negative_prompt: "Complete negative prompt string"
```

#### Step 1.4: Prompt Quality Validation

**Actions:**
```yaml
prompt_validation:
  description: "Validate the crafted prompt before generation"

  checks:
    - name: "Length check"
      rule: "Positive prompt between 50-500 tokens"
      action: "Trim or expand if outside range"

    - name: "Contradiction check"
      rule: "No terms appearing in both positive and negative prompts"
      action: "Remove contradictions, prioritize positive prompt intent"

    - name: "Model compatibility"
      rule: "Prompt structure matches selected model's expected format"
      action: "Restructure if needed"

    - name: "Camera motion validity"
      rule: "Camera motion tokens are supported by the model"
      action: "Simplify camera motion if model cannot handle it"

    - name: "Duration feasibility"
      rule: "Requested motion complexity is achievable in the duration"
      action: "Simplify action if duration is too short for complexity"

  output:
    - "shots/shot_{id}/prompt.txt"
    - format: |
        === POSITIVE PROMPT ===
        {positive_prompt}

        === NEGATIVE PROMPT ===
        {negative_prompt}

        === METADATA ===
        model: {model_choice}
        mode: {generation_mode}
        optimized_for: {model_choice}
        token_count_positive: {count}
        token_count_negative: {count}
```

---

### PHASE 2: WORKFLOW SETUP

**Duration:** 2-5 minutes
**Checkpoint:** Workflow validation
**Heuristic:** `VC_WF_001` - Workflow configuration check
**Mode:** Agent (autonomous)

#### Step 2.1: Select Workflow Template

**Actions:**
```yaml
select_workflow:
  description: "Choose the appropriate ComfyUI workflow template based on generation mode and model"

  decision_tree:
    - condition: "generation_mode == 't2v' AND model == 'wan2.1'"
      workflow: "workflows/wan21_t2v_base.json"
      description: "Wan 2.1 Text-to-Video base workflow"

    - condition: "generation_mode == 'i2v' AND model == 'wan2.1'"
      workflow: "workflows/wan21_i2v_base.json"
      description: "Wan 2.1 Image-to-Video workflow with image input"

    - condition: "character_reference present AND model == 'wan2.1'"
      workflow: "workflows/wan21_t2v_ipadapter.json"
      description: "Wan 2.1 T2V with IP-Adapter for character consistency"

    - condition: "generation_mode == 't2v' AND model == 'wan2.2'"
      workflow: "workflows/wan22_t2v_base.json"
      description: "Wan 2.2 higher resolution workflow"

    - condition: "model == 'hunyuan'"
      workflow: "workflows/hunyuan_t2v_base.json"
      description: "HunyuanVideo workflow"

    - condition: "model == 'ltx-video'"
      workflow: "workflows/ltxv_t2v_base.json"
      description: "LTX-Video fast generation workflow"

    - condition: "model == 'animatediff'"
      workflow: "workflows/animatediff_base.json"
      description: "AnimateDiff with motion module workflow"

  fallback: "workflows/wan21_t2v_base.json"
```

#### Step 2.2: Configure Workflow Parameters

**Actions:**
```yaml
configure_workflow:
  description: "Set all node parameters in the selected workflow"

  substeps:
    - action: "Set core generation parameters"
      detail: |
        Configure the sampler/generation nodes:
        ```yaml
        generation_params:
          positive_prompt: "{from Phase 1}"
          negative_prompt: "{from Phase 1}"
          seed: "{from input or random}"
          steps: "{from input or model default}"
          cfg_scale: "{from input or model default}"
          sampler: "{from input or model default}"
          scheduler: "normal"  # or karras for some samplers
        ```

    - action: "Set resolution and frame parameters"
      detail: |
        Configure video dimensions and duration:
        ```yaml
        video_params:
          width: "{model native width}"
          height: "{model native height}"
          # Frame count = duration * model_native_fps
          frame_count: "{duration * model_fps}"
          # Wan 2.1: must be multiple of 4, plus 1
          # frame_count formula: (duration_seconds * 16) + 1
        ```

        Resolution mapping:
        | Model | Width | Height | FPS |
        |-------|-------|--------|-----|
        | wan2.1 | 832 | 480 | 16 |
        | wan2.2 | 1280 | 720 | 16 |
        | hunyuan | 848 | 480 | 24 |
        | ltx-video | 768 | 512 | 24 |
        | animatediff | 512 | 512 | 8 |

    - action: "Configure IP-Adapter nodes (if applicable)"
      detail: |
        If character_reference provided:
        ```yaml
        ip_adapter_params:
          model: "ip-adapter-faceid-plusv2_sd15.bin"
          weight: "{character.ip_adapter_weight or 0.85}"
          weight_type: "linear"
          start_at: 0.0
          end_at: 1.0
          face_image: "{character.face_reference}"
          embed_file: "{character.ip_adapter_embed}"
        ```

    - action: "Configure model-specific nodes"
      detail: |
        Wan 2.1/2.2 specific:
        ```yaml
        wan_params:
          model_path: "models/wan2.1_t2v.safetensors"
          vae_path: "models/wan2.1_vae.safetensors"
          clip_path: "models/umt5_xxl_enc.safetensors"
          # For I2V additionally:
          clip_vision: "models/clip_vision_h.safetensors"
          image_input: "{source_image path}"
        ```

    - action: "Configure output nodes"
      detail: |
        Set VideoHelperSuite output:
        ```yaml
        output_params:
          filename_prefix: "shot_{id}"
          format: "video/h264-mp4"
          frame_rate: "{model native fps}"
          save_output: true
          output_dir: "shots/shot_{id}/"
        ```

  output:
    workflow_configured: true
    config_summary:
      model: "{model_choice}"
      resolution: "{width}x{height}"
      frames: "{frame_count}"
      steps: "{steps}"
      cfg: "{cfg_scale}"
      sampler: "{sampler}"
```

#### Step 2.3: Validate Workflow Configuration

**Actions:**
```yaml
validate_workflow:
  description: "Verify workflow is valid before execution"

  checks:
    - name: "Model files exist"
      check: "All referenced model files exist in ComfyUI models directory"
      on_fail: "Error: Missing model file. Run setup-comfyui task."

    - name: "Node types available"
      check: "All custom node types in workflow are installed"
      on_fail: "Error: Missing custom node. Run setup-comfyui task."

    - name: "VRAM estimate"
      check: "Estimated VRAM usage <= available VRAM"
      on_fail: "Warning: May exceed VRAM. Enable tiled processing or reduce resolution."

    - name: "Parameter ranges valid"
      check: "All parameters within valid ranges for the selected model"
      on_fail: "Error: Invalid parameter. Correct to valid range."

    - name: "Frame count valid"
      check: "Frame count meets model requirements (e.g., Wan needs multiple of 4 + 1)"
      on_fail: "Adjust frame count to nearest valid value."
```

---

### PHASE 3: GENERATION

**Duration:** 5-30 minutes per attempt (model and hardware dependent)
**Checkpoint:** `CP_SHOT_GEN` - Shot quality evaluation
**Heuristic:** `VC_SHOTGEN_001` - Single shot quality gate
**Mode:** Agent with automated retry

#### Step 3.1: Execute Generation

**Actions:**
```yaml
execute_generation:
  description: "Queue and run the generation workflow in ComfyUI"

  substeps:
    - action: "Submit workflow to ComfyUI API"
      detail: |
        1. Serialize configured workflow to JSON
        2. POST to ComfyUI API: http://localhost:8188/prompt
        3. Receive prompt_id for tracking
        4. Save workflow JSON to shots/shot_{id}/comfyui_workflow.json

    - action: "Monitor generation progress"
      detail: |
        Connect to ComfyUI WebSocket: ws://localhost:8188/ws
        Monitor events:
        - execution_start: Generation began
        - executing: {node_id} - Currently processing node
        - progress: {value, max} - Sampling progress
        - executed: Node completed
        - execution_complete: All nodes finished

        Display progress:
        ```
        [shot_001] Generating... Step 12/25 (48%)
        [shot_001] Estimated time remaining: 35s
        ```

    - action: "Retrieve generated output"
      detail: |
        1. On execution_complete:
        2. GET output files from ComfyUI output directory
        3. Move to shots/shot_{id}/raw.mp4
        4. Verify file is valid video (check with FFprobe)
        5. Extract frame count and duration for validation

  timeout: "5m per generation (model-dependent)"
  on_timeout: "Kill job, log error, count as failed attempt"
```

#### Step 3.2: Evaluate Shot Quality

**Actions:**
```yaml
evaluate_quality:
  description: "Assess the quality of the generated shot"

  evaluation_criteria:
    - criterion: "Motion Quality"
      weight: 0.25
      checks:
        - "Movement is natural and smooth"
        - "No jittering or micro-stuttering"
        - "Motion matches described action"
        - "Camera movement matches specified direction"
      scoring:
        9-10: "Excellent - natural, cinematic motion"
        7-8: "Good - minor motion artifacts"
        5-6: "Acceptable - noticeable but not distracting issues"
        3-4: "Poor - distracting motion problems"
        1-2: "Fail - broken or nonsensical motion"

    - criterion: "Visual Quality"
      weight: 0.25
      checks:
        - "No obvious distortion or warping"
        - "Clean textures without artifacts"
        - "Correct anatomy (if characters present)"
        - "Consistent detail level throughout"
      scoring:
        9-10: "Excellent - clean, detailed, no artifacts"
        7-8: "Good - minor imperfections"
        5-6: "Acceptable - some artifacts but passable"
        3-4: "Poor - significant visual issues"
        1-2: "Fail - severe distortion or corruption"

    - criterion: "Prompt Adherence"
      weight: 0.30
      checks:
        - "Scene matches description"
        - "Subject is correct"
        - "Environment matches"
        - "Lighting matches description"
        - "Camera angle matches specification"
      scoring:
        9-10: "Excellent - exact match to description"
        7-8: "Good - captures essence with minor deviations"
        5-6: "Acceptable - partially matches"
        3-4: "Poor - significant deviations"
        1-2: "Fail - does not match description at all"

    - criterion: "Temporal Consistency"
      weight: 0.20
      checks:
        - "No flickering between frames"
        - "Objects maintain shape across frames"
        - "Colors stable throughout"
        - "Background consistent"
      scoring:
        9-10: "Excellent - rock solid consistency"
        7-8: "Good - minor fluctuations"
        5-6: "Acceptable - some flickering"
        3-4: "Poor - distracting inconsistency"
        1-2: "Fail - severe temporal artifacts"

  overall_score_calculation: "weighted_average(criteria_scores)"

  thresholds:
    PASS: ">= 7.0"
    MARGINAL: ">= 5.5 AND < 7.0"
    FAIL: "< 5.5"

  output:
    quality_assessment:
      motion_quality: "{score}"
      visual_quality: "{score}"
      prompt_adherence: "{score}"
      temporal_consistency: "{score}"
      overall_score: "{weighted_average}"
      verdict: "PASS | MARGINAL | FAIL"
      notes: "Specific observations"
```

#### Step 3.3: Retry on Failure

**Actions:**
```yaml
retry_logic:
  description: "Adjust parameters and re-generate if quality check fails"

  max_attempts: 3

  attempt_1_adjustments:
    description: "Change seed and minor parameter tweaks"
    actions:
      - "Change seed to random new value"
      - "If prompt adherence low: make prompt more specific and direct"
      - "If motion quality low: adjust CFG scale (+/- 0.5)"
      - "If visual quality low: increase steps by 5"

  attempt_2_adjustments:
    description: "More significant parameter changes"
    actions:
      - "Change seed again"
      - "Switch sampler (e.g., euler_a -> dpm++_2m_karras)"
      - "Adjust CFG more aggressively (+/- 1.0)"
      - "If character issue: adjust IP-Adapter weight"
      - "If persistent motion issue: reduce motion complexity in prompt"
      - "If persistent visual issue: add more quality tokens"

  attempt_3_adjustments:
    description: "Last resort - significant changes"
    actions:
      - "Try completely different seed range"
      - "Consider switching generation mode (T2V <-> I2V)"
      - "Simplify prompt significantly"
      - "If still failing: flag for human intervention"

  between_attempts:
    - "Log previous attempt parameters and quality scores"
    - "Document what was changed and why"
    - "Save failed attempt raw output for reference"

  on_all_attempts_failed:
    - "Save all attempt data"
    - "Generate failure report"
    - "Flag shot for human creative intervention"
    - "Return with status FAILED and all attempt metadata"

  output:
    attempt_log:
      - attempt: 1
        seed: 42
        quality_score: 4.8
        verdict: "FAIL"
        reason: "Poor motion quality - subject morphing"
        adjustments: "Changed seed, increased steps"
      - attempt: 2
        seed: 1337
        quality_score: 7.2
        verdict: "PASS"
```

---

### PHASE 4: REFINEMENT

**Duration:** 3-15 minutes
**Checkpoint:** Final output validation
**Heuristic:** `VC_REFINE_001` - Refinement quality check
**Mode:** Agent (autonomous)

#### Step 4.1: Upscale to Target Resolution

**Actions:**
```yaml
upscale:
  description: "Upscale from model native resolution to target resolution"

  condition: "resolution != 'native'"

  substeps:
    - action: "Determine upscale factor"
      detail: |
        Calculate scale:
        | Native | Target | Scale Factor |
        |--------|--------|-------------|
        | 832x480 | 1280x720 | ~1.54x |
        | 832x480 | 1920x1080 | ~2.31x |
        | 832x480 | 2560x1440 | ~3.08x |
        | 832x480 | 3840x2160 | ~4.62x |

    - action: "Execute upscaling via ComfyUI"
      detail: |
        Use ComfyUI upscaling workflow:
        1. Load raw video frame by frame
        2. Apply Real-ESRGAN 4x upscaler per frame:
           - Model: RealESRGAN_x4plus_anime_6B (for stylized)
           - Model: RealESRGAN_x4plus (for realistic)
           - Tile size: 512 (for VRAM management)
        3. Resize to exact target resolution
        4. Reassemble frames into video
        5. Apply temporal consistency filter to prevent upscale flickering

    - action: "Validate upscaled output"
      detail: |
        - Verify output resolution matches target exactly
        - Check no frame drops occurred during upscaling
        - Verify no introduction of upscale artifacts (haloing, over-sharpening)
        - Compare key frames against raw for quality assessment

  output:
    - "shots/shot_{id}/upscaled.mp4"
```

#### Step 4.2: Artifact Removal

**Actions:**
```yaml
artifact_removal:
  description: "Detect and fix generation artifacts that survived initial quality check"

  substeps:
    - action: "Scan for common artifacts"
      detail: |
        Automated detection of:
        - Morphing/melting faces or objects
        - Temporal noise (random changing textures)
        - Edge halos from generation boundaries
        - Ghosting from frame interpolation (if applied)
        - Banding in gradients

    - action: "Apply fixes"
      detail: |
        Per artifact type:
        - Temporal noise: Apply temporal denoise filter
        - Edge halos: Apply slight Gaussian blur to edges
        - Banding: Apply dithering
        - For severe artifacts: consider masking and inpainting specific frames

    - action: "Apply temporal smoothing"
      detail: |
        Smooth micro-inconsistencies between frames:
        1. Compute optical flow between adjacent frames
        2. Apply flow-guided temporal filter
        3. Weight: subtle (preserve intentional motion)
        4. Verify smoothing did not introduce blur

  condition: "Apply if quality_score < 9.0 or specific artifacts detected"
```

#### Step 4.3: Final Shot Assembly

**Actions:**
```yaml
final_assembly:
  description: "Produce the final shot output file"

  substeps:
    - action: "Select best version"
      detail: |
        From available versions:
        1. Raw generation output
        2. Upscaled version (if upscaling performed)
        3. Artifact-removed version (if refinement applied)
        Select the highest quality version as final.

    - action: "Encode final shot"
      detail: |
        FFmpeg encoding:
        ```bash
        ffmpeg -i best_version.mp4 \
          -c:v libx264 -preset slow -crf 18 \
          -pix_fmt yuv420p \
          shots/shot_{id}/shot_video.mp4
        ```

    - action: "Generate metadata"
      detail: |
        Create shots/shot_{id}/metadata.yaml with:
        - All generation parameters
        - Quality scores per attempt
        - Processing steps applied
        - Timing information
        - File sizes

  output:
    - "shots/shot_{id}/shot_video.mp4"
    - "shots/shot_{id}/metadata.yaml"
```

---

## Acceptance Criteria

The task is complete when ALL of the following criteria are met:

- [ ] **AC-01:** shot_video.mp4 exists and is a playable video file
- [ ] **AC-02:** comfyui_workflow.json exists and is valid JSON that can reproduce the generation
- [ ] **AC-03:** Video resolution matches target resolution (or native if specified)
- [ ] **AC-04:** Video duration is within +/- 0.5s of target duration
- [ ] **AC-05:** Quality score (overall) >= 7.0 (PASS threshold)
- [ ] **AC-06:** Prompt adherence score >= 6.0 (shot matches description)
- [ ] **AC-07:** prompt.txt and metadata.yaml generated with complete information
- [ ] **AC-08:** All generation parameters recorded for reproducibility

---

## Error Handling

```yaml
error_handling:
  comfyui_connection_failed:
    cause: "ComfyUI server not running or unreachable"
    detection: "Connection refused on localhost:8188"
    recovery: "Start ComfyUI, wait 30s, retry"
    prevention: "Health check before generation"

  model_loading_failure:
    cause: "Model file corrupted or incompatible"
    detection: "Error during model loading in ComfyUI"
    recovery: "Re-download model, verify checksum, retry"
    prevention: "Checksum verification in preconditions"

  cuda_out_of_memory:
    cause: "GPU VRAM exhausted"
    detection: "CUDA OOM error from ComfyUI"
    recovery: |
      1. Reduce resolution to model minimum
      2. Enable --lowvram mode in ComfyUI
      3. Close other GPU processes
      4. Use CPU offloading for non-critical nodes
    prevention: "VRAM estimation before generation"

  generation_timeout:
    cause: "Generation taking longer than expected"
    detection: "No progress updates for 5+ minutes"
    recovery: "Kill current job, reduce steps/resolution, retry"
    prevention: "Set reasonable timeouts per model"

  invalid_output:
    cause: "Generated file is corrupted or zero-length"
    detection: "FFprobe fails to read file"
    recovery: "Re-generate with different seed"
    prevention: "Output validation immediately after generation"

  persistent_quality_failure:
    cause: "Shot consistently fails quality checks"
    detection: "3 consecutive FAIL verdicts"
    recovery: |
      1. Simplify shot description
      2. Try alternative model
      3. Try I2V with manual reference image
      4. Escalate to human operator
    prevention: "Complexity analysis in prompt crafting phase"
```

---

## Integration

### Dependencies

| Component | Purpose |
|-----------|---------|
| ComfyUI Server | Generation execution engine |
| VideoHelperSuite | Video loading/saving nodes |
| WanVideoWrapper | Wan 2.1/2.2 model wrapper |
| IP-Adapter nodes | Character consistency (optional) |
| Real-ESRGAN | Upscaling (optional, Phase 4) |
| FFmpeg | Video encoding and validation |

### Called By

| Task | Context |
|------|---------|
| `create-video` | Phase 2: Generation - called once per shot in shot list |
| Direct user invocation | Standalone single shot generation |

### Related Tasks

| Task | Relationship |
|------|-------------|
| `storyboard` | Provides shot descriptions that become input to this task |
| `setup-comfyui` | Prerequisite: ensures all models and nodes are installed |
| `create-video` | Parent pipeline that orchestrates multiple create-shot calls |

---

## Examples

### Example 1: Simple T2V Shot

```yaml
input:
  shot_description: "Wide aerial shot of a futuristic city at sunset, flying cars in the distance"
  model_choice: "wan2.1"
  resolution: "1080p"
  duration: 4
  style_reference: "Realistic sci-fi, clean lines, golden hour lighting"

result:
  attempts: 1
  quality_score: 8.2
  generation_time: "42s"
  total_time: "3m 15s"
  upscaled: true
```

### Example 2: Character Shot with IP-Adapter

```yaml
input:
  shot_description:
    description: "Close-up of detective looking at holographic display"
    camera:
      angle: "close-up"
      movement: "static"
    subject: "Detective Mira"
    lighting: "Blue holographic light illuminating face from below"
  model_choice: "wan2.1"
  resolution: "1080p"
  duration: 3
  style_reference: "Cyberpunk noir, moody, high contrast"
  character_reference:
    name: "Detective Mira"
    ip_adapter_embed: "refs/ip_adapter_embeds/mira.safetensors"
    ip_adapter_weight: 0.85
    face_reference: "refs/characters/mira/face_front.png"

result:
  attempts: 2
  quality_score: 7.5
  generation_time: "1m 10s"
  total_time: "5m 30s"
  notes: "First attempt had face morphing, second attempt resolved with adjusted IP-Adapter weight"
```

### Example 3: Failed Shot (Escalated)

```yaml
input:
  shot_description: "Two characters fighting in mid-air with energy blasts"
  model_choice: "wan2.1"
  resolution: "1080p"
  duration: 5
  style_reference: "Anime-inspired action, dynamic camera"

result:
  attempts: 3
  quality_score: 4.8
  status: "FAILED"
  failure_reason: "Complex multi-character action with physics exceeds model capability"
  recommendation: "Break into simpler sub-shots or use different generation approach"
```

---

## Heuristics Reference

| Heuristic ID | Name | Phase | Blocking |
|--------------|------|-------|----------|
| VC_PROMPT_001 | Prompt Quality Check | Phase 1 | No (auto-fix) |
| VC_WF_001 | Workflow Configuration Check | Phase 2 | Yes |
| VC_SHOTGEN_001 | Single Shot Quality Gate | Phase 3 | Yes |
| VC_REFINE_001 | Refinement Quality Check | Phase 4 | No (best-effort) |

---

## Validation Checklist (HO-TP-001)

### Mandatory Fields Check

- [x] `task_name` follows "Verb + Object" format: "Create Single Shot"
- [x] `status` is one of: pending | in_progress | completed
- [x] `responsible_executor` is clearly specified: @video-creation:comfyui-operator
- [x] `execution_type` is one of: Human | Agent | Hybrid | Worker
- [x] `input` array has at least 1 item (5 required + 5 optional)
- [x] `output` array has at least 1 item (2 primary + 3 secondary)
- [x] `action_items` has clear, actionable steps (4 phases, 18+ steps)
- [x] `acceptance_criteria` has measurable criteria (8 criteria)

### Quality Check

- [x] Task is atomic (single shot generation)
- [x] Inputs are well-defined with types, validation, and examples
- [x] Outputs match acceptance criteria
- [x] Action items are sequential with clear phase boundaries
- [x] Executor type matches task nature (Agent for repeatable generation)
- [x] Error handling covers all major failure modes
- [x] Integration points documented

---

_Task Version: 1.0.0_
_Pattern: HO-TP-001 (Task Anatomy Standard)_
_Last Updated: 2026-02-06_
_Squad: video-creation_
_Lines: 300+_
_Compliant: Yes_
