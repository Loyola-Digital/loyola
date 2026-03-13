# Video Quality Checklist

> Validation checklist for AI-generated video production.
> Complete each section in order before moving to the next phase.

---

## Pre-Production

### Script and Planning
- [ ] Script finalized and approved
- [ ] Shot list created with shot descriptions, durations, and transitions
- [ ] Total video duration calculated (sum of all shots + transitions)
- [ ] Target delivery format confirmed (resolution, fps, codec, container)
- [ ] Platform requirements noted (YouTube 4K, TikTok vertical, Instagram square, etc.)

### Character References
- [ ] Character design sheets created (6-10 angles per character)
- [ ] Front view reference image (neutral expression) prepared
- [ ] 3/4 view references (left and right) prepared
- [ ] Profile view references (left and right) prepared
- [ ] Additional expression variants prepared (happy, serious, surprised)
- [ ] Reference images meet minimum resolution (512x512, recommended 1024x1024)
- [ ] Reference images have clean backgrounds for face detection
- [ ] InsightFace face detection tested on all reference images
- [ ] IP-Adapter FaceID embeddings generated and saved
- [ ] Clothing and accessory consistency documented across references

### Style References
- [ ] Visual style defined (photorealistic, anime, painterly, etc.)
- [ ] Color palette established (primary, secondary, accent colors)
- [ ] Lighting style defined (natural, cinematic, high-key, low-key, neon)
- [ ] Style reference images collected (5+ examples)
- [ ] IP-Adapter style embeddings generated (if using style transfer)
- [ ] Mood board reviewed and approved

### Technical Setup
- [ ] ComfyUI running and accessible
- [ ] All required models downloaded and loaded successfully
- [ ] Required custom nodes installed and verified
- [ ] Test generation completed successfully (quick 2-second test)
- [ ] VRAM sufficient for selected model and resolution
- [ ] Storage space available for generation outputs (estimate: 1-5 GB per shot)
- [ ] Backup/versioning strategy in place for generated assets

---

## Per-Shot Quality Checks

### Prompt Quality
- [ ] Prompt clearly describes the subject and action
- [ ] Camera movement explicitly specified (dolly, track, pan, static, handheld)
- [ ] Lighting and environment described
- [ ] Style and mood keywords included
- [ ] Negative prompt includes common artifact terms (blurry, distorted, watermark)
- [ ] Prompt length appropriate for chosen model
- [ ] Prompt does not contradict reference images (if using I2V)
- [ ] Prompt spelling and grammar verified

### Model Selection
- [ ] Model appropriate for content type (see KB Section 1 for guidance)
- [ ] Model variant matches available VRAM
- [ ] Precision setting chosen (FP16, FP8, INT8)
- [ ] Text encoder(s) loaded correctly (T5-XXL, CLIP-L, etc.)
- [ ] VAE precision set to FP32 for final output

### Resolution and Duration
- [ ] Resolution matches target aspect ratio (16:9, 9:16, 1:1, etc.)
- [ ] Resolution within model's supported range
- [ ] Frame count matches desired duration at target FPS
- [ ] Duration sufficient for the action described in the prompt
- [ ] Resolution/duration combination fits within VRAM budget

### Generation Parameters
- [ ] Steps set appropriately (30-50 for most models)
- [ ] CFG scale within recommended range for chosen model
- [ ] Scheduler matches model recommendation (Euler, DPM++, DDIM)
- [ ] Seed recorded for reproducibility
- [ ] ControlNet applied if needed (pose, depth, edge)
- [ ] ControlNet weights appropriate (not too strong, not too weak)
- [ ] IP-Adapter FaceID applied for character shots (weight: 0.7-0.85)

### Visual Quality Assessment
- [ ] Subject matches prompt description accurately
- [ ] Subject proportions are anatomically correct
- [ ] Faces are well-formed (no melting, morphing, or extra features)
- [ ] Hands have correct number of fingers and natural poses
- [ ] Eyes are consistent (no wandering, mismatched, or glowing)
- [ ] Motion is natural and physically plausible
- [ ] Motion speed matches prompt intent (slow-mo, normal, fast)
- [ ] No temporal flickering or jitter between frames
- [ ] Background is stable and not swimming or warping
- [ ] Colors are consistent throughout the entire clip
- [ ] No sudden brightness or contrast changes
- [ ] No watermarks, text artifacts, or logo-like patterns
- [ ] No visible seam lines (if using tiled generation)
- [ ] Edges of frame are clean (no border artifacts)

### Character Consistency (Multi-Shot)
- [ ] Face matches reference character across all angles
- [ ] Hair style and color consistent with references
- [ ] Clothing matches established design
- [ ] Skin tone consistent across different lighting conditions
- [ ] Body proportions consistent between shots
- [ ] Character recognizable from shot to shot

---

## Enhancement Quality Checks

