# Design Map

## Spacing Scale
- 8px (base unit)
- 12px
- 16px
- 24px
- 32px
- 64px
- 72px
- 224px (macro section gap)
- 274px (macro section gap)

## Font Hierarchy
- Display Large: 72px (weight 510, line-height 72px, family Inter Variable)
- Hero Title: 64px (weight 510, line-height 64px, family Inter Variable)
- H1 Header: 48px (weight 510, line-height 48px, family Inter Variable)
- H3 Header: 24px (weight 590, line-height 31.92px, family Inter Variable)
- Body Large: 20px (weight 510, line-height 26.6px, family Inter Variable)
- H4 Header: 16px (weight 590, line-height 24px, family Inter Variable)
- Body text: 15px (weight 400, line-height 24px, family Inter Variable)
- Caption: 13px (weight 510, line-height 19.5px, family Inter Variable)

## Color Palette
- pageBackground: #08090a (rgb(8, 9, 10))
- text-primary: #f7f8f8 (rgb(247, 248, 248))
- text-secondary: #d0d6e0 (rgb(208, 214, 224))
- text-muted: #8a8f98 (rgb(138, 143, 152))
- text-dark-muted: #62666d (rgb(98, 102, 109))
- surface: rgba(255, 255, 255, 0.05)
- surface-dark: #18191a (rgb(24, 25, 26))
- border: #23252a (rgb(35, 37, 42))
- accent-purple: #5e6ad2 (rgb(94, 106, 210))
- accent-blue: #004eff (rgb(0, 78, 255))

## Image Ratios
- Hero: 2.15:1
- Hero Full: 1.79:1
- Feature: 1.78:1

## Component Tokens
- border-radius: 2px, 4px, 6px, 8px, 12px, 9999px (pill)
- shadows:
  - Card Border Shadow: rgba(255, 255, 255, 0.03) 0px 0px 0px 1px inset, rgba(255, 255, 255, 0.04) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.6) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 4px 4px 0px
  - Drop Shadow: rgba(0, 0, 0, 0.4) 0px 2px 4px 0px
  - Border Shadow: rgba(0, 0, 0, 0.2) 0px 0px 0px 1px
- grid: max-width 1440px, columns 4, gutter 64px

---

# Taste DNA

### Restraint of Brand Accent
- **Trigger**: When selecting background and interactive colors for the workspace tool
- **Decision**: Chose an entirely near-black background (#08090a) and white/gray typography (#f7f8f8, #d0d6e0), restricting primary brand accents (#5e6ad2) strictly to key interactive surfaces
- **Reason**: Because on near-black backgrounds, high contrast white text already draws strong visual attention. Adding excessive bright branding colors would distract the user from content and cheapen the aesthetic to a generic template
- **Evidence**: rgb(8,9,10) pageBackground, accentCandidates are primarily whites and grays, with bright purple used only for primary button actions

### Engraved Depth over Projected Layers
- **Trigger**: When defining bounds and visual weight for layout panels and card surfaces
- **Decision**: Chose thin inset borders and multi-layered border outlines (1px border-color #23252a inset) instead of standard fuzzy outer drop shadows
- **Reason**: Because on dark canvases, drop shadows look muddy and imply separated floating sections. Crisp inset borders make panels feel engraved into the interface, reflecting the precision of a professional developer tool
- **Evidence**: rgb(35, 37, 42) 0px 0px 0px 1px inset, rgba(255,255,255,0.03) 0px 0px 0px 1px inset

### Macro-pauses via Massive Section Gaps
- **Trigger**: When spacing out content modules along the vertical scroll layout
- **Decision**: Chose massive, deliberate vertical gaps of 224px to 274px over standard 80px–100px block margins
- **Reason**: Because massive vertical margins create natural pauses that isolate distinct features, ensuring the user digests one key capability before moving to the next, prioritising focus over a compact scroll footprint
- **Evidence**: sectionGaps of 224px and 274px

### Optical Typographic Weights
- **Trigger**: When setting typographic weights for display headers and large titles
- **Decision**: Chose custom intermediate optical weights (510 weight for H1/H2 sizes, 590 weight for subheadings) instead of standard bold (700) or medium (500)
- **Reason**: Because at large display sizes (48px–72px), standard bold weights bloat letter forms and clog white space, while custom intermediate weights retain high legibility and precise visual balance
- **Evidence**: H1 size 64px weight 510, H2 size 48px/72px weight 510, H3 size 20px/24px weight 590
