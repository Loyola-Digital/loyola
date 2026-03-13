# Task: Create Video

**Task ID:** `create-video`
**Pattern:** HO-TP-001 (Task Anatomy Standard)
**Version:** 1.0.0
**Last Updated:** 2026-02-06

---

## Task Anatomy

| Field | Value |
|-------|-------|
| **task_name** | Create Full Video |
| **status** | `pending` |
| **responsible_executor** | @video-creation:director (orchestrates all agents) |
| **execution_type** | `Hybrid` |
| **input** | concept/script, style_reference, character_references, target_resolution, target_duration |
| **output** | final_video.mp4, project_files/, storyboard.md |
| **action_items** | 6 phases, 35+ steps |
| **acceptance_criteria** | 12 criteria |

**Estimated Time:** 4-12h (depends on video length and complexity)

---

## Executor Specification

| Attribute | Value |
|-----------|-------|
| **Type** | Hybrid |
| **Pattern** | HO-EP-003 |
| **Executor** | @video-creation:director (AI orchestration) + Human review at checkpoints |
| **Rationale** | AI handles generation, prompt engineering, and automation; human validates creative direction, character consistency, and final quality |

### Executor Selection Criteria

- AI excels at: prompt decomposition, ComfyUI workflow configuration, batch generation, frame interpolation, upscaling
- Human required for: creative judgment on shot quality, character likeness approval, final cut sign-off
- Hybrid approach ensures: speed of AI generation with human creative oversight at critical checkpoints

### Fallback

| Trigger | Fallback |
|---------|----------|
| AI generation fails 3+ times | Human manual ComfyUI operation |
| Character consistency below threshold | Human-guided IP-Adapter tuning |
| Audio sync issues unresolvable | Human audio editing in DaVinci/Premiere |

---

## Overview

This is the **main orchestration task** for the AI Video Creation squad. It takes a concept or script and produces a complete, polished video through a 6-phase pipeline.

The pipeline follows a professional video production workflow adapted for AI-generated content:

```
INPUT (concept + style + characters + resolution + duration)
    |
[PHASE 1: PRE-PRODUCTION]
    | Script/concept analysis
    | Shot list creation
    | Character reference preparation
    | Style reference collection
    |
    v
[PHASE 2: GENERATION]
    | T2V / I2V generation per shot
    | ComfyUI workflow execution
    | Batch processing with retry logic
    |
    v
[PHASE 3: CONSISTENCY]
    | Character consistency verification
    | IP-Adapter face/body matching
    | Style coherence check across shots
    | Re-generation of inconsistent shots
    |
    v
[PHASE 4: ENHANCEMENT]
    | Frame interpolation (24fps -> 48/60fps)
    | Upscaling (to target resolution)
    | Color grading and correction
    | Artifact removal / temporal smoothing
    |
    v
[PHASE 5: AUDIO]
    | Voice generation / recording
    | Music selection / generation
    | Sound effects placement
    | Audio-video synchronization
    |
    v
[PHASE 6: DELIVERY]
    | Final render and encoding
    | Quality assurance checklist
    | Project archival
    |
    v
OUTPUT (final_video.mp4 + project_files/ + storyboard.md)
```

### Key Design Decisions

1. **Phase isolation**: Each phase produces artifacts that feed the next, enabling re-runs of individual phases without restarting the entire pipeline.
2. **Checkpoint-driven**: Every phase boundary includes a quality checkpoint. The pipeline halts on blocking failures.
3. **ComfyUI-native**: All generation and enhancement workflows execute through ComfyUI, ensuring reproducibility via saved workflow JSON files.
4. **Consistency-first**: Phase 3 exists specifically to address the biggest challenge in AI video: character and style consistency across shots.

---

## Input

### Required Inputs

- **concept_or_script** (`string | file`)
  - Description: The creative concept, narrative description, or full script for the video
  - Source: User input
  - Required: Yes
  - Validation: Must be non-empty. If file, must be .md or .txt format. Minimum 50 characters for concept, minimum 200 characters for script.
  - Example: `"A cyberpunk detective walks through neon-lit streets at night, investigating a mysterious signal. She checks her holographic wrist display, then looks up at a massive billboard flickering with corrupted data."`

- **style_reference** (`file | url | string`)
  - Description: Visual style reference for the video. Can be image files, URLs to reference images, or a textual style description.
  - Source: User input
  - Required: Yes
  - Validation: If image, must be .png, .jpg, .webp. If string, minimum 30 characters describing the visual style.
  - Example: `"Blade Runner 2049 cinematography, teal and orange color palette, shallow depth of field, anamorphic lens flares, volumetric fog"`

- **character_references** (`file[] | object`)
  - Description: Reference images and descriptions for each character in the video
  - Source: User input
  - Required: Yes (at least 1 character)
  - Validation: Each character must have at least 1 reference image OR a detailed description (100+ characters). Reference images should show face from multiple angles if available.
  - Format:
    ```yaml
    characters:
      - name: "Detective Mira"
        description: "East Asian woman, mid-30s, short black hair with cybernetic implant above left ear, sharp jawline, wears dark leather trench coat"
        reference_images:
          - "refs/mira_front.png"
          - "refs/mira_side.png"
          - "refs/mira_full_body.png"
        ip_adapter_weight: 0.85
    ```

- **target_resolution** (`string`)
  - Description: Target output resolution for the final video
  - Source: User input
  - Required: Yes
  - Validation: Must be one of the supported resolutions
  - Options: `"720p"` (1280x720), `"1080p"` (1920x1080), `"2K"` (2560x1440), `"4K"` (3840x2160)
  - Default: `"1080p"`

- **target_duration** (`string`)
  - Description: Target duration for the final video
  - Source: User input
  - Required: Yes
  - Validation: Format "Xs" or "Xm" or "Xm Ys". Minimum 5s, maximum 10m for current model capabilities.
  - Example: `"2m 30s"`

### Optional Inputs

- **music_reference** (`file | url | string`)
  - Description: Reference for background music style or specific track
  - Source: User input
  - Required: No
  - Example: `"Ambient electronic, similar to Trent Reznor's Blade Runner 2049 score"`

- **voice_reference** (`file | string`)
  - Description: Voice sample or description for narration/dialogue
  - Source: User input
  - Required: No (only needed if script has dialogue/narration)
  - Example: `"Low, gravelly female voice with slight robotic processing"`

- **aspect_ratio** (`string`)
  - Description: Target aspect ratio
  - Source: User input
  - Required: No
  - Default: `"16:9"`
  - Options: `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"21:9"`

- **fps** (`number`)
  - Description: Target frames per second
  - Source: User input
  - Required: No
  - Default: `24`
  - Options: `24`, `30`, `48`, `60`

- **model_preference** (`string`)
  - Description: Preferred generation model
  - Source: User input
  - Required: No
  - Default: `"wan2.1"` (auto-select best available)
  - Options: `"wan2.1"`, `"wan2.2"`, `"hunyuan"`, `"ltx-video"`, `"animatediff"`

---

## Output

### Primary Outputs

- **final_video.mp4** (`file`)
  - Description: The complete, rendered final video with all enhancements and audio
  - Format: H.264/H.265 MP4
  - Destination: `output/{project_name}/final_video.mp4`
  - Quality: Target resolution, target FPS, high bitrate encoding

