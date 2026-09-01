---
name: Cohere
description: "This site is a great example of a premium, clean developer-focused AI platform with strong typography and restraint."
version: alpha

colors:
  background: "#FFFFFF"
  primary: "#FF8A65"
  ink: "#000000"
  secondary: "#4B5563"
  tertiary: "#1E1E1E"
  neutral: "#9CA3AF"
  bg-soft: "#F9FAFB"
  line: "rgba(229, 231, 235, 1.0)"

typography:
  display:
    fontFamily: sans-serif
    fontSize: 56px
    lineHeight: 1.1
    fontWeight: 400
    letterSpacing: "-1px"
  headline:
    fontFamily: sans-serif
    fontSize: 32px
    lineHeight: 1.2
    fontWeight: 400
    letterSpacing: "0px"
  body:
    fontFamily: sans-serif
    fontSize: 16px
    lineHeight: 1.5
    fontWeight: 400
    letterSpacing: "0px"
  caption:
    fontFamily: sans-serif
    fontSize: 14px
    lineHeight: 1.4
    fontWeight: 400
    letterSpacing: "0px"

rounded:
  sm: 4px
  md: 8px
  lg: 12px
  pill: 999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px

---

## Overview

A clean, premium AI platform focused on developer tools and data ownership.

*A clean, premium technology platform for enterprise AI.*

## Colors

High-contrast neutrals with TryRevive Warm Coral reserved for primary actions, selection and focus.

- **Background (`#FFFFFF`)** — uses `bg` token
- **Primary brand (`#FF8A65`)** — uses `primary` token
- **Primary text (`#000000`)** — uses `ink` token
- **Secondary text (`#4B5563`)** — uses `ink-soft` token
- **Accent (`#1E1E1E`)** — uses `accent` token
- **Muted (`#9CA3AF`)** — uses `muted` token
- **Borders (`rgba(229, 231, 235, 1.0)`)** — uses `line` token

## Typography

- **Display:** sans-serif
- **Body:** sans-serif
- **Mono:** monospace

- Display font is highly legible sans-serif.
- Body text uses standard system font stack fallback.
- Monospace for code elements.

## Layout

Standard 12-column grid with centered container.

*Rhythm:* Generous whitespace and standard 8pt-based spacing scale.

## Elevation & Depth

- 0px 4px 6px -1px rgba(0, 0, 0, 0.1)
- Borders: 1px solid #E5E7EB

## Shapes

- `sm`: 4px
- `md`: 8px
- `lg`: 12px
- `pill`: 999px

## Components

- **button:** Rounded pill shape for primary actions, clean sans-serif text, high contrast background.
- **card:** Rounded corners, clean borders, subtle hover states.
- **chip:** Small rounded tags or status indicators.
- **input:** Standard form fields with subtle borders.
- **hero:** Large display type, clean layout, centered or left-aligned.

## Do's and Don'ts

**Don't:**
- don't use drop shadows — screenshot shows flat design with subtle borders instead
- don't use complex gradients — screenshot shows clean white backgrounds instead
- don't use decorative icons — screenshot shows minimal icon usage instead
- don't use all-caps for body text — screenshot shows standard sentence case instead
- don't use bright primary colors as backgrounds — screenshot shows dark text on white instead
- don't use serif fonts for headlines — screenshot shows clean sans-serif instead

---

## System Prompt (paste into AI agent)

```
This is a clean, premium AI platform targeting developers and enterprises. It features a high-contrast monochrome palette (#000000 on #FFFFFF) with subtle grays (#4B5563, #9CA3AF) and thin borders (#E5E7EB). Typography relies on humanist-sans and grotesque-sans categories with a clear hierarchy from 56px display down to 14px captions. The layout uses a generous 12-column grid with standard 8pt spacing. Critical donts include: no drop shadows, no complex gradients, no decorative icons, no all-caps body text, no bright backgrounds, and no serif headlines. The voice is professional and technical, with direct CTAs.
```
