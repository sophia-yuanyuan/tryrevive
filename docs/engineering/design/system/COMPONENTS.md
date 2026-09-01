# Component contracts

All product components inherit foundations from `tokens.css`, `foundations.css`, and `primitives.css`. Vue primitives live in `src/renderer/design-system/primitives`.

| Contract | Use | Required states |
| --- | --- | --- |
| `TrButton` / `.tr-button` | One clear action | default, hover, pressed, focus-visible, disabled, loading |
| `TrField` / `.tr-field` | Short text entry | default, hover, focus, disabled, invalid, help |
| `.tr-card` | One bounded information or action group | default; use semantic status variants inside |
| `TrChip` / `.tr-chip` | Compact choice | unselected, selected, focus-visible, disabled |
| `.tr-status` | Inline feedback | neutral, success, info, warning, danger |
| `.tr-icon-button` | Icon-only control | accessible name, default, hover, pressed, focus, disabled |

## Composition rules

- A screen has one primary button. Additional actions use secondary or quiet treatment.
- A card does not nest another elevated card. Use a sunken section or divider instead.
- Labels remain visible; placeholders are examples, not labels.
- Errors appear next to the field, use `role="alert"` when introduced after submission, and move focus to the first invalid field for failed multi-field submission.
- Icon-only controls require `aria-label`. Decorative icons use `aria-hidden="true"`.
- Status meaning always includes words, never color alone.
- Dialogs use one translucent structural layer and an opaque content surface; stacked glass is prohibited.

## Legacy compatibility

During migration, `--paper`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-dark`, `--focus`, and `--danger` are aliases to semantic Warm Precision tokens. They are temporary adapters, not new authoring APIs. Phase 4 removes component-level arbitrary visual values and prevents new ones through `npm run design:check`.