- **project_files/** (`directory`)
  - Description: Complete project directory with all intermediate assets and workflows
  - Destination: `output/{project_name}/project_files/`
  - Structure:
    ```
    project_files/
    ├── shots/
    │   ├── shot_001/
    │   │   ├── raw.mp4                  # Raw generation output
    │   │   ├── enhanced.mp4             # After enhancement pipeline
    │   │   ├── comfyui_workflow.json     # Reproducible workflow
    │   │   ├── prompt.txt               # Generation prompt used
    │   │   └── metadata.yaml            # Shot metadata
    │   ├── shot_002/
    │   └── ...
    ├── audio/
    │   ├── voice/                       # Voice tracks
    │   ├── music/                       # Music tracks
    │   ├── sfx/                         # Sound effects
    │   └── master_audio.wav             # Final mixed audio
    ├── refs/
    │   ├── characters/                  # Character reference images
    │   ├── style/                       # Style reference images
    │   └── ip_adapter_embeds/           # Precomputed IP-Adapter embeddings
    ├── intermediate/
    │   ├── upscaled/                    # Upscaled frames/clips
    │   ├── interpolated/               # Frame-interpolated clips
    │   └── color_graded/               # Color-graded clips
    └── config/
        ├── project.yaml                 # Master project configuration
        ├── shot_list.yaml               # Complete shot list with timings
        └── render_settings.yaml         # Final render configuration
    ```

- **storyboard.md** (`file`)
  - Description: Markdown storyboard document with shot descriptions, keyframe images, and timing
  - Format: Markdown with embedded image references
  - Destination: `output/{project_name}/storyboard.md`

### Secondary Outputs

- **render_log.md** (`file`)
  - Description: Complete log of the rendering pipeline with timing, errors, and retries
  - Destination: `output/{project_name}/render_log.md`

- **quality_report.yaml** (`file`)
  - Description: Automated quality metrics for each shot and the final video
  - Destination: `output/{project_name}/quality_report.yaml`

---

## Preconditions

- [ ] ComfyUI is installed and running at `/Users/felipegobbi/ComfyUI`
- [ ] Required models are downloaded (Wan 2.1/2.2 base + VAE)
- [ ] Required custom nodes installed (VideoHelperSuite, AnimateDiff-Evolved, WanVideoWrapper)
- [ ] IP-Adapter models available for character consistency
- [ ] Sufficient disk space (minimum 50GB free for 4K projects)
- [ ] Sufficient VRAM (minimum 12GB for 1080p, 24GB recommended for 4K)
- [ ] FFmpeg installed and available in PATH
- [ ] Audio generation tools available (if voice/music needed)

---

## Action Items

### PHASE 1: PRE-PRODUCTION

**Duration:** 30-60 minutes
**Checkpoint:** `CP_PREPRODUCTION` (all pre-production artifacts validated)
**Heuristic:** `VC_PRE_001` - Pre-production completeness gate
**Mode:** Interactive (requires human creative input)

#### Step 1.1: Analyze Script/Concept

**Actions:**
```yaml
analyze_script:
  description: "Break down the script or concept into structured narrative elements"

  substeps:
    - action: "Parse input concept/script into structured format"
      detail: |
        Extract from the concept/script:
        - Setting(s): Where does the action take place?
        - Characters: Who appears? What are they doing?
        - Narrative arc: What is the story progression?
        - Mood/Tone: What emotional quality should the video convey?
        - Key moments: What are the most important visual beats?

    - action: "Identify visual complexity"
      detail: |
        Rate each narrative element on generation difficulty:
        - EASY: Static scenes, single characters, simple actions
        - MEDIUM: Character interactions, moderate motion, multiple elements
        - HARD: Complex motion, crowds, detailed environments
        - VERY HARD: Physics-dependent, extreme camera motion, face close-ups

    - action: "Determine generation strategy"
      detail: |
        Based on complexity analysis, determine:
        - Primary model for each segment (T2V vs I2V)
        - Whether reference images are needed for I2V approach
        - Whether AnimateDiff or Wan native is better per shot
        - Estimated number of generation attempts per shot

  output:
    - "script_analysis.yaml"
    - fields:
        - narrative_elements: "array of extracted elements"
        - complexity_map: "per-element difficulty rating"
        - generation_strategy: "model/approach per element"
```

#### Step 1.2: Create Shot List

**Actions:**
```yaml
create_shot_list:
  description: "Decompose the narrative into individual shots with timing and camera direction"

  substeps:
    - action: "Break narrative into shots"
      detail: |
        For each narrative beat, define:
        - shot_id: Sequential identifier (shot_001, shot_002, ...)
        - description: What happens in this shot (1-2 sentences)
        - duration: How long this shot lasts (in seconds)
        - camera: Camera angle and movement
          - angle: wide / medium / close-up / extreme close-up / bird's eye / low angle
          - movement: static / pan left-right / tilt up-down / dolly in-out / tracking / crane
        - subject: Primary subject in frame
        - action: What the subject is doing
        - environment: Background/setting details
        - lighting: Lighting description
        - transition_in: How this shot starts (cut / fade / dissolve / wipe)
        - transition_out: How this shot ends

    - action: "Validate shot timing"
      detail: |
        - Sum all shot durations
        - Compare against target_duration
        - Adjust individual shot durations if total exceeds/falls short
        - Add buffer time for transitions (0.5s per transition)
        - Validate: total_shot_time + transitions = target_duration (+/- 2s)

    - action: "Sequence optimization"
      detail: |
        Optimize shot sequence for:
        - Visual variety (alternate wide/close shots)
        - Pacing (longer shots for contemplative, shorter for action)
        - Generation feasibility (group similar style shots)
        - Transition smoothness (similar color palette between adjacent shots)

  output:
    - "shot_list.yaml"
    - format:
        shots:
          - id: "shot_001"
            description: "Wide establishing shot of neon-lit cityscape at night"
            duration_seconds: 4
            camera:
              angle: "wide"
              movement: "slow pan right"
            subject: "City skyline"
            action: "Static environment with moving traffic and flickering signs"
            environment: "Cyberpunk city, towering skyscrapers, holographic billboards"
            lighting: "Night, neon lights (teal, magenta, orange), volumetric fog"
            transition_in: "fade_in"
            transition_out: "cut"
            complexity: "MEDIUM"
            model: "wan2.1"
            generation_mode: "t2v"
```

#### Step 1.3: Prepare Character References

**Actions:**
```yaml
prepare_character_refs:
  description: "Process and optimize character reference images for IP-Adapter consistency"

  substeps:
    - action: "Process reference images"
      detail: |
        For each character:
        1. Collect all provided reference images
        2. If only text description, generate reference images first:
           - Use SDXL/Flux to generate 3-5 reference views
           - Front face, 3/4 view, side profile, full body
           - Consistent style across all reference views
        3. Crop and normalize reference images:
           - Face crops: 512x512, centered on face
           - Full body crops: 768x1024, centered on body
           - Remove backgrounds where possible
        4. Generate IP-Adapter embeddings for each character:
           - Use IP-Adapter FaceID for face consistency
           - Use IP-Adapter Plus for general appearance
           - Store embeddings for reuse across shots

    - action: "Create character reference sheet"
      detail: |
        For each character, compile:
        - Name and role
        - Physical description (for prompt engineering)
        - Reference images grid (face + body + details)
        - IP-Adapter settings (model, weight, start/end)
        - Positive prompt tokens (key descriptors)
        - Negative prompt tokens (what to avoid)

    - action: "Test character generation"
      detail: |
        Generate 2-3 test images per character to validate:
        - IP-Adapter captures likeness correctly
        - Weight settings produce natural results (not over-fitted)
        - Character works in different poses/angles
        - Style reference does not conflict with character appearance

  output:
    - "refs/characters/{character_name}/"
    - "refs/ip_adapter_embeds/{character_name}.safetensors"
    - "character_reference_sheet.md"
```

#### Step 1.4: Collect and Process Style References

**Actions:**
```yaml
process_style_refs:
  description: "Analyze and prepare style references for consistent visual treatment"

  substeps:
    - action: "Analyze style reference"
      detail: |
        Extract from style reference:
        - Color palette: Primary and secondary colors, overall tone
        - Lighting style: Hard/soft, direction, color temperature
        - Composition patterns: Rule of thirds, symmetry, leading lines
        - Texture/grain: Film grain level, digital cleanness
        - Special effects: Lens flares, bokeh, bloom, fog
        - Art direction: Realism level, stylization degree

    - action: "Create style guide YAML"
      detail: |
        Compile style parameters into machine-readable format:
        ```yaml
        style_guide:
          color_palette:
            primary: ["#1a4a5e", "#ff6b35"]
            secondary: ["#2c0735", "#00ff88"]
            overall_tone: "dark, moody, desaturated with neon accents"
          lighting:
            type: "low-key"
            color_temperature: "cool (4000K) with warm accent lights"
            volumetric: true
          lens:
            type: "anamorphic"
            focal_length: "35-85mm equivalent"
            depth_of_field: "shallow"
            flares: true
          grain:
            amount: "subtle"
            type: "film"
          post_processing:
            contrast: "high"
            saturation: "selective desaturation with vivid neons"
        ```

    - action: "Build style prompt templates"
      detail: |
        Create reusable prompt fragments for consistent styling:
        - Base style prompt: Core visual descriptors applied to every shot
        - Environment prompt: Setting-specific descriptors
        - Character prompt: Character-specific style adjustments
        - Negative prompt: Artifacts and unwanted elements to avoid

  output:
    - "refs/style/style_guide.yaml"
    - "refs/style/prompt_templates.yaml"
    - "refs/style/reference_images/"
```

#### Step 1.5: Pre-Production Checkpoint

**Checkpoint: `CP_PREPRODUCTION`**

```yaml
checkpoint_preproduction:
  heuristic_id: VC_PRE_001
  name: "Pre-Production Completeness Gate"
  blocking: true

  criteria:
    - check: "Script analysis complete"
      type: "file_exists"
      field: "script_analysis.yaml"
      required: true

    - check: "Shot list complete"
      type: "file_exists"
      field: "shot_list.yaml"
      required: true

    - check: "All shots have required fields"
      type: "schema_valid"
      field: "shot_list.yaml"
      required: true

    - check: "Total duration matches target"
      type: "numeric_range"
      field: "total_duration"
      tolerance: "2s"
      required: true

    - check: "Character references processed"
      type: "directory_exists"
      field: "refs/characters/"
      required: true

    - check: "IP-Adapter embeddings generated"
      type: "file_exists"
      field: "refs/ip_adapter_embeds/"
      required: true

    - check: "Style guide created"
      type: "file_exists"
      field: "refs/style/style_guide.yaml"
      required: true

    - check: "Prompt templates created"
      type: "file_exists"
      field: "refs/style/prompt_templates.yaml"
      required: true

  on_pass: "Proceed to PHASE 2: GENERATION"
  on_fail: "Return to failed step and remediate"

  human_review:
    required: true
    review_items:
      - "Shot list creative direction approval"
      - "Character likeness validation"
      - "Style reference approval"
    timeout: "30m"
```

---

### PHASE 2: GENERATION

**Duration:** 1-6 hours (depends on shot count and complexity)
**Checkpoint:** `CP_GENERATION` (all shots generated and reviewed)
**Heuristic:** `VC_GEN_001` - Generation quality gate
**Mode:** Autonomous with per-shot quality checks

#### Step 2.1: Configure Generation Environment

**Actions:**
```yaml
configure_generation:
  description: "Set up ComfyUI environment for batch shot generation"

  substeps:
    - action: "Verify ComfyUI is running"
      detail: |
        1. Check ComfyUI server at localhost:8188
        2. If not running, start:
           cd /Users/felipegobbi/ComfyUI
           python main.py --listen --port 8188
        3. Verify API endpoint responds
        4. Check available models match shot_list requirements

    - action: "Load base workflows"
      detail: |
        Select and load appropriate workflows:
        - T2V workflow: For shots generated purely from text
          → Wan 2.1 T2V base workflow
          → Configure: model, steps, CFG, resolution, frames
        - I2V workflow: For shots using reference images
          → Wan 2.1 I2V workflow with image input
          → Configure: model, image input, motion strength
        - IP-Adapter workflow: For character-consistent shots
          → Add IP-Adapter nodes to base workflow
          → Configure: IP-Adapter model, weight, face ID settings

    - action: "Calculate generation parameters"
      detail: |
        For each shot, determine:
        - Generation resolution (generate at native model res, upscale later)
          → Wan 2.1: 832x480 or 480x832 (landscape/portrait)
          → Wan 2.2: up to 1280x720
        - Frame count: duration_seconds * model_fps (typically 8-16fps native)
        - CFG scale: 5.0-7.0 (lower for more natural motion)
        - Steps: 20-30 (balance quality vs speed)
        - Seed: Random per shot, but save for reproducibility
```

#### Step 2.2: Generate Shots (Batch Pipeline)

**Actions:**
```yaml
generate_shots:
  description: "Execute generation for each shot in the shot list"

  substeps:
    - action: "Build per-shot prompt"
      detail: |
        For each shot in shot_list.yaml:
        1. Start with style base prompt from prompt_templates.yaml
        2. Add shot-specific description:
           - Camera angle and movement
           - Subject description
           - Action description
           - Environment details
           - Lighting specifics
        3. Add character-specific tokens if character appears
        4. Add quality tokens: "masterpiece, best quality, cinematic, 8K, detailed"
        5. Build negative prompt: "worst quality, blurry, distorted, deformed, watermark, text, logo, extra limbs, bad anatomy, static"
        6. Save complete prompt to shots/shot_{id}/prompt.txt

    - action: "Execute generation per shot"
      detail: |
        For each shot:
        1. Load appropriate ComfyUI workflow (T2V, I2V, or IP-Adapter variant)
        2. Configure workflow parameters:
           - Set prompt (positive and negative)
           - Set resolution and frame count
           - Set model and sampler settings
           - If IP-Adapter: load character embeddings, set weight
           - If I2V: load source image
        3. Queue workflow in ComfyUI
        4. Monitor progress via WebSocket API
        5. Retrieve generated frames/video
        6. Save raw output to shots/shot_{id}/raw.mp4
        7. Save workflow JSON to shots/shot_{id}/comfyui_workflow.json
        8. Save generation metadata (seed, steps, cfg, model, timing)

    - action: "Quality check per shot"
      detail: |
        For each generated shot, evaluate:
        - Motion quality: Is movement natural and smooth?
        - Visual quality: Are there obvious artifacts, distortions?
        - Prompt adherence: Does the shot match the description?
        - Character accuracy: Does the character look correct?
        - Duration: Is the clip the expected length?

        Rating system:
        - PASS: Shot meets quality standards
        - MARGINAL: Minor issues, may be fixable in enhancement
        - FAIL: Major issues, requires re-generation

        If FAIL:
        1. Adjust prompt (add specificity, reduce ambiguity)
        2. Adjust parameters (change seed, adjust CFG, change steps)
        3. Try alternative model if persistent issues
        4. Re-generate (max 3 attempts per shot)
        5. If still FAIL after 3 attempts, flag for human review

  retry_logic:
    max_attempts: 3
    between_attempts:
      - "Adjust seed"
      - "Modify prompt specificity"
      - "Try different CFG (+-1.0)"
      - "Try different sampler (Euler a -> DPM++ 2M)"
    on_max_retries_exceeded:
      - "Flag shot for manual intervention"
      - "Log all attempts with parameters"
      - "Continue with next shot"

  output:
    per_shot:
      - "shots/shot_{id}/raw.mp4"
      - "shots/shot_{id}/comfyui_workflow.json"
      - "shots/shot_{id}/prompt.txt"
      - "shots/shot_{id}/metadata.yaml"
```

#### Step 2.3: Generation Checkpoint

**Checkpoint: `CP_GENERATION`**

```yaml
checkpoint_generation:
  heuristic_id: VC_GEN_001
  name: "Generation Quality Gate"
  blocking: true

  criteria:
    - check: "All shots generated"
      type: "count_match"
      expected: "shot_list.length"
      actual: "generated_shots.length"
      required: true

    - check: "No FAIL shots remaining"
      type: "quality_check"
      condition: "all shots PASS or MARGINAL"
      required: true
      exception: "Allow up to 10% MARGINAL if total shots > 10"

    - check: "Workflow files saved for all shots"
      type: "file_exists_all"
      pattern: "shots/shot_*/comfyui_workflow.json"
      required: true

    - check: "Total raw footage >= target duration"
      type: "numeric_range"
      condition: "sum(shot_durations) >= target_duration"
      required: true

  on_pass: "Proceed to PHASE 3: CONSISTENCY"
  on_fail: "Re-generate failed shots or escalate to human review"
