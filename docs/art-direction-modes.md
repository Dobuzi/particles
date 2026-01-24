# Art Direction Spec: Mode Presets

> **Theme Foundation**: "Warm Minimal"
> All modes share a unified color palette: pearl grey hand particles, terracotta clay, warm amber UI accents. No neon colors or competing hues.

---

## 1. Minimal

### Intent Statement
A clean, understated hand tracking experience. The interface fades away, leaving only the essential structure of the hands. Ideal for focused work, presentations, or users who prefer subtlety.

### Visual Hierarchy
1. **Hand particles** (primary) — sparse, small, pearl grey
2. **Hand connection lines** (secondary) — skeletal structure visible but not dominant
3. **Background** — deep, warm black with no distractions
4. *(No clay, no streams)*

### Motion Characteristics
- **Smooth and slow** — particles follow hand with gentle easing
- **Low latency tolerance** — responsive but not twitchy
- **Minimal noise** — near-zero jitter keeps the aesthetic calm
- **Flow strength**: Low (0.4) — subdued internal motion

### Color & Contrast Notes
- **Particle brightness**: 70% of max — soft, not glowing
- **Glow intensity**: Minimal (0.2) — subtle halos only
- **Connection lines**: Semi-transparent (25% opacity) pearl grey
- **Depth exaggeration**: Reduced (0.8) — flatter, more graphic appearance

### Parameter Preset Table

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| totalParticles | 70 | Sparse, readable |
| particleSize | 0.35 | Small, unobtrusive |
| glowIntensity | 0.2 | Subtle ambient glow |
| colorIntensity | 0.7 | Muted, not vibrant |
| showStreams | false | Eliminates visual noise |
| showLinks | false | Keeps focus on particles |
| showHandLines | true | Structural emphasis |
| flowStrength | 0.4 | Calm internal motion |
| noiseStrength | 0.3 | Near-still particles |
| spacingStiffness | 0.7 | Tight, controlled spacing |
| depthExaggeration | 0.8 | Flatter appearance |
| showClay | false | Hand-only mode |
| clayJitterAmplitude | 0.0 | N/A (clay off) |

### Interaction Notes
- **Pinch/grab**: Responsive but no visual fanfare
- **Streams**: Disabled — too expressive for this mode
- **Clay**: Disabled — this mode is about hands alone

### Do's
- Keep particle count low for clarity
- Maintain even spacing along skeleton
- Allow connection lines to reveal structure subtly

### Don'ts
- Don't add glow or bloom effects
- Don't enable streams or clay
- Don't increase noise — stillness is the goal

---

## 2. Sculpt

### Intent Statement
A tactile, focused sculpting experience. The clay is the star; hands are tools. The mode should feel like working with real modeling clay — responsive, satisfying, precise.

### Visual Hierarchy
1. **Clay particles** (primary) — prominent terracotta mass, larger radius
2. **Hand particles** (secondary) — visible but subordinate to clay
3. **Clay connection lines** (tertiary) — reveal internal structure
4. **Hand connection lines** (quaternary) — skeletal scaffolding

### Motion Characteristics
- **Responsive and direct** — clay follows hand gestures immediately
- **Low latency** — manipulation must feel instant
- **Subtle jitter** — clay breathes slightly, feels organic but controlled
- **High sculpt strength** — deformations are significant and satisfying

### Color & Contrast Notes
- **Clay**: Dominant terracotta (hue 0.05), moderate saturation
- **Hands**: Pearl grey, slightly dimmer than clay
- **Glow intensity**: Low-moderate (0.3) — clay has soft inner glow
- **Connection lines**: Clay lines visible (15% opacity), hand lines subtle

### Parameter Preset Table

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| totalParticles | 80 | Moderate hand density |
| particleSize | 0.35 | Balanced with clay |
| glowIntensity | 0.3 | Soft ambient glow |
| colorIntensity | 0.8 | Slightly muted |
| showStreams | false | Focus on sculpting |
| showLinks | false | Reduces visual noise |
| showHandLines | true | Tool visibility |
| showClay | true | Core feature |
| clayParticles | 120 | Dense, sculptable mass |
| clayRadius | 1.4 | Large, workable blob |
| sculptStrength | 0.8 | Responsive deformation |
| showClayLines | true | Internal structure |
| flowStrength | 0.5 | Moderate internal motion |
| noiseStrength | 0.4 | Calm during sculpt |
| clayJitterAmplitude | 0.002 | Subtle life, precise control |
| clayJitterSpeed | 0.8 | Slow, organic |

