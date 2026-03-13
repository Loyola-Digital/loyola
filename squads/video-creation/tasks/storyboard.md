# Task: Create Storyboard

**Task ID:** `storyboard`
**Pattern:** HO-TP-001 (Task Anatomy Standard)
**Version:** 1.0.0
**Last Updated:** 2026-02-06

---

## Task Anatomy

| Field | Value |
|-------|-------|
| **task_name** | Create Storyboard |
| **status** | `pending` |
| **responsible_executor** | @video-creation:director |
| **execution_type** | `Hybrid` |
| **input** | script_or_concept, style_reference, num_shots |
| **output** | storyboard.md, keyframes/ |
| **action_items** | 4 phases, 20+ steps |
| **acceptance_criteria** | 9 criteria |

**Estimated Time:** 30m-2h (depends on complexity and number of shots)

---

## Executor Specification

| Attribute | Value |
|-----------|-------|
| **Type** | Hybrid |
| **Pattern** | HO-EP-003 |
| **Executor** | @video-creation:director (AI drafts) + Human (validates creative direction) |
| **Rationale** | Storyboarding requires both analytical decomposition (AI strength) and creative judgment (human strength). AI can break scripts into shots and generate visual references, but creative framing decisions benefit from human oversight. |

### Executor Selection Criteria

- AI excels at: narrative decomposition, shot list generation, prompt crafting for keyframes, technical camera terminology
- Human required for: creative shot selection, emotional pacing judgment, visual composition approval
- Hybrid approach ensures: rapid generation of storyboard options with human curation

### Fallback

| Trigger | Fallback |
|---------|----------|
| Keyframe generation fails | Use text-only storyboard with detailed descriptions |
| AI decomposition misses narrative beats | Human rewrites shot list manually |
| Style reference unclear | Human provides additional reference images |

---

## Overview

This task creates a comprehensive storyboard from a script or concept. The storyboard serves as the blueprint for the entire video production pipeline, defining what each shot contains, how it looks, and how it fits into the overall narrative.

The storyboard is the primary input to the `create-video` pipeline and can also be used standalone for planning and client approval before committing to generation.

```
INPUT (script/concept + style_reference + num_shots)
    |
[PHASE 1: SCRIPT ANALYSIS]
    | Break down narrative into beats
    | Identify characters and settings
    | Map emotional arc
    | Determine pacing
    |
    v
[PHASE 2: SHOT DESIGN]
    | Define camera angles per shot
    | Design composition and framing
    | Assign timing and pacing
    | Plan transitions between shots
    |
    v
[PHASE 3: VISUAL REFERENCE]
    | Generate key frame images for each shot
    | Apply style reference consistency
    | Create character appearance sheets
    | Validate visual continuity
    |
    v
[PHASE 4: ASSEMBLY]
    | Compile storyboard document
    | Add timing tracks
    | Include technical notes
    | Final review and approval
    |
    v
OUTPUT (storyboard.md + keyframes/)
```

### What Makes a Good Storyboard

1. **Narrative clarity**: Every shot serves the story
2. **Visual consistency**: Shots share a coherent visual language
3. **Pacing intelligence**: Shot duration and rhythm match narrative intent
4. **Technical feasibility**: Shots are achievable with current AI generation models
5. **Completeness**: No narrative gaps between shots

---

## Input

### Required Inputs

- **script_or_concept** (`string | file`)
  - Description: The narrative source material for the storyboard
  - Source: User input
  - Required: Yes
  - Validation: Minimum 50 characters for concept, minimum 200 characters for full script
  - Accepted formats:
    - **Concept**: A brief description of the video idea (50-500 characters)
      - Example: `"A robot discovers flowers for the first time in a post-apocalyptic garden. It carefully picks one up, examining it with curiosity, then plants it in a new spot and waters it."`
    - **Script**: A detailed script with scene descriptions, dialogue, and direction
      - Example:
        ```
        SCENE 1 - EXT. RUINED CITY - DAY
        A small maintenance robot (UNIT-7) rolls through crumbling streets.
        Weeds push through cracked concrete. The sky is overcast but bright.

        SCENE 2 - EXT. HIDDEN GARDEN - DAY
        UNIT-7 rounds a corner and stops. Before it: a small garden,
        impossibly green and alive. Flowers of every color sway gently.
        UNIT-7's optical sensor zooms in on a single red rose.
        ```
    - **File**: .md or .txt file containing either format

- **style_reference** (`string | file`)
  - Description: Visual style guide for the storyboard keyframes
  - Source: User input
  - Required: Yes
  - Validation: If string, minimum 20 characters. If file, must be image (.png/.jpg/.webp) or text (.md/.txt)
  - Examples:
    - Text: `"Pixar-style 3D animation, warm color palette, soft lighting, expressive characters"`
    - Text: `"Dark cyberpunk, neon accents on black, rain-slicked streets, Blade Runner aesthetic"`
    - Image: A reference image or mood board that defines the visual target