```

---

### PHASE 3: CONSISTENCY

**Duration:** 30-90 minutes
**Checkpoint:** `CP_CONSISTENCY` (all shots pass consistency check)
**Heuristic:** `VC_CON_001` - Character consistency verification
**Mode:** Hybrid (AI detection + human validation)

#### Step 3.1: Character Consistency Analysis

**Actions:**
```yaml
character_consistency:
  description: "Verify character appearance is consistent across all shots where they appear"

  substeps:
    - action: "Extract character frames"
      detail: |
        For each character:
        1. Identify all shots where character appears (from shot_list.yaml)
        2. Extract representative frames from each shot:
           - First clear frame of character
           - Middle frame
           - Last clear frame
        3. Crop to character region
        4. Create comparison grid image

    - action: "Compute consistency metrics"
      detail: |
        Using IP-Adapter FaceID encoder:
        1. Extract face embeddings from each frame
        2. Compare against reference embeddings
        3. Compute cosine similarity scores
        4. Flag shots where similarity < threshold (0.70)

        Metrics per shot:
        - face_similarity: Cosine similarity of face embedding vs reference
        - body_similarity: General appearance similarity
        - clothing_consistency: Whether outfit matches across shots
        - overall_score: Weighted average (face: 0.5, body: 0.3, clothing: 0.2)

    - action: "Generate consistency report"
      detail: |
        Create visual report:
        - Reference image(s) at top
        - Grid of character appearances across shots
        - Similarity scores annotated
        - Flagged shots highlighted in red
        - Overall consistency score

  thresholds:
    face_similarity: 0.70
    body_similarity: 0.60
    clothing_consistency: 0.65
    overall_score: 0.68
