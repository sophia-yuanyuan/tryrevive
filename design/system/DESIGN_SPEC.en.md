# Cohere · Design system migration spec

> Source: https://cohere.com  ·  Curated by OpenDesign  ·  en

> This site is a great example of a premium, clean developer-focused AI platform with strong typography and restraint.

## 1. Identity DNA

The design system for Cohere operates like a well-guarded vault: its strength is not in ornate decoration but in disciplined structure. The identity is forged from a strict, high-contrast foundation of black and white, establishing an immediate sense of authority and enterprise-grade security. This clarity of purpose is the bedrock upon which every component and interaction is built, signaling a focus on powerful AI infrastructure rather than transient trends.

**One-liner:** A clean, premium AI platform focused on developer tools and data ownership.
**Keywords:** AI · Infrastructure · Ownership · Data · Developer
**Analogy:** A clean, premium technology platform for enterprise AI.

## 2. Color

The palette is a study in restraint, built on a high-contrast black-and-white foundation. Accent color is used with surgical precision, reserved solely for critical status indicators like readiness chips, ensuring the visual field remains uncluttered and the primary content commands attention.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | main background |
| `--bg-soft` | `#F9FAFB` | card background |
| `--ink` | `#000000` | body text |
| `--ink-soft` | `#4B5563` | secondary text |
| `--muted` | `#9CA3AF` | placeholder |
| `--accent` | `#1E1E1E` | single accent |
| `--line` | `rgba(229, 231, 235, 1.0)` | divider |

**Color principle:** High-contrast monochrome with subtle grays for hierarchy, accented by brand-specific colors in illustrations.

The principle is absolute: contrast and clarity above all, using color only where it carries specific, functional meaning.

## 3. Typography

Typography is set in a clean geometric sans-serif, establishing a tone that is both modern and authoritative. The scale is purposefully limited, distinguishing primarily between a commanding hero headline and the precise, readable text for paragraphs and navigation, reinforcing the hierarchy of information over decorative flourish.

- **Display:** sans-serif
- **Body:** sans-serif
- **Mono:** monospace

| Token | Size | Line-height | Weight | Letter-spacing | Use |
|---|---|---|---|---|---|
| display | 56px | 1.1 | 400 | -1px | Primary headline (Own your AI) |
| headline | 32px | 1.2 | 400 | 0px | Subheadline (Your data...) |
| body | 16px | 1.5 | 400 | 0px | Standard body text |
| caption | 14px | 1.4 | 400 | 0px | Secondary information |

**Type rules:**
- Display font is highly legible sans-serif.
- Body text uses standard system font stack fallback.
- Monospace for code elements.

## 4. Spacing

Generous vertical spacing defines the system's rhythm, allowing each element to breathe within the layout.

- **Base unit:** 4px
- **Scale:** 4 / 8 / 16 / 24 / 32 / 48 / 64 / 96 px
- **Rhythm:** Generous whitespace and standard 8pt-based spacing scale.

## 5. Surfaces

Depth is communicated through clean separation rather than dimensional effects. Surfaces rely on subtle 1px borders or, more often, the intelligent use of whitespace and layout positioning to define boundaries.

- **Radius:** sm 4px · md 8px · lg 12px · pill 999px
- **Shadows:**
  - 0px 4px 6px -1px rgba(0, 0, 0, 0.1)
- **Borders:** 1px solid #E5E7EB

## 6. Layout

The layout skeleton begins with a centered, single-column hero that establishes the core message with authority. It then transitions into a multi-column visual grid, designed to showcase products and use cases with clarity and visual richness.

- **Container max:** 1200px
- **Paragraph max:** 680px
- **Grid:** 12 columns, gutter 24px
- **Breakpoints:** 768 / 1024 px

**Skeleton:** Standard 12-column grid with centered container.

## 7. Motion & Interaction

Motion philosophy is one of professional purpose and minimal intervention. Durations are calibrated from micro (220ms) to medium (800ms) for distinct, smooth state changes, governed by a consistent ease curve that avoids distraction.

- **Durations:** micro 220ms · small 400ms · medium 800ms
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)`
- **Patterns:**
  - Smooth transitions for hover states.
  - Subtle fade-ins for content sections.

- **Hover:** Subtle color changes or slight elevation.
- **Click:** Scale down or color shift.
- **Transition:** All properties transition smoothly (all 0.2s ease).
- **Keyboard:** Standard focus outlines for accessibility.

## 8. Voice & Don'ts

The editorial voice is authoritative, confident, and direct. Headlines are short, declarative statements, and calls to action are clear and action-oriented, mirroring the design's own straightforward precision.

- **Tone:** Professional, confident, and slightly technical.
- **Headline style:** Direct, punchy, and benefit-oriented.
- **CTA style:** Action-oriented (e.g., Request a demo, Explore products).
- **Avoid:** Jargon overload / Overly casual tone / Ambiguous phrasing

### Don'ts
- ❌ don't use drop shadows — screenshot shows flat design with subtle borders instead
- ❌ don't use complex gradients — screenshot shows clean white backgrounds instead
- ❌ don't use decorative icons — screenshot shows minimal icon usage instead
- ❌ don't use all-caps for body text — screenshot shows standard sentence case instead
- ❌ don't use bright primary colors as backgrounds — screenshot shows dark text on white instead
- ❌ don't use serif fonts for headlines — screenshot shows clean sans-serif instead

The system deliberately omits playful language, complex gradients, and decorative elements to maintain its serious, enterprise-focused posture.

## System Prompt (paste into AI tool)

```
This is a clean, premium AI platform targeting developers and enterprises. It features a high-contrast monochrome palette (#000000 on #FFFFFF) with subtle grays (#4B5563, #9CA3AF) and thin borders (#E5E7EB). Typography relies on humanist-sans and grotesque-sans categories with a clear hierarchy from 56px display down to 14px captions. The layout uses a generous 12-column grid with standard 8pt spacing. Critical donts include: no drop shadows, no complex gradients, no decorative icons, no all-caps body text, no bright backgrounds, and no serif headlines. The voice is professional and technical, with direct CTAs.
```