### Interaction Notes
- **Pinch**: Attracts clay toward pinch point; also enables pick-and-move
- **Grab**: Squeezes/compresses the clay mass
- **Two-hand stretch**: Scales clay along axis between hands
- **Pick-and-move**: Enabled — select and drag individual particles

### Do's
- Make clay feel heavy and malleable
- Provide clear visual feedback when sculpting
- Maintain spacing constraints to prevent collapse

### Don'ts
- Don't make clay too jittery — precision matters
- Don't let hands overpower clay visually
- Don't enable streams — they distract from sculpting

---

## 3. Flow

### Intent Statement
A dynamic, expressive mode emphasizing motion and energy. Streams connect fingertips in flowing arcs; particles drift with organic noise. The feeling is playful and alive.

### Visual Hierarchy
1. **Streams** (primary) — flowing connections between matching fingertips
2. **Hand particles** (secondary) — numerous, active, flowing
3. **Links** (tertiary) — additional connectivity between particles
4. *(Clay disabled by default)*

### Motion Characteristics
- **Energetic and fluid** — high flow strength, visible particle drift
- **Moderate latency tolerance** — smoothness preferred over snap response
- **Visible noise** — particles jitter and swim organically
- **High responsiveness** — streams react quickly to hand movement

### Color & Contrast Notes
- **Particles**: Full brightness (1.0 color intensity)
- **Glow intensity**: Moderate (0.5) — particles have visible halos
- **Streams**: Warm cream color, semi-transparent
- **Depth exaggeration**: Normal (1.0) — full 3D depth perception

### Parameter Preset Table

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| totalParticles | 100 | Dense, flowing mass |
| particleSize | 0.4 | Slightly larger for visibility |
| glowIntensity | 0.5 | Visible glow halos |
| colorIntensity | 1.0 | Full vibrancy |
| showStreams | true | Core visual feature |
| showLinks | true | Additional connectivity |
| showHandLines | false | Would clutter the flow |
| flowStrength | 1.2 | High internal motion |
| noiseStrength | 0.8 | Visible organic drift |
| handStreamBalance | 0.5 | Balance hand/stream particles |
| streamIntensity | 0.9 | Strong stream presence |
| streamResponsiveness | 1.5 | Quick stream reactions |
| spacingStiffness | 0.5 | Looser, more organic |
| depthExaggeration | 1.0 | Full depth |
| showClay | false | Streams are the focus |
| clayJitterAmplitude | 0.006 | Moderate (if clay enabled) |
| clayJitterSpeed | 1.2 | Faster organic motion |

### Interaction Notes
- **Pinch**: Creates attraction points that streams react to
- **Grab**: Not the focus; streams continue flowing
- **Two-hand**: Streams connect matching fingertips between hands
- **Clay**: Disabled by default but can be toggled

### Do's
- Let particles drift and flow naturally
- Make streams the dominant visual element
- Embrace organic, slightly chaotic motion

### Don'ts
- Don't show hand connection lines — they fight with streams
- Don't make motion too snappy — fluidity is key
- Don't reduce particle count — density creates the flow effect

---

## 4. Structure

### Intent Statement
An analytical, wireframe-focused mode that reveals the underlying structure of both hands and clay. The feeling is technical, precise, and architectural.

### Visual Hierarchy
1. **Hand connection lines** (primary) — skeletal wireframe dominates
2. **Clay connection lines** (co-primary) — internal structure visible
3. **Hand particles** (secondary) — joints marked clearly
4. **Clay particles** (secondary) — structural nodes visible

### Motion Characteristics
- **Precise and stable** — minimal drift, tight spacing
- **Low latency** — immediate response to hand movement
- **Low noise** — structure should not waver
- **Moderate flow** — subtle internal motion only

### Color & Contrast Notes
- **Connection lines**: Higher opacity than other modes (25-30%)
- **Particles**: Slightly smaller, more point-like
- **Glow intensity**: Low (0.25) — structural, not atmospheric
- **Depth exaggeration**: Slightly enhanced (1.1) — emphasizes 3D structure

### Parameter Preset Table

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| totalParticles | 90 | Moderate density |
| particleSize | 0.32 | Smaller, joint-like |
| glowIntensity | 0.25 | Minimal glow |
| colorIntensity | 0.85 | Slightly muted |
| showStreams | false | Would obscure structure |
| showLinks | true | Structural connectivity |
| showHandLines | true | Core visual feature |
| showClay | true | Structural mass |
| clayParticles | 80 | Moderate, readable |
| clayRadius | 1.1 | Moderate size |
| sculptStrength | 0.6 | Balanced response |
| showClayLines | true | Internal structure visible |
| flowStrength | 0.6 | Subtle internal motion |
| noiseStrength | 0.4 | Stable structure |
| spacingStiffness | 0.8 | Tight, architectural |
| depthExaggeration | 1.1 | Enhanced 3D depth |
| clayJitterAmplitude | 0.001 | Barely perceptible |
| clayJitterSpeed | 0.6 | Slow, stable |