```

#### Step 3.2: Style Coherence Check

**Actions:**
```yaml
style_coherence:
  description: "Verify visual style is consistent across all shots"

  substeps:
    - action: "Color palette analysis"
      detail: |
        For each shot:
        1. Extract dominant colors (top 5)
        2. Compare against style_guide.yaml color palette
        3. Compute color distance (CIE Delta E)
        4. Flag shots with significant color deviation

    - action: "Lighting consistency check"
      detail: |
        Verify lighting continuity between adjacent shots:
        - Average brightness should not jump dramatically
        - Color temperature should be consistent within scenes
        - Contrast ratios should be in similar range

    - action: "Overall visual coherence"
      detail: |
        Use CLIP embeddings to compute:
        - Style similarity between each shot and style reference
        - Shot-to-shot visual flow (adjacent shots should be similar)
        - Outlier detection (shots that break visual continuity)
```

#### Step 3.3: Re-Generate Inconsistent Shots

**Actions:**
```yaml
regenerate_inconsistent:
  description: "Re-generate shots that fail consistency checks"

  substeps:
    - action: "Prepare corrected workflows"
      detail: |
        For each flagged shot:
        1. Analyze what went wrong:
           - Character face different: Increase IP-Adapter FaceID weight
           - Body/clothing different: Add IP-Adapter Plus with reference
           - Color palette off: Add style reference via IP-Adapter
           - Lighting inconsistent: Adjust prompt lighting descriptors
        2. Modify ComfyUI workflow with corrections
        3. Re-queue generation

    - action: "Re-generate with corrections"
      detail: |
        For each flagged shot:
        1. Apply corrected workflow
        2. Generate new version
        3. Re-run consistency check
        4. If still failing after 2 re-generations, flag for human decision:
           - Accept with minor inconsistency
           - Manually edit in post-processing
           - Re-approach with different generation strategy

  max_regeneration_cycles: 2
  human_escalation_threshold: 2
```

#### Step 3.4: Consistency Checkpoint

**Checkpoint: `CP_CONSISTENCY`**

```yaml
checkpoint_consistency:
  heuristic_id: VC_CON_001
  name: "Consistency Verification Gate"
  blocking: true

  criteria:
    - check: "Character consistency scores above threshold"
      type: "metric_threshold"
      condition: "all characters overall_score >= 0.68"
      required: true

    - check: "Style coherence maintained"
      type: "metric_threshold"
      condition: "color_deviation < acceptable_range"
      required: true

    - check: "Human approval for flagged shots"
      type: "human_review"
      condition: "all flagged shots reviewed and accepted/regenerated"
      required: true

  on_pass: "Proceed to PHASE 4: ENHANCEMENT"
  on_fail: "Re-generate or accept with documented exceptions"

  human_review:
    required: true
    review_items:
      - "Character consistency comparison grid"
      - "Style coherence report"
      - "Accept/reject each flagged shot"
    timeout: "30m"