- **num_shots** (`number | string`)
  - Description: Target number of shots for the storyboard
  - Source: User input
  - Required: Yes
  - Validation: Integer >= 3 or `"auto"` (AI determines optimal count)
  - Default: `"auto"`
  - Guidance:
    | Video Duration | Recommended Shots | Avg Shot Duration |
    |---------------|-------------------|-------------------|
    | 10-15s | 3-4 | 3-5s |
    | 30s | 5-8 | 3-6s |
    | 60s | 8-15 | 4-8s |
    | 2-3m | 15-30 | 4-12s |
    | 5m+ | 30-60 | 5-15s |

### Optional Inputs

- **target_duration** (`string`)
  - Description: Total target duration for the video
  - Required: No
  - Format: `"Xs"` or `"Xm"` or `"Xm Ys"`
  - Used for: Calculating per-shot timing

- **characters** (`object[]`)
  - Description: Pre-defined character information
  - Required: No (extracted from script if not provided)
  - Format:
    ```yaml
    characters:
      - name: "UNIT-7"
        type: "robot"
        description: "Small wheeled maintenance robot, boxy body, single camera eye, rust patches, antenna"
      - name: "Rose"
        type: "plant"
        description: "Single red rose, fully bloomed, on a green stem with thorns"
    ```

- **mood_progression** (`string[]`)
  - Description: Emotional arc to follow across the storyboard
  - Required: No (derived from script analysis if not provided)
  - Example: `["curious", "wonder", "gentle", "hopeful"]`

- **aspect_ratio** (`string`)
  - Description: Target aspect ratio for keyframes
  - Required: No
  - Default: `"16:9"`
  - Options: `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"21:9"`

- **generation_model** (`string`)
  - Description: Which model will be used for video generation (affects feasibility analysis)
  - Required: No
  - Default: `"wan2.1"`
  - Note: Affects complexity analysis - different models handle different shot types

---

## Output

### Primary Outputs

- **storyboard.md** (`file`)
  - Description: Complete storyboard document in Markdown format
  - Format: Markdown with embedded image references
  - Destination: `output/{project_name}/storyboard.md`
  - Structure:
    ```markdown
    # Storyboard: {Project Title}

    ## Project Overview
    - Concept: {brief}
    - Style: {style description}
    - Duration: {target}
    - Shots: {count}

    ## Characters
    {character sheets}

    ## Shot List

    ### Shot 1: {shot_title}
    ![Keyframe](keyframes/shot_001.png)
    - **Description:** {what happens}
    - **Camera:** {angle, movement}
    - **Duration:** {Xs}
    - **Timing:** {start_time - end_time}
    - **Transition:** {in/out}
    - **Mood:** {emotional quality}
    - **Generation Notes:** {model, complexity, special considerations}

    ### Shot 2: {shot_title}
    ...

    ## Timeline
    {visual timeline representation}

    ## Technical Notes
    {generation feasibility, potential challenges}
    ```

