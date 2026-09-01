# TryRevive design system — Warm Precision v1

This directory is the single source of truth for TryRevive's visual language. It turns the product promise — recover the real context, complete one useful step, and return without losing progress — into a calm, warm, and precise interface system.

## Token layers

1. `tokens/reference.tokens.json` contains raw palette, type, spacing, radius, shadow, motion, size, opacity, z-index, and breakpoint primitives.
2. `tokens/semantic.tokens.json` assigns product meaning and light/dark themes. Product code should consume this layer by default.
3. `tokens/component.tokens.json` defines stable contracts for buttons, fields, cards, chips, dialogs, navigation, and focus rings.
4. `src/renderer/design-system/generated/` is generated output. Never edit it by hand.

Run `npm run design:build` after changing token JSON. Run `npm run design:check:tokens` to verify generated artifacts are current.

## Rules

- Components use semantic or component variables, never raw palette values.
- Color is never the only state cue. Pair it with text, iconography, shape, or position.
- Interactive targets are at least 44 by 44 CSS pixels, with immediate pressed feedback.
- Every keyboard-operable control has a visible focus state.
- Motion is short, interruptible, and disabled or simplified for reduced-motion users.
- Translucent material is reserved for a single structural floating layer such as navigation or a dialog; content cards remain opaque.
- Desktop and mobile are one responsive system. Required verification widths are 360, 390, 768, and 1440 CSS pixels.

## Theme contract

The default is light. Set `data-theme="dark"` on `html` to select dark values. If no explicit theme is set, the application may follow `prefers-color-scheme`. High-contrast and reduced-transparency preferences are handled by runtime foundation styles.