```

---

### PHASE 4: ENHANCEMENT

**Duration:** 30-120 minutes (depends on resolution and shot count)
**Checkpoint:** `CP_ENHANCEMENT` (all shots enhanced and validated)
**Heuristic:** `VC_ENH_001` - Enhancement quality gate
**Mode:** Autonomous

#### Step 4.1: Frame Interpolation

**Actions:**
```yaml
frame_interpolation:
  description: "Increase frame rate from generation native to target FPS"

  substeps:
    - action: "Determine interpolation requirements"
      detail: |
        For each shot:
        - Source FPS: Typically 8-16fps from generation
        - Target FPS: From project config (24/30/48/60)
        - Interpolation factor: target_fps / source_fps
        - Method: RIFE (Real-Time Intermediate Flow Estimation)

    - action: "Run frame interpolation via ComfyUI"
      detail: |
        Use VideoHelperSuite + RIFE nodes:
        1. Load raw shot video
        2. Apply RIFE interpolation:
           - Model: RIFE 4.6 or RIFE 4.15 (best quality)
           - Multiplier: calculated interpolation factor
           - Ensemble: true (better quality, slower)
        3. Output interpolated video
        4. Verify frame count matches expected (duration * target_fps)

    - action: "Validate interpolation quality"
      detail: |
        Check for common interpolation artifacts:
        - Ghosting: Semi-transparent frames at fast motion
        - Warping: Distorted shapes during camera motion
        - Flickering: Brightness inconsistency between frames
        - If artifacts detected: try different RIFE model or reduce multiplier

  output:
    - "intermediate/interpolated/shot_{id}_interpolated.mp4"
```

#### Step 4.2: Upscaling

**Actions:**
```yaml
upscaling:
  description: "Upscale from generation resolution to target resolution"

  substeps:
    - action: "Determine upscale requirements"
      detail: |
        For each shot:
        - Source resolution: Typically 832x480 (Wan 2.1 native)
        - Target resolution: From project config (1080p, 4K, etc.)
        - Scale factor: target_width / source_width
        - Method: Topaz Video AI compatible upscaler or Real-ESRGAN

    - action: "Run upscaling via ComfyUI"
      detail: |
        Use upscaling workflow:
        1. Load interpolated shot video (frame by frame)
        2. Apply upscaler:
           - Model: RealESRGAN_x4plus or similar 4x model
           - For 2x: Use 4x model then downscale (better quality)
           - Tile size: 512 (for VRAM management)
           - Denoise strength: 0.3-0.5 (preserve detail, reduce artifacts)
        3. Optionally apply video-specific temporal consistency:
           - Use temporal smoothing between upscaled frames
           - Prevents flickering that upscaling can introduce
        4. Output upscaled video at target resolution

    - action: "Validate upscale quality"
      detail: |
        - Verify output resolution matches target
        - Check for upscaling artifacts (over-sharpening, hallucinated detail)
        - Compare against raw at same region for quality assessment
        - Ensure no frame drops or timing drift

  output:
    - "intermediate/upscaled/shot_{id}_upscaled.mp4"
```

#### Step 4.3: Color Grading

**Actions:**
```yaml
color_grading:
  description: "Apply consistent color grading across all shots per style guide"

  substeps:
    - action: "Generate base LUT from style reference"
      detail: |
        Analyze style_guide.yaml color parameters:
        1. Sample reference image color distribution
        2. Generate 3D LUT that maps neutral colors to reference palette
        3. Create adjustment curves for:
           - Lift (shadows): Teal/blue push for cyberpunk
           - Gamma (midtones): Slight desaturation
           - Gain (highlights): Warm accent for neon glow
        4. Export as .cube LUT file

    - action: "Apply color grading per shot"
      detail: |
        For each shot:
        1. Load upscaled video
        2. Apply base LUT
        3. Fine-tune per shot:
           - Match brightness to adjacent shots
           - Ensure skin tones are natural (if characters present)
           - Enhance practical lighting (neon signs, screens, etc.)
        4. Apply final look:
           - Film grain (if specified in style guide)
           - Vignette (subtle, per style)
           - Bloom/glow on bright elements

    - action: "Cross-shot color matching"
      detail: |
        Ensure color continuity:
        1. Extract average color values per shot
        2. Create smooth transition curves between shots
        3. Adjust shots that deviate from the curve
        4. Verify no harsh color jumps at cut points

  output:
    - "intermediate/color_graded/shot_{id}_graded.mp4"
    - "refs/style/color_grade.cube"
```

#### Step 4.4: Artifact Cleanup and Temporal Smoothing

**Actions:**
```yaml
artifact_cleanup:
  description: "Remove generation artifacts and smooth temporal inconsistencies"

  substeps:
    - action: "Detect and fix common artifacts"
      detail: |
        Scan each shot for:
        - Morphing/melting: Faces or objects that deform unnaturally
        - Texture flickering: Surfaces that change appearance frame-to-frame
        - Edge artifacts: Halos or fringing around subjects
        - Temporal noise: Random noise patterns that change per frame

    - action: "Apply temporal smoothing"
      detail: |
        Use temporal consistency algorithms:
        1. Optical flow-based temporal filter
        2. Denoise with temporal awareness (same region tracked across frames)
        3. Stabilize micro-jitter if present
        4. Ensure smoothing does not remove intentional motion

  output:
    - "shots/shot_{id}/enhanced.mp4"
```

#### Step 4.5: Enhancement Checkpoint

**Checkpoint: `CP_ENHANCEMENT`**

```yaml
checkpoint_enhancement:
  heuristic_id: VC_ENH_001
  name: "Enhancement Quality Gate"
  blocking: true

  criteria:
    - check: "All shots interpolated to target FPS"
      type: "metric_check"
      condition: "all shots at target_fps"
      required: true

    - check: "All shots upscaled to target resolution"
      type: "metric_check"
      condition: "all shots at target_resolution"
      required: true

    - check: "Color grading applied consistently"
      type: "visual_check"
      condition: "color continuity verified"
      required: true

    - check: "No critical artifacts remaining"
      type: "quality_check"
      condition: "no FAIL-rated artifacts"
      required: true

  on_pass: "Proceed to PHASE 5: AUDIO"
  on_fail: "Re-process failed enhancement steps"
```

---

### PHASE 5: AUDIO

**Duration:** 30-120 minutes
**Checkpoint:** `CP_AUDIO` (audio tracks mixed and synced)
**Heuristic:** `VC_AUD_001` - Audio quality and sync gate
**Mode:** Hybrid (AI generation + human validation of sync/quality)

#### Step 5.1: Voice Generation/Recording

**Actions:**
```yaml
voice_generation:
  description: "Generate or process voice tracks for narration/dialogue"

  substeps:
    - action: "Determine voice requirements"
      detail: |
        From script analysis:
        - Narration: Continuous voiceover text
        - Dialogue: Per-character lines with timing
        - No voice: Skip to Step 5.2

    - action: "Generate voice tracks"
      detail: |
        For narration/dialogue:
        1. If voice_reference provided:
           - Clone voice using reference sample
           - Generate speech from script text
        2. If no reference:
           - Select appropriate TTS model/voice
           - Generate speech with emotion/pace matching
        3. Post-process voice:
           - Normalize loudness to -16 LUFS
           - Apply de-essing if needed
           - Add subtle room reverb if appropriate
        4. Split into segments matching shot timing

    - action: "Time voice to shots"
      detail: |
        Align voice segments to shot_list timing:
        - Each voice segment starts at shot start time
        - Pad silence between segments as needed
        - Verify lip sync if characters are speaking on screen
        - Adjust speech speed if voice duration != shot duration

  output:
    - "audio/voice/narration_full.wav"
    - "audio/voice/voice_segments/"
    - "audio/voice/voice_timing.yaml"

  condition: "only if script has narration or dialogue"