### Upscaling
- [ ] Source video is the best available quality before upscaling
- [ ] Upscaling model appropriate for content type (Proteus, Artemis, SeedVR2)
- [ ] Scale factor appropriate (2x recommended, 4x only if needed)
- [ ] Fine details preserved (eyes, hair, textures)
- [ ] No oversharpening artifacts (halos around edges)
- [ ] No color shift introduced by upscaling
- [ ] No new noise or grain introduced
- [ ] Text/logos (if present) remain readable
- [ ] Output resolution matches target specification

### Frame Rate and Interpolation
- [ ] Source FPS documented before interpolation
- [ ] Target FPS specified and achievable
- [ ] Interpolation model selected (GIMM-VFI for production, RIFE for preview)
- [ ] No ghosting or double-image artifacts on moving objects
- [ ] No warping at frame boundaries
- [ ] Motion remains smooth through interpolated frames
- [ ] Fast-moving elements do not have trailing artifacts
- [ ] Scene transitions handled correctly (no interpolation across cuts)
- [ ] Final FPS matches delivery specification

### Temporal Stability
- [ ] Play at 0.25x speed and check for frame-to-frame consistency
- [ ] Static elements remain truly static (background, props)
- [ ] Lighting remains consistent across frames
- [ ] Texture detail does not pulse or fluctuate
- [ ] Character features do not drift over time
- [ ] Color grading is consistent across all frames

---

## Audio Quality Checks

### Voice and Narration
- [ ] Voice selected and tested (ElevenLabs or alternative)
- [ ] Voice matches character/brand identity
- [ ] Pronunciation is correct for all words (especially proper nouns)
- [ ] Pacing matches video content rhythm
- [ ] Emotional tone appropriate for scene content
- [ ] No audible artifacts (clicks, pops, robotic sounds)
- [ ] Volume is consistent throughout narration
- [ ] Silence gaps are natural length (not too short, not too long)
- [ ] Multi-language versions generated if needed

### Music
- [ ] Music genre and mood match video content
- [ ] BPM appropriate for edit pacing
- [ ] Music does not overpower voice/narration
- [ ] No abrupt starts or stops (proper fade in/out)
- [ ] Music transitions align with scene changes
- [ ] Duration matches video length (with fade out if shorter)
- [ ] License/rights confirmed for chosen music
- [ ] Instrumental-only version available for voice-over sections

### Sound Effects
- [ ] SFX match on-screen actions temporally
- [ ] SFX are appropriate for the visual content
- [ ] No SFX for off-screen events (unless intentional)
- [ ] SFX volume balanced against music and voice
- [ ] Ambient/foley sounds present for environmental realism
- [ ] No jarring or unexpected sound transitions
- [ ] SFX quality matches overall production quality

### Audio Mix Balance
- [ ] Voice/narration sits clearly above all other audio
- [ ] Music level: -12 to -18 dB below voice
- [ ] SFX level: -6 to -12 dB below voice
- [ ] Ambient level: -18 to -24 dB below voice
- [ ] No clipping or distortion at any point
- [ ] Dynamic range appropriate for delivery platform
- [ ] Stereo balance is centered (unless intentional panning)
- [ ] Listen on headphones AND speakers for balance check
- [ ] Audio levels comply with platform standards (YouTube: -14 LUFS, broadcast: -24 LUFS)

---

## Final Delivery Checks

### Resolution and Format
- [ ] Final resolution matches specification (1080p, 2K, 4K)
- [ ] Aspect ratio is correct (no stretching or letterboxing unless intended)
- [ ] Frame rate matches specification (24, 30, 48, 60 fps)
- [ ] Codec matches specification (H.264 for compatibility, H.265 for quality)
- [ ] Container format correct (MP4 for web, MOV for broadcast)
- [ ] Bit rate appropriate for resolution and platform
- [ ] Color space correct (Rec.709 for web, Rec.2020 for HDR)

### Artifact-Free Verification
- [ ] Full playback at 1x speed: no visible artifacts
- [ ] Scrub through at 0.25x speed: check for subtle issues
- [ ] First frame is clean (no black frame or glitch)
- [ ] Last frame is clean (no premature cut or freeze)
- [ ] No frame drops or duplicated frames
- [ ] No encoding artifacts (macroblocking, banding, mosquito noise)
- [ ] No generation artifacts carried through enhancement

### Audio-Video Synchronization
- [ ] Lip sync accurate (if applicable) to within 1 frame
- [ ] SFX sync accurate (impacts, footsteps, etc.) to within 2 frames
- [ ] Music beats align with intended visual beats
- [ ] Audio does not drift over the duration of the video
- [ ] Audio and video end at the same timestamp
- [ ] No audio pops at edit points or scene transitions

### File and Metadata
- [ ] File name follows naming convention
- [ ] File size within expected range for resolution and duration
- [ ] Metadata includes: title, description, creation date
- [ ] Thumbnail extracted or created
- [ ] Backup copy stored in designated location
- [ ] Project files (ComfyUI workflows, prompts, seeds) archived
- [ ] All source assets documented and archived for future edits

---

## Sign-Off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Video Creator | | | [ ] |
| Quality Reviewer | | | [ ] |
| Audio Engineer | | | [ ] |
| Project Lead | | | [ ] |