- **keyframes/** (`directory`)
  - Description: Generated keyframe images for each shot
  - Format: PNG images at 1280x720 (or aspect ratio equivalent)
  - Destination: `output/{project_name}/keyframes/`
  - Contents:
    ```
    keyframes/
    ├── shot_001.png
    ├── shot_002.png
    ├── shot_003.png
    ├── ...
    └── shot_{N}.png
    ```

### Secondary Outputs

- **shot_list.yaml** (`file`)
  - Description: Machine-readable shot list for pipeline consumption
  - Destination: `output/{project_name}/shot_list.yaml`
  - Used by: `create-video` task as primary pipeline input

- **character_sheets/** (`directory`)
  - Description: Character reference images generated during storyboarding
  - Destination: `output/{project_name}/character_sheets/`

---

## Preconditions

- [ ] ComfyUI running (for keyframe generation in Phase 3)
- [ ] Image generation model available (SDXL or Flux for keyframes)
- [ ] Script/concept provided and non-empty
- [ ] Style reference provided
- [ ] Output directory writable

---

## Action Items

### PHASE 1: SCRIPT ANALYSIS

**Duration:** 5-15 minutes
**Checkpoint:** `CP_ANALYSIS` - Narrative decomposition validated
**Heuristic:** `VC_STORY_001` - Script analysis completeness
**Mode:** Agent (autonomous analysis) with human review

#### Step 1.1: Parse Narrative Structure

**Actions:**
```yaml
parse_narrative:
  description: "Analyze the script/concept to extract narrative structure"

  substeps:
    - action: "Identify narrative beats"
      detail: |
        Break down the story into its fundamental narrative beats:
        1. **Setup/Introduction**: Establish setting, characters, world
        2. **Inciting Incident**: What triggers the main action
        3. **Rising Action**: Building tension or development
        4. **Climax/Peak**: The most important moment
        5. **Resolution**: How it concludes
        6. **Denouement** (if applicable): Final emotional landing

        For short-form content (< 30s):
        - May only have 2-3 beats
        - Focus on single clear narrative arc

        For longer content (> 1m):
        - Full narrative arc expected
        - Multiple sub-beats within each major section

    - action: "Map emotional arc"
      detail: |
        Plot the emotional progression across the narrative:
        - Assign an emotion/mood to each beat
        - Identify intensity level (1-10)
        - Map transitions between emotional states
        - Ensure the arc has a clear shape (build-up, peak, resolution)

        Output:
        ```yaml
        emotional_arc:
          - beat: "introduction"
            emotion: "curiosity"
            intensity: 3
          - beat: "discovery"
            emotion: "wonder"
            intensity: 7
          - beat: "action"
            emotion: "gentle care"
            intensity: 5
          - beat: "resolution"
            emotion: "hope"
            intensity: 8
        ```

  output:
    narrative_structure:
      beats: "array of narrative beats"
      emotional_arc: "emotion/intensity per beat"
      total_beats: "count"
```

#### Step 1.2: Extract Characters and Settings

**Actions:**
```yaml
extract_elements:
  description: "Identify all characters and settings from the script"

  substeps:
    - action: "Character extraction"
      detail: |
        For each character mentioned:
        1. Name or identifier
        2. Physical description (as detailed as text provides)
        3. Role in narrative (protagonist, antagonist, supporting)
        4. Emotional state(s) throughout the story
        5. Actions performed
        6. Shots where they appear

        If characters input provided, merge with extracted data.
        If no explicit characters (e.g., abstract video), note "no characters".

    - action: "Setting extraction"
      detail: |
        For each distinct location/environment:
        1. Name or identifier
        2. Physical description
        3. Lighting conditions (time of day, artificial light sources)
        4. Mood/atmosphere
        5. Key visual elements (landmarks, objects, textures)
        6. Shots where this setting appears

    - action: "Visual element inventory"
      detail: |
        Catalog all mentioned visual elements:
        - Props and objects
        - Special effects (particles, weather, magic, technology)
        - Color mentions
        - Movement descriptions
        - Scale indicators (wide landscape, intimate close-up)

  output:
    characters: "array of character profiles"
    settings: "array of setting descriptions"
    visual_elements: "inventory of visual components"
```

#### Step 1.3: Determine Pacing Strategy

**Actions:**
```yaml
determine_pacing:
  description: "Define the rhythm and timing structure for the storyboard"

  substeps:
    - action: "Calculate shot budget"
      detail: |
        If num_shots == "auto":
          1. Count narrative beats
          2. Estimate shots per beat:
             - Simple beats: 1-2 shots
             - Complex beats: 2-4 shots
             - Climax beat: 2-5 shots (more coverage)
          3. Sum for total shot count
          4. Validate against target_duration (if provided):
             - Average shot duration should be 3-8s
             - If too many shots: merge similar beats
             - If too few shots: add establishing/transition shots
        Else:
          Use provided num_shots and distribute across beats

    - action: "Assign shot types"
      detail: |
        For each planned shot, classify its type:
        - **Establishing shot**: Wide, sets the scene, usually first
        - **Action shot**: Characters doing things, medium to close
        - **Reaction shot**: Character response, usually close-up
        - **Detail shot**: Close-up on important object/element
        - **Transition shot**: Bridges between scenes
        - **Atmosphere shot**: Sets mood, often environment-focused

    - action: "Define pacing rhythm"
      detail: |
        Apply pacing principles:
        - **Fast pacing** (2-3s shots): Action, tension, excitement
        - **Medium pacing** (4-6s shots): Normal narrative flow
        - **Slow pacing** (7-12s shots): Contemplation, beauty, emotion
        - **Dynamic pacing**: Mix of speeds following emotional arc

        Rules:
        - Never have 3+ fast shots in a row (exhausting)
        - Never have 3+ slow shots in a row (boring)
        - Climax shots can be shorter (quick cuts) or longer (dramatic hold)
        - First and last shots tend to be longer (establish and resolve)

  output:
    pacing_plan:
      total_shots: "number"
      shots_per_beat: "distribution"
      average_duration: "seconds"
      pacing_style: "dynamic | fast | slow | mixed"
```

#### Step 1.4: Analysis Checkpoint

**Checkpoint: `CP_ANALYSIS`**

```yaml
checkpoint_analysis:
  heuristic_id: VC_STORY_001
  name: "Script Analysis Completeness"
  blocking: true

  criteria:
    - check: "Narrative beats identified"
      required: true
    - check: "Emotional arc mapped"
      required: true
    - check: "Characters extracted (or noted as N/A)"
      required: true
    - check: "Settings described"
      required: true
    - check: "Shot count determined"
      required: true
    - check: "Pacing strategy defined"
      required: true

  human_review:
    required: true
    items:
      - "Does the narrative decomposition capture the story correctly?"
      - "Is the emotional arc appropriate?"
      - "Is the shot count reasonable for the content?"
    timeout: "15m"

  on_pass: "Proceed to PHASE 2: SHOT DESIGN"
  on_fail: "Re-analyze with human guidance"
```

---

### PHASE 2: SHOT DESIGN

**Duration:** 10-30 minutes
**Checkpoint:** `CP_SHOTDESIGN` - Shot list validated
**Heuristic:** `VC_STORY_002` - Shot design quality
**Mode:** Agent with human review at checkpoint

#### Step 2.1: Define Camera Angles and Composition

**Actions:**
```yaml
camera_design:
  description: "Design camera setup for each shot"

  substeps:
    - action: "Assign camera angles"
      detail: |
        For each shot, select appropriate camera angle:

        | Angle | Use Case | Emotional Effect |
        |-------|----------|-----------------|
        | **Wide/Establishing** | Setting context, scale | Scope, isolation, grandeur |
        | **Medium** | Standard narrative | Neutral, informative |
        | **Close-up** | Emotion, detail | Intimacy, intensity |
        | **Extreme close-up** | Critical detail | Tension, importance |
        | **Bird's eye** | Overview, mapping | Omniscience, detachment |
        | **Low angle** | Power, dominance | Strength, intimidation |
        | **High angle** | Vulnerability | Weakness, overview |
        | **Dutch angle** | Disorientation | Unease, instability |
        | **POV** | Subjective experience | Immersion, empathy |

        Selection principles:
        - Alternate between wide and close for visual variety
        - Use angle to reinforce emotional content
        - Consider AI generation feasibility (some angles harder to generate)

    - action: "Define camera movement"
      detail: |
        For each shot, plan camera movement:

        | Movement | Use Case | Complexity for AI |
        |----------|----------|------------------|
        | **Static** | Contemplation, focus | EASY |
        | **Pan (horizontal)** | Reveal, follow action | EASY-MEDIUM |
        | **Tilt (vertical)** | Reveal height, scan | EASY-MEDIUM |
        | **Dolly (in/out)** | Approach, retreat | MEDIUM |
        | **Tracking** | Follow subject | MEDIUM-HARD |
        | **Crane** | Dramatic reveal | HARD |
        | **Handheld** | Documentary feel | MEDIUM |
        | **Zoom** | Emphasis (rarely used cinematically) | EASY |

        Consider:
        - Simpler movements generate better with current AI models
        - Static or slow pan/tilt for reliability
        - Complex movements may need I2V with guided frames

    - action: "Plan composition"
      detail: |
        Apply composition principles:
        - **Rule of thirds**: Place subjects on intersection points
        - **Leading lines**: Use environmental lines to guide the eye
        - **Framing**: Use environmental elements to frame subject
        - **Depth**: Include foreground, middle ground, background
        - **Balance**: Visual weight should feel balanced
        - **Negative space**: Use empty space for mood and breathing room

  output:
    per_shot_camera:
      - shot_id: "shot_001"
        angle: "wide"
        movement: "slow pan right"
        composition: "Rule of thirds, city skyline on upper third"
        depth: "Deep focus, layered cityscape"
```

#### Step 2.2: Assign Timing and Pacing Per Shot

**Actions:**
```yaml
timing_design:
  description: "Assign specific duration and timing to each shot"

  substeps:
    - action: "Calculate per-shot duration"
      detail: |
        Distribute total duration across shots:
        1. Start with average: target_duration / num_shots
        2. Adjust per shot based on:
           - Content complexity (more complex = slightly longer)
           - Emotional weight (emotional moments get more time)
           - Pacing plan (fast section = shorter, slow = longer)
           - Minimum viable duration per shot type:
             - Establishing: 3-6s minimum
             - Action: 2-4s minimum
             - Close-up: 2-5s minimum
             - Transition: 1-3s minimum
        3. Verify total matches target_duration (+/- 2s buffer for transitions)

    - action: "Plan transitions"
      detail: |
        Define how each shot connects to the next:

        | Transition | Use Case | Duration |
        |-----------|----------|----------|
        | **Cut** | Standard, energetic | 0s |
        | **Dissolve** | Time passage, dreamy | 0.5-1.5s |
        | **Fade to black** | Scene change, ending | 1-2s |
        | **Fade from black** | New scene, beginning | 1-2s |
        | **Wipe** | Stylistic choice | 0.5-1s |
        | **Match cut** | Visual continuity | 0s |

        Principles:
        - Use cuts for same-scene transitions
        - Use dissolves for time or location changes
        - Use fades for major scene breaks
        - Be consistent with transition style

    - action: "Create timing track"
      detail: |
        Build a timeline showing:
        ```
        00:00 |====shot_001====| 00:04
        00:04 |==shot_002==| 00:07
        00:07 |===shot_003===| 00:11
        ...
        02:27 |====shot_012====| 02:30
        ```

        Verify:
        - No timing gaps
        - No overlaps (except for transition durations)
        - Total adds up to target_duration

  output:
    timing_track:
      - shot_id: "shot_001"
        start: "00:00"
        end: "00:04"
        duration: 4
        transition_in: "fade_from_black"
        transition_out: "cut"
```

#### Step 2.3: Feasibility Analysis

**Actions:**
```yaml
feasibility_analysis:
  description: "Assess AI generation feasibility for each shot"

  substeps:
    - action: "Rate generation difficulty"
      detail: |
        For each shot, rate complexity factors:

        | Factor | EASY (1) | MEDIUM (2) | HARD (3) | VERY HARD (4) |
        |--------|----------|------------|----------|---------------|
        | Subject | Static object | Single character | Multi-character | Crowd |
        | Motion | Static | Slow/simple | Complex | Physics-based |
        | Camera | Static | Slow pan/tilt | Tracking | Complex crane |
        | Detail | Low detail | Medium | High detail | Extreme close-up |
        | Anatomy | No humans | Distant humans | Medium humans | Face close-up |

        Overall difficulty = max(factor_scores)

    - action: "Recommend generation strategy"
      detail: |
        Based on difficulty:
        - EASY: Standard T2V, single attempt likely sufficient
        - MEDIUM: T2V with careful prompt, 1-2 attempts expected
        - HARD: May need I2V or special workflow, 2-3 attempts expected
        - VERY HARD: Consider breaking into simpler sub-shots, I2V recommended

    - action: "Flag potential issues"
      detail: |
        Common generation challenges to flag:
        - [ ] Character close-ups (face quality varies)
        - [ ] Multi-character scenes (consistency hard)
        - [ ] Complex physics (water, fire, cloth)
        - [ ] Text/signage in scene (AI struggles with text)
        - [ ] Hands/fingers visible (anatomy challenges)
        - [ ] Rapid camera movement (temporal consistency)
        - [ ] Long duration shots (> 5s may need stitching)

  output:
    per_shot_feasibility:
      - shot_id: "shot_001"
        difficulty: "MEDIUM"
        strategy: "T2V standard"
        expected_attempts: 1
        flags: ["none"]
      - shot_id: "shot_005"
        difficulty: "HARD"
        strategy: "I2V with reference"
        expected_attempts: 3
        flags: ["face close-up", "emotion required"]
```

#### Step 2.4: Shot Design Checkpoint

**Checkpoint: `CP_SHOTDESIGN`**

```yaml
checkpoint_shotdesign:
  heuristic_id: VC_STORY_002
  name: "Shot Design Quality Gate"
  blocking: true

  criteria:
    - check: "All shots have camera angle defined"
      required: true
    - check: "All shots have duration assigned"
      required: true
    - check: "Total duration matches target"
      tolerance: "2s"
      required: true
    - check: "Transitions planned between all adjacent shots"
      required: true
    - check: "Feasibility analysis complete"
      required: true
    - check: "No VERY HARD shots without mitigation plan"
      required: true

  human_review:
    required: true
    items:
      - "Shot sequence tells the story clearly?"
      - "Camera choices enhance the narrative?"
      - "Pacing feels right?"
      - "Any shots that should be added/removed?"
    timeout: "20m"

  on_pass: "Proceed to PHASE 3: VISUAL REFERENCE"
  on_fail: "Revise shot design based on feedback"
```

---

### PHASE 3: VISUAL REFERENCE

**Duration:** 15-60 minutes (depends on shot count)
**Checkpoint:** `CP_KEYFRAMES` - Keyframes generated and approved
**Heuristic:** `VC_STORY_003` - Visual reference quality
**Mode:** Agent (generation) + Human (approval)

#### Step 3.1: Generate Character Reference Sheets

**Actions:**
```yaml
character_references:
  description: "Generate or compile character reference images"

  condition: "only if characters exist in the story"

  substeps:
    - action: "Generate character images"
      detail: |
        For each character:
        1. Build character generation prompt from description
        2. Apply style_reference visual style
        3. Generate views using SDXL or Flux via ComfyUI:
           - Front view (portrait)
           - 3/4 view
           - Full body
        4. Ensure consistency across views (same seed family)
        5. Save to character_sheets/{character_name}/

    - action: "Create character sheet"
      detail: |
        Compile per character:
        - Name and role
        - Visual description
        - Reference images grid
        - Key visual traits for prompt engineering
        - What to avoid (negative prompt guidance)

  output:
    - "character_sheets/{character_name}/"
    - "character_sheets/{character_name}/sheet.md"
```

#### Step 3.2: Generate Keyframe Images

**Actions:**
```yaml
generate_keyframes:
  description: "Generate a representative keyframe image for each shot"

  substeps:
    - action: "Build keyframe prompts"
      detail: |
        For each shot, create an image generation prompt:
        1. Start with style_reference base tokens
        2. Add shot-specific scene description
        3. Add camera angle indicator:
           - "wide shot" / "close-up" / "medium shot" etc.
        4. Add lighting description
        5. Add mood descriptors
        6. Add quality tokens: "masterpiece, best quality, cinematic, 8K"
        7. Build negative prompt (standard anti-artifact tokens)

    - action: "Generate keyframes via ComfyUI"
      detail: |
        For each shot:
        1. Load SDXL or Flux image generation workflow
        2. Set prompt (positive + negative)
        3. Set resolution: 1280x720 (16:9) or equivalent for aspect ratio
        4. Set steps: 25-30 for quality
        5. Set CFG: 7.0-8.0
        6. Generate image
        7. If character present: use IP-Adapter with character reference
        8. Save to keyframes/shot_{id}.png

    - action: "Review and iterate"
      detail: |
        For each generated keyframe:
        1. Evaluate: Does it match the shot description?
        2. Evaluate: Is it stylistically consistent with other keyframes?
        3. Evaluate: Would this serve as a good visual reference for video generation?
        4. If acceptable: keep
        5. If not: adjust prompt and regenerate (max 3 attempts)

  output:
    - "keyframes/shot_{id}.png" (one per shot)
```

#### Step 3.3: Validate Visual Continuity

**Actions:**
```yaml
visual_continuity:
  description: "Ensure keyframes form a visually coherent sequence"

  substeps:
    - action: "Color consistency check"
      detail: |
        Compare color palettes across all keyframes:
        - Extract dominant colors from each keyframe
        - Verify they align with style_reference palette
        - Flag keyframes that deviate significantly
        - Regenerate outliers if needed

    - action: "Character consistency check"
      detail: |
        If characters appear in multiple shots:
        - Compare character appearance across keyframes
        - Verify clothing, features, and proportions are consistent
        - Flag inconsistencies for regeneration with stronger IP-Adapter weight

    - action: "Visual flow check"
      detail: |
        View keyframes in sequence order:
        - Do they tell the story visually?
        - Are transitions between shots visually logical?
        - Is there enough variety (not all same angle/composition)?
        - Is there enough consistency (same world/style)?

  output:
    continuity_report:
      color_consistency: "PASS | WARN | FAIL"
      character_consistency: "PASS | WARN | FAIL | N/A"
      visual_flow: "PASS | WARN | FAIL"
      flagged_shots: "list of shots needing regeneration"
```

#### Step 3.4: Keyframe Checkpoint

**Checkpoint: `CP_KEYFRAMES`**

```yaml
checkpoint_keyframes:
  heuristic_id: VC_STORY_003
  name: "Visual Reference Quality Gate"
  blocking: false  # Can proceed with text-only storyboard if keyframes problematic

  criteria:
    - check: "Keyframe exists for every shot"
      required: true
    - check: "Keyframes match shot descriptions"
      required: true
    - check: "Color consistency across keyframes"
      required: false
    - check: "Character consistency across keyframes"
      required: false

  human_review:
    required: true
    items:
      - "Do keyframes capture the intended mood?"
      - "Do characters look correct?"
      - "Does the visual sequence flow well?"
      - "Any keyframes that need replacement?"
    timeout: "20m"

  on_pass: "Proceed to PHASE 4: ASSEMBLY"
  on_fail_blocking: "Regenerate failed keyframes"
  on_fail_non_blocking: "Proceed with notes in storyboard"
```

---

### PHASE 4: ASSEMBLY

**Duration:** 5-15 minutes
**Checkpoint:** `CP_STORYBOARD` - Final storyboard validated
**Heuristic:** `VC_STORY_004` - Storyboard completeness
**Mode:** Agent (document generation) + Human (final sign-off)

#### Step 4.1: Compile Storyboard Document

**Actions:**
```yaml
compile_storyboard:
  description: "Assemble the final storyboard.md document"

  substeps:
    - action: "Generate header section"
      detail: |
        ```markdown
        # Storyboard: {Project Title}

        **Created:** {date}
        **Style:** {style description}
        **Target Duration:** {duration}
        **Total Shots:** {count}
        **Aspect Ratio:** {ratio}

        ## Concept
        {original concept/script}

        ## Style Reference
        {style description and/or reference image link}

        ## Emotional Arc
        {emotional progression diagram}
        ```

    - action: "Generate character section"
      detail: |
        ```markdown
        ## Characters

        ### {Character Name}
        ![{Name} Reference](character_sheets/{name}/front.png)
        - **Role:** {role}
        - **Description:** {physical description}
        - **Key traits:** {visual identifiers for prompting}
        ```

    - action: "Generate shot-by-shot section"
      detail: |
        For each shot:
        ```markdown
        ### Shot {N}: {Shot Title}

        ![Keyframe](keyframes/shot_{id}.png)

        | Property | Value |
        |----------|-------|
        | **Duration** | {X}s |
        | **Timing** | {start} - {end} |
        | **Camera** | {angle}, {movement} |
        | **Subject** | {primary subject} |
        | **Action** | {what happens} |
        | **Environment** | {setting} |
        | **Lighting** | {light description} |
        | **Mood** | {emotional quality} |
        | **Transition In** | {type} |
        | **Transition Out** | {type} |

        **Description:**
        {Detailed narrative description of the shot}

        **Generation Notes:**
        - Model: {recommended model}
        - Difficulty: {EASY/MEDIUM/HARD}
        - Strategy: {T2V/I2V/AnimateDiff}
        - Special considerations: {flags}
        ```

    - action: "Generate timeline section"
      detail: |
        ```markdown
        ## Timeline

        ```
        00:00 ├──shot_001──┤ 00:04 (Establishing - city overview)
        00:04 ├──shot_002──┤ 00:07 (UNIT-7 rolling through streets)
        00:07 ├──shot_003──┤ 00:11 (Discovery of garden)
        ...
        ```

        Total: {duration} | Shots: {count} | Avg shot: {avg}s
        ```

    - action: "Generate technical notes section"
      detail: |
        ```markdown
        ## Technical Notes

        ### Generation Feasibility Summary
        - Easy shots: {count} ({percentage}%)
        - Medium shots: {count} ({percentage}%)
        - Hard shots: {count} ({percentage}%)
        - Very Hard shots: {count} ({percentage}%)

        ### Estimated Generation Time
        {total_estimate based on shot difficulty}

        ### Potential Challenges
        {list of flagged issues from feasibility analysis}

        ### Recommended Workflow
        {which ComfyUI workflow and models recommended}
        ```

  output:
    - "output/{project_name}/storyboard.md"
```

#### Step 4.2: Generate Machine-Readable Shot List

**Actions:**
```yaml
generate_shot_list:
  description: "Create YAML shot list for pipeline consumption"

  substeps:
    - action: "Export shot_list.yaml"
      detail: |
        Generate the machine-readable format used by create-video:
        ```yaml
        project:
          name: "{project_name}"
          target_duration: "{duration}"
          target_resolution: "{resolution}"
          style_reference: "{style_ref_path}"

        shots:
          - id: "shot_001"
            title: "{shot_title}"
            description: "{narrative description}"
            duration_seconds: 4
            start_time: "00:00"
            end_time: "00:04"
            camera:
              angle: "wide"
              movement: "slow pan right"
            subject: "{primary subject}"
            action: "{what happens}"
            environment: "{setting details}"
            lighting: "{lighting description}"
            mood: "{emotional quality}"
            transition_in: "fade_from_black"
            transition_out: "cut"
            complexity: "MEDIUM"
            model: "wan2.1"
            generation_mode: "t2v"
            characters: ["UNIT-7"]
            keyframe: "keyframes/shot_001.png"
            flags: []
        ```

  output:
    - "output/{project_name}/shot_list.yaml"
```

#### Step 4.3: Final Storyboard Checkpoint

**Checkpoint: `CP_STORYBOARD`**

```yaml
checkpoint_storyboard:
  heuristic_id: VC_STORY_004
  name: "Storyboard Completeness Gate"
  blocking: true

  criteria:
    - check: "storyboard.md exists and is well-formatted"
      required: true
    - check: "All shots documented with complete metadata"
      required: true
    - check: "Keyframe images referenced and accessible"
      required: true
    - check: "shot_list.yaml generated and valid"
      required: true
    - check: "Timeline section present and accurate"
      required: true
    - check: "Technical notes section present"
      required: true
    - check: "Total duration matches target"
      tolerance: "2s"
      required: true

  human_review:
    required: true
    items:
      - "Storyboard tells the complete story"
      - "Shot selection and pacing are appropriate"
      - "Keyframes capture the intended visuals"
      - "Ready to proceed to video generation"
    timeout: "30m"

  on_pass: "STORYBOARD COMPLETE - Ready for create-video pipeline"
  on_fail: "Revise based on feedback"
```

---

## Acceptance Criteria

The task is complete when ALL of the following criteria are met:

- [ ] **AC-01:** storyboard.md exists with complete project overview, character section, shot-by-shot breakdown, timeline, and technical notes
- [ ] **AC-02:** Keyframe images generated for every shot in the storyboard
- [ ] **AC-03:** shot_list.yaml generated with machine-readable shot data for pipeline consumption
- [ ] **AC-04:** Each shot has all required fields: description, camera, duration, timing, transition, mood, generation notes
- [ ] **AC-05:** Total shot durations sum to target_duration (+/- 2s)
- [ ] **AC-06:** Visual style is consistent across all keyframe images
- [ ] **AC-07:** Narrative beats from script/concept are all represented in the shot list
- [ ] **AC-08:** Feasibility analysis completed for all shots with difficulty ratings
- [ ] **AC-09:** Human creative approval received on final storyboard

---

## Error Handling

```yaml
error_handling:
  script_too_vague:
    cause: "Concept is too brief to decompose into meaningful shots"
    detection: "Fewer than 3 narrative beats extracted"
    recovery: "Ask user for more detail: setting, characters, key moments"
    prevention: "Minimum 50 character concept requirement"

  keyframe_generation_failure:
    cause: "Image generation model fails or produces poor results"
    detection: "ComfyUI error or quality below threshold"
    recovery: |
      1. Retry with adjusted prompt
      2. Try different model (SDXL vs Flux)
      3. Fall back to text-only storyboard
    prevention: "Verify ComfyUI and models before starting"

  timing_mismatch:
    cause: "Shot durations don't add up to target"
    detection: "Sum check fails"
    recovery: "Proportionally adjust shot durations to match target"
    prevention: "Continuous sum validation during shot design"

  style_inconsistency:
    cause: "Keyframes have inconsistent visual styles"
    detection: "Color palette analysis shows deviation"
    recovery: "Regenerate outlier keyframes with stronger style tokens"
    prevention: "Use consistent seed ranges and identical style tokens"

  too_many_hard_shots:
    cause: "Story requires shots that are very difficult for AI generation"
    detection: "> 40% of shots rated HARD or VERY HARD"
    recovery: |
      1. Simplify complex shots
      2. Break into simpler sub-shots
      3. Suggest alternative approaches to human
    prevention: "Feasibility awareness during shot design"
```

---

## Integration

### Dependencies

| Component | Purpose |
|-----------|---------|
| ComfyUI | Keyframe image generation |
| SDXL/Flux model | Image generation for keyframes |
| IP-Adapter | Character consistency in keyframes |

### Called By

| Task | Context |
|------|---------|
| `create-video` | Phase 1: Pre-Production calls storyboard as sub-task |
| Direct user invocation | Standalone storyboard creation for planning |

### Outputs Consumed By

| Task | What It Uses |
|------|-------------|
| `create-video` | shot_list.yaml (pipeline input) |
| `create-shot` | Individual shot descriptions from shot_list.yaml |

---

## Examples

### Example 1: Simple Concept (Short Video)

```yaml
input:
  script_or_concept: "A cat watches a butterfly from a window, then bats at the glass."
  style_reference: "Soft, warm watercolor animation style, pastel colors, Studio Ghibli inspiration"
  num_shots: "auto"
  target_duration: "15s"

output:
  shots_generated: 4
  shots:
    - "Wide: cozy room with cat on windowsill (4s)"
    - "Close-up: cat watching butterfly outside (4s)"
    - "Medium: butterfly fluttering near glass (3s)"
    - "Close-up: cat paw batting at glass, butterfly flies away (4s)"
  keyframes: 4
  total_time: "25m"
```

### Example 2: Full Script (Longer Video)

```yaml
input:
  script_or_concept: |
    SCENE 1 - RUINED CITY
    Robot UNIT-7 rolls through crumbling streets.
    SCENE 2 - HIDDEN GARDEN
    UNIT-7 discovers an impossibly green garden with flowers.
    SCENE 3 - THE ROSE
    UNIT-7 carefully picks up a red rose, examines it.
    SCENE 4 - PLANTING
    UNIT-7 plants the rose in a new spot, waters it with a leaky pipe.
  style_reference: "Pixar-quality 3D animation, warm but post-apocalyptic, WALL-E meets The Last of Us"
  num_shots: 12
  target_duration: "60s"

output:
  shots_generated: 12
  character_sheets: ["UNIT-7"]
  keyframes: 12
  feasibility:
    easy: 5
    medium: 5
    hard: 2
  total_time: "1h 15m"
```

---

## Heuristics Reference

| Heuristic ID | Name | Phase | Blocking |
|--------------|------|-------|----------|
| VC_STORY_001 | Script Analysis Completeness | Phase 1 | Yes |
| VC_STORY_002 | Shot Design Quality | Phase 2 | Yes |
| VC_STORY_003 | Visual Reference Quality | Phase 3 | No (fallback to text) |
| VC_STORY_004 | Storyboard Completeness | Phase 4 | Yes |

---

## Validation Checklist (HO-TP-001)

### Mandatory Fields Check

- [x] `task_name` follows "Verb + Object" format: "Create Storyboard"
- [x] `status` is one of: pending | in_progress | completed
- [x] `responsible_executor` is clearly specified: @video-creation:director
- [x] `execution_type` is one of: Human | Agent | Hybrid | Worker
- [x] `input` array has at least 1 item (3 required + 5 optional)
- [x] `output` array has at least 1 item (2 primary + 2 secondary)
- [x] `action_items` has clear, actionable steps (4 phases, 20+ steps)
- [x] `acceptance_criteria` has measurable criteria (9 criteria)

### Quality Check

- [x] Task is focused (storyboard creation only)
- [x] Inputs are well-defined with types, validation, and examples
- [x] Outputs match acceptance criteria
- [x] Action items are sequential with clear phase boundaries
- [x] Executor type matches task nature (Hybrid for creative + analytical)
- [x] Error handling covers major failure modes
- [x] Integration points documented

---

_Task Version: 1.0.0_
_Pattern: HO-TP-001 (Task Anatomy Standard)_
_Last Updated: 2026-02-06_
_Squad: video-creation_
_Lines: 300+_
_Compliant: Yes_