```

#### Step 5.2: Music Selection/Generation

**Actions:**
```yaml
music_generation:
  description: "Create or select background music matching the video mood"

  substeps:
    - action: "Analyze music requirements"
      detail: |
        From script analysis and style guide:
        - Overall mood: What emotion should music convey?
        - Tempo: Matches video pacing
        - Genre: Fits the visual style
        - Dynamics: Where should music swell, where should it recede?
        - Duration: Match target_duration exactly

    - action: "Generate or select music"
      detail: |
        Option A: AI generation
        - Use music generation model (e.g., MusicGen, Udio)
        - Provide mood/genre/tempo parameters
        - Generate multiple candidates (3-5)
        - Select best match

        Option B: Stock music
        - Search royalty-free libraries
        - Filter by mood, tempo, duration
        - Download and trim to duration

    - action: "Music editing"
      detail: |
        1. Trim to exact target_duration
        2. Add fade-in at start (0.5-2s)
        3. Add fade-out at end (1-3s)
        4. Create dynamic mix:
           - Lower music under dialogue/narration (-12dB)
           - Swell music at dramatic moments
           - Match music transitions to shot transitions
        5. Normalize to target loudness (-20 LUFS for background)

  output:
    - "audio/music/background_music.wav"
    - "audio/music/music_mix.yaml"
```

#### Step 5.3: Sound Effects

**Actions:**
```yaml
sound_effects:
  description: "Add sound effects that match on-screen actions"

  substeps:
    - action: "Identify SFX opportunities"
      detail: |
        Review each shot for sound-worthy elements:
        - Environmental: Wind, rain, traffic, crowd noise
        - Action: Footsteps, doors, impacts, machinery
        - UI/Tech: Holographic displays, computer sounds, alerts
        - Atmospheric: Room tone, ambient hum, distant sounds

    - action: "Source and place SFX"
      detail: |
        For each identified SFX:
        1. Source appropriate sound (library or generation)
        2. Time placement to match visual action
        3. Set volume relative to scene (foreground vs background)
        4. Apply spatial positioning (left/right for panning shots)
        5. Add reverb/effects matching the environment

    - action: "Mix SFX layer"
      detail: |
        1. Layer all SFX on timeline
        2. Balance volumes (SFX should support, not dominate)
        3. Ensure no harsh transitions or jarring sounds
        4. Verify SFX timing matches video exactly

  output:
    - "audio/sfx/sfx_master.wav"
    - "audio/sfx/sfx_timeline.yaml"
```

#### Step 5.4: Final Audio Mix

**Actions:**
```yaml
audio_mix:
  description: "Combine all audio layers into final master audio track"

  substeps:
    - action: "Layer audio tracks"
      detail: |
        Combine in order of priority:
        1. Voice/dialogue (loudest, -16 LUFS)
        2. Sound effects (mid, -20 LUFS average)
        3. Music (background, -24 LUFS under dialogue, -18 LUFS alone)

    - action: "Master the mix"
      detail: |
        1. Apply overall EQ:
           - High-pass at 30Hz (remove rumble)
           - Gentle presence boost at 2-5kHz for clarity
        2. Apply compression:
           - Gentle (2:1 ratio) for dynamic control
           - Limiter at -1dBFS for safety
        3. Final loudness: -14 LUFS (streaming standard)
        4. Export as WAV (48kHz, 24-bit)

    - action: "Sync verification"
      detail: |
        1. Play audio against video at multiple points
        2. Verify voice matches lip movements (if applicable)
        3. Verify SFX aligns with visual actions
        4. Verify music transitions align with visual transitions
        5. Check for any drift over the video duration

  output:
    - "audio/master_audio.wav"
    - "audio/mix_settings.yaml"
```

#### Step 5.5: Audio Checkpoint

**Checkpoint: `CP_AUDIO`**

```yaml
checkpoint_audio:
  heuristic_id: VC_AUD_001
  name: "Audio Quality and Sync Gate"
  blocking: true

  criteria:
    - check: "Master audio duration matches video duration"
      type: "duration_match"
      tolerance: "0.1s"
      required: true

    - check: "Loudness within target range"
      type: "loudness_check"
      target: "-14 LUFS"
      tolerance: "2 LUFS"
      required: true

    - check: "No clipping detected"
      type: "peak_check"
      max_peak: "-1 dBFS"
      required: true

    - check: "Voice sync acceptable"
      type: "human_review"
      condition: "if voice present"
      required: "conditional"

  on_pass: "Proceed to PHASE 6: DELIVERY"
  on_fail: "Re-mix or re-generate problematic audio elements"

  human_review:
    required: true
    review_items:
      - "Overall audio quality"
      - "Voice-to-video sync"
      - "Music appropriateness"
      - "SFX timing"
    timeout: "15m"
```

---

### PHASE 6: DELIVERY

**Duration:** 15-45 minutes
**Checkpoint:** `CP_DELIVERY` (final render passes all quality checks)
**Heuristic:** `VC_DEL_001` - Final delivery quality gate
**Mode:** Autonomous with final human sign-off

#### Step 6.1: Final Render

**Actions:**
```yaml
final_render:
  description: "Assemble all enhanced shots with audio into final video"

  substeps:
    - action: "Assemble video timeline"
      detail: |
        Using FFmpeg:
        1. Create concat file with all enhanced shots in order
        2. Apply transitions between shots:
           - Cut: Direct splice (most common)
           - Dissolve: Cross-fade (0.5-1s)
           - Fade: Fade to/from black (for scene changes)
        3. Verify total video duration
        4. Check frame continuity at cut points

    - action: "Merge audio and video"
      detail: |
        1. Combine video assembly with master audio
        2. Verify sync at start, middle, and end
        3. Apply final audio/video alignment adjustments

    - action: "Encode final output"
      detail: |
        FFmpeg encoding settings:
        ```bash
        ffmpeg -i assembled_video.mp4 -i master_audio.wav \
          -c:v libx264 -preset slow -crf 18 \
          -c:a aac -b:a 320k \
          -pix_fmt yuv420p \
          -movflags +faststart \
          -metadata title="{project_name}" \
          output/final_video.mp4
        ```
        For H.265:
        ```bash
        ffmpeg -i assembled_video.mp4 -i master_audio.wav \
          -c:v libx265 -preset slow -crf 20 \
          -c:a aac -b:a 320k \
          -pix_fmt yuv420p10le \
          -tag:v hvc1 \
          output/final_video_h265.mp4
        ```

  output:
    - "output/{project_name}/final_video.mp4"