### Interaction Notes
- **Pinch**: Precise manipulation; structure lines update in real-time
- **Grab**: Compresses clay while maintaining structural integrity
- **Pick-and-move**: Enabled — manipulate individual structural nodes
- **Streams**: Disabled — too organic for this mode

### Do's
- Emphasize connection lines over particle glow
- Maintain tight, even spacing
- Show the skeleton/wireframe clearly

### Don'ts
- Don't add excessive glow or bloom
- Don't enable streams — they obscure structure
- Don't increase noise — stability is key

---

## 5. Expressive

### Intent Statement
Maximum visual impact and creative freedom. All features enabled, higher particle counts, visible effects. The feeling is artistic, energetic, and immersive.

### Visual Hierarchy
1. **Everything visible** — no single dominant element
2. **Hand particles + streams** (co-primary) — rich hand visualization
3. **Clay** (co-primary) — interactive sculptable mass
4. **All connection lines** (secondary) — structural scaffolding

### Motion Characteristics
- **Dynamic and lively** — high flow, visible noise
- **Moderate latency** — balance between responsiveness and smoothness
- **Visible jitter** — clay breathes noticeably, particles drift
- **High responsiveness** — quick reactions to gestures

### Color & Contrast Notes
- **Full brightness**: Color intensity at 1.1 (slightly boosted)
- **Glow intensity**: High (0.6) — visible particle halos
- **Depth exaggeration**: Enhanced (1.2) — dramatic 3D depth
- **All connection lines visible** — creates rich visual tapestry

### Parameter Preset Table

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| totalParticles | 130 | Dense, rich visualization |
| particleSize | 0.45 | Larger, more visible |
| glowIntensity | 0.6 | Strong glow halos |
| colorIntensity | 1.1 | Boosted vibrancy |
| showStreams | true | Full feature set |
| showLinks | true | Rich connectivity |
| showHandLines | true | Structural visibility |
| flowStrength | 1.0 | High internal motion |
| noiseStrength | 0.7 | Visible organic drift |
| handStreamBalance | 0.4 | Balanced allocation |
| streamIntensity | 0.85 | Strong streams |
| streamResponsiveness | 1.3 | Quick reactions |
| spacingStiffness | 0.5 | Looser, organic |
| depthExaggeration | 1.2 | Dramatic depth |
| showClay | true | Full feature set |
| clayParticles | 100 | Dense sculptable mass |
| clayRadius | 1.3 | Large presence |
| sculptStrength | 0.7 | Responsive sculpting |
| showClayLines | true | Full visibility |
| clayJitterAmplitude | 0.004 | Noticeable life |
| clayJitterSpeed | 1.0 | Moderate speed |

### Interaction Notes
- **Pinch**: Attracts particles, enables pick-and-move
- **Grab**: Squeezes clay dramatically
- **Two-hand**: Streams connect, clay stretches
- **Pick-and-move**: Enabled with visible feedback

### Do's
- Embrace visual richness and layering
- Allow all features to coexist
- Make effects visible and satisfying

### Don'ts
- Don't reduce features — this mode is about abundance
- Don't mute colors — vibrancy is the goal
- Don't eliminate motion — energy defines this mode

---

## Theme Color Reference

All modes share the "Warm Minimal" palette:

| Element | Color | Notes |
|---------|-------|-------|
| Background (dark) | `#0a0908` | Deep warm black |
| Background (light) | `#f5f3ef` | Warm off-white |
| Hand particles | Pearl grey `rgb(0.72, 0.74, 0.78)` | Neutral, warm-shifted |
| Clay particles | Terracotta (hue 0.05) | `hsl(18°, 45%, 45%)` |
| Streams | Warm cream | Subtle, not white |
| Connection lines (hand) | Pearl grey @ 25% opacity | Matches particles |
| Connection lines (clay) | Terracotta @ 15% opacity | Matches clay |
| UI accent | `#d4b896` | Warm amber |

---

## Implementation Notes

1. **Preset application**: When switching modes, apply all settings atomically
2. **Clay shape preservation**: Mode switch does NOT reset clay deformation
3. **Jitter parameters**: Added `clayJitterAmplitude` and `clayJitterSpeed` to preset type
4. **Pick-and-move**: Enabled in all modes where clay is visible

---

*Document version: 1.0*
*Last updated: 2026-01-24*