```

#### Step 6.2: Quality Assurance

**Actions:**
```yaml
quality_assurance:
  description: "Comprehensive quality check on the final rendered video"

  substeps:
    - action: "Technical quality check"
      detail: |
        Verify:
        - [ ] Resolution matches target_resolution
        - [ ] FPS matches target (24/30/48/60)
        - [ ] Duration matches target_duration (+/- 1s)
        - [ ] Codec is H.264 or H.265
        - [ ] Audio codec is AAC at 320kbps
        - [ ] File plays correctly in VLC/QuickTime
        - [ ] No encoding artifacts (banding, blocking, mosquito noise)
        - [ ] File size is reasonable for resolution/duration

    - action: "Creative quality check"
      detail: |
        Review:
        - [ ] Story/narrative flows logically
        - [ ] Shot transitions are smooth
        - [ ] Character consistency maintained throughout
        - [ ] Style/mood is consistent
        - [ ] Pacing feels appropriate
        - [ ] Audio enhances rather than distracts
        - [ ] No jarring cuts or visual discontinuities

    - action: "Generate quality report"
      detail: |
        Create quality_report.yaml:
        ```yaml
        quality_report:
          project: "{project_name}"
          date: "{timestamp}"
          technical:
            resolution: "1920x1080"
            fps: 24
            duration: "2:30"
            codec: "H.264"
            bitrate: "15 Mbps"
            file_size: "280 MB"
          per_shot_quality:
            - shot_id: "shot_001"
              generation_quality: 8.5
              consistency_score: 0.92
              enhancement_quality: 9.0
          overall_score: 8.7
          issues: []
          recommendations: []
        ```

  output:
    - "output/{project_name}/quality_report.yaml"
```

#### Step 6.3: Generate Storyboard Document

**Actions:**
```yaml
generate_storyboard:
  description: "Compile final storyboard document with keyframes and metadata"

  substeps:
    - action: "Extract keyframes from final shots"
      detail: |
        For each shot:
        1. Extract first frame as keyframe image
        2. Save as PNG at 1280x720
        3. Generate thumbnail at 320x180

    - action: "Compile storyboard.md"
      detail: |
        Create markdown document with:
        - Project title and description
        - Style reference images
        - Character reference sheets
        - Shot-by-shot breakdown:
          - Keyframe image
          - Shot description
          - Camera information
          - Duration and timing
          - Generation parameters
          - Quality score

  output:
    - "output/{project_name}/storyboard.md"
    - "output/{project_name}/keyframes/"
```

#### Step 6.4: Project Archival

**Actions:**
```yaml
project_archival:
  description: "Archive all project files for reproducibility"

  substeps:
    - action: "Organize project structure"
      detail: |
        Ensure project_files/ structure is complete:
        - All shot directories with raw + enhanced + workflows
        - All audio files and mix settings
        - All reference files
        - All configuration files
        - Render log and quality report

    - action: "Generate render log"
      detail: |
        Create render_log.md documenting:
        - Total pipeline duration
        - Per-phase timing
        - Models used
        - Parameters per shot
        - Re-generation history
        - Issues encountered and resolutions

    - action: "Create project manifest"
      detail: |
        Create project.yaml:
        ```yaml
        project:
          name: "{project_name}"
          created: "{timestamp}"
          pipeline_version: "1.0.0"
          total_duration: "{pipeline_duration}"
          inputs:
            concept: "{concept_summary}"
            style: "{style_summary}"
            target_resolution: "{resolution}"
            target_duration: "{duration}"
          output:
            final_video: "final_video.mp4"
            file_size: "{size}"
            quality_score: "{score}"
          models_used:
            generation: ["wan2.1"]
            upscaling: ["RealESRGAN_x4plus"]
            interpolation: ["RIFE 4.15"]
            ip_adapter: ["ip-adapter-faceid-plusv2"]
          shots_generated: {total_shots}
          shots_regenerated: {regen_count}
          total_generation_time: "{gen_time}"
        ```

  output:
    - "output/{project_name}/render_log.md"
    - "output/{project_name}/project_files/config/project.yaml"
```

#### Step 6.5: Delivery Checkpoint (Final)

**Checkpoint: `CP_DELIVERY`**

```yaml
checkpoint_delivery:
  heuristic_id: VC_DEL_001
  name: "Final Delivery Quality Gate"
  blocking: true

  criteria:
    - check: "Final video exists and is playable"
      type: "file_playable"
      field: "final_video.mp4"
      required: true

    - check: "Resolution matches target"
      type: "resolution_match"
      required: true

    - check: "Duration matches target"
      type: "duration_match"
      tolerance: "2s"
      required: true

    - check: "Quality report generated"
      type: "file_exists"
      field: "quality_report.yaml"
      required: true

    - check: "Quality score above minimum"
      type: "numeric_threshold"
      field: "overall_score"
      minimum: 7.0
      required: true

    - check: "Storyboard generated"
      type: "file_exists"
      field: "storyboard.md"
      required: true

    - check: "Project files archived"
      type: "directory_structure"
      field: "project_files/"
      required: true

  on_pass: "DELIVERY COMPLETE - Video ready"
  on_fail: "Identify and fix quality issues"

  human_review:
    required: true
    review_items:
      - "Watch complete final video"
      - "Approve creative quality"
      - "Sign-off on delivery"
    timeout: "60m"
```

---

## Acceptance Criteria

The task is complete when ALL of the following criteria are met:

- [ ] **AC-01:** Final video file (final_video.mp4) exists and is playable in standard video players
- [ ] **AC-02:** Video resolution matches target_resolution specified in input
- [ ] **AC-03:** Video duration matches target_duration within +/- 2 seconds
- [ ] **AC-04:** Video FPS matches specified framerate (default 24fps)
- [ ] **AC-05:** Character consistency score >= 0.68 across all shots containing the same character
- [ ] **AC-06:** All shots have associated ComfyUI workflow JSON files for reproducibility
- [ ] **AC-07:** Audio is properly synced with video (if audio track present)
- [ ] **AC-08:** Storyboard.md document generated with keyframes for each shot
- [ ] **AC-09:** Project files directory contains all intermediate assets organized per specification
- [ ] **AC-10:** Quality report (quality_report.yaml) shows overall score >= 7.0/10
- [ ] **AC-11:** All 6 phase checkpoints passed (CP_PREPRODUCTION, CP_GENERATION, CP_CONSISTENCY, CP_ENHANCEMENT, CP_AUDIO, CP_DELIVERY)
- [ ] **AC-12:** Human sign-off received at final delivery checkpoint

---

## Error Handling

### Common Errors and Recovery

```yaml
error_handling:
  comfyui_not_running:
    cause: "ComfyUI server not started or crashed"
    detection: "Connection refused on localhost:8188"
    recovery: |
      1. Check if process is running: ps aux | grep comfyui
      2. Restart: cd /Users/felipegobbi/ComfyUI && python main.py --listen
      3. Wait 30s for model loading
      4. Retry failed operation
    prevention: "Health check at pipeline start"

  out_of_vram:
    cause: "GPU memory exhausted during generation"
    detection: "CUDA out of memory error"
    recovery: |
      1. Reduce batch size to 1
      2. Lower resolution temporarily
      3. Close other GPU-consuming applications
      4. Use --lowvram flag in ComfyUI
      5. For 4K upscaling: use tiled processing
    prevention: "VRAM estimation before generation start"

  model_not_found:
    cause: "Required model file missing from ComfyUI models directory"
    detection: "FileNotFoundError or model loading failure"
    recovery: |
      1. Run setup-comfyui task to verify installation
      2. Download missing model
      3. Verify model placement in correct directory
    prevention: "Model availability check in preconditions"

  generation_quality_persistent_fail:
    cause: "Shot consistently generates below quality threshold after max retries"
    detection: "3 consecutive FAIL ratings for same shot"
    recovery: |
      1. Simplify the shot description
      2. Break complex shot into simpler sub-shots
      3. Try different generation model
      4. Try I2V approach with manually created reference image
      5. Escalate to human for creative direction change
    prevention: "Complexity analysis in pre-production flags potential issues"

  character_consistency_unresolvable:
    cause: "IP-Adapter cannot maintain character consistency for specific shot"
    detection: "Consistency score < 0.50 after 2 regeneration cycles"
    recovery: |
      1. Try different IP-Adapter weight (higher/lower)
      2. Try different IP-Adapter model variant
      3. Use ControlNet pose guidance + IP-Adapter combination
      4. Accept inconsistency and note in quality report
      5. Consider cutting the problematic shot
    prevention: "Test character generation in pre-production"

  audio_sync_drift:
    cause: "Audio and video desynchronize over long durations"
    detection: "Visible lip-sync mismatch or SFX timing offset"
    recovery: |
      1. Re-measure exact video duration with FFprobe
      2. Stretch/compress audio to match exactly
      3. Re-render with corrected audio
    prevention: "Use frame-accurate timing throughout pipeline"

  disk_space_exhaustion:
    cause: "Intermediate files consume all available disk space"
    detection: "Write failure or 'no space left on device'"
    recovery: |
      1. Delete intermediate files from completed phases
      2. Compress large files
      3. Move project to larger drive
    prevention: "Disk space check in preconditions (50GB minimum)"
```

---

## Integration

### Dependencies

| Component | Purpose | Location |
|-----------|---------|----------|
| ComfyUI | Generation engine | `/Users/felipegobbi/ComfyUI` |
| FFmpeg | Video encoding/decoding | System PATH |
| VideoHelperSuite | ComfyUI video nodes | ComfyUI custom_nodes |
| WanVideoWrapper | Wan 2.1/2.2 support | ComfyUI custom_nodes |
| AnimateDiff-Evolved | Animation generation | ComfyUI custom_nodes |
| IP-Adapter | Character consistency | ComfyUI custom_nodes |
| RIFE | Frame interpolation | ComfyUI custom_nodes |
| Real-ESRGAN | Upscaling | ComfyUI custom_nodes |

### Related Tasks

| Task | Relationship | Usage |
|------|-------------|-------|
| `create-shot` | Sub-task | Called per shot in Phase 2 |
| `storyboard` | Sub-task | Can be called standalone or as part of Phase 1 |
| `setup-comfyui` | Prerequisite | Must complete before first video creation |

### Agent Collaboration

| Agent | Role in Pipeline |
|-------|-----------------|
| @video-creation:director | Orchestrates full pipeline, makes creative decisions |
| @video-creation:prompt-engineer | Crafts generation prompts (Phase 1-2) |
| @video-creation:comfyui-operator | Manages ComfyUI workflows (Phase 2-4) |
| @video-creation:audio-engineer | Handles all audio (Phase 5) |
| @video-creation:qa | Quality checks at each checkpoint |

---

## Examples

### Example 1: Short Cinematic Clip

```yaml
input:
  concept: "A lone astronaut discovers an ancient alien structure on Mars. She approaches cautiously, her reflection visible in the smooth obsidian surface."
  style_reference: "2001: A Space Odyssey meets The Martian - clean, realistic sci-fi with vast landscapes"
  character_references:
    - name: "Astronaut Chen"
      description: "Chinese woman, 40s, weathered face, determined expression, NASA-style EVA suit"
      reference_images: ["refs/chen_front.png"]
  target_resolution: "1080p"
  target_duration: "30s"

output:
  shots_generated: 6
  total_pipeline_time: "2h 15m"
  quality_score: 8.4
  file_size: "45 MB"
```

### Example 2: Music Video

```yaml
input:
  concept: "Abstract visualizer music video for electronic track. Geometric shapes morph and pulse with the beat. Color palette shifts from cool blues to warm reds."
  style_reference: "Abstract motion graphics, Beeple-style digital art, neon on dark"
  character_references: []  # No characters
  target_resolution: "4K"
  target_duration: "3m 30s"
  music_reference: "audio/my_track.wav"
  fps: 60

output:
  shots_generated: 18
  total_pipeline_time: "8h 30m"
  quality_score: 9.1
  file_size: "1.2 GB"
```

---

## Performance

```yaml
performance_estimates:
  duration_by_complexity:
    simple_30s_720p: "1-2h"
    standard_60s_1080p: "3-5h"
    complex_3m_1080p: "6-10h"
    premium_3m_4K: "10-16h"

  bottlenecks:
    - "Generation (Phase 2): 40-60% of total time"
    - "Upscaling (Phase 4.2): 15-25% for 4K"
    - "Character consistency re-generation: Variable, 0-30%"

  optimization_tips:
    - "Generate at native model resolution, upscale later"
    - "Use batch generation for similar shots"
    - "Pre-compute IP-Adapter embeddings once, reuse across shots"
    - "Run frame interpolation and upscaling in parallel for different shots"
    - "Use GPU queue to minimize idle time between generations"
```

---

## Heuristics Reference

| Heuristic ID | Name | Phase | Blocking |
|--------------|------|-------|----------|
| VC_PRE_001 | Pre-Production Completeness | Phase 1 | Yes |
| VC_GEN_001 | Generation Quality | Phase 2 | Yes |
| VC_CON_001 | Character Consistency | Phase 3 | Yes |
| VC_ENH_001 | Enhancement Quality | Phase 4 | Yes |
| VC_AUD_001 | Audio Quality and Sync | Phase 5 | Yes |
| VC_DEL_001 | Final Delivery Quality | Phase 6 | Yes |

---

## Validation Checklist (HO-TP-001)

### Mandatory Fields Check

- [x] `task_name` follows "Verb + Object" format: "Create Full Video"
- [x] `status` is one of: pending | in_progress | completed
- [x] `responsible_executor` is clearly specified: @video-creation:director
- [x] `execution_type` is one of: Human | Agent | Hybrid | Worker
- [x] `input` array has at least 1 item (5 required + 4 optional)
- [x] `output` array has at least 1 item (3 primary + 2 secondary)
- [x] `action_items` has clear, actionable steps (6 phases, 35+ steps)
- [x] `acceptance_criteria` has measurable criteria (12 criteria)

### Quality Check

- [x] Task covers complete video production pipeline
- [x] Inputs are well-defined with types, validation, and examples
- [x] Outputs match acceptance criteria
- [x] Action items are sequential with clear phase boundaries
- [x] Executor type matches task nature (Hybrid for creative + technical)
- [x] Checkpoints defined at every phase boundary
- [x] Error handling covers all major failure modes

---

_Task Version: 1.0.0_
_Pattern: HO-TP-001 (Task Anatomy Standard)_
_Last Updated: 2026-02-06_
_Squad: video-creation_
_Lines: 500+_
_Compliant: Yes_
