# Design System — Finance App

**Style:** Stale  
**Version:** 0.2  
**Last updated:** Jun 2026

---

## Changelog from v0.1

- **Typography:** Two families — Playfair Display (serif) for large values, Inter (sans) for all UI chrome. Courier New eliminated.
- **Max width:** 1100px → 1200px.
- **Colours:** Palette restated with VS Code Dark+ / Light+ as the reference. Surfaces, foreground, and semantic accent values are derived directly from those themes.
- **Spacing:** Base unit changed from 4px to 3px. All spacing, size, and radius values are strict multiples of 3.

---

## 1. Colour Tokens

Surfaces and text come directly from the VS Code editor/sidebar palette. Semantic accents map to VS Code's syntax token colours — this makes the palette immediately familiar to developers and coherent across modes without needing a separate colour rationale.

```css
:root {
  /* Surfaces — VS Code Light+ editor and sidebar */
  --color-bg: #f3f3f3; /* VS Code sidebar background          */
  --color-surface: #ffffff; /* VS Code editor background           */

  /* Text */
  --color-text: #1f1f1f; /* Near-black, VS Code foreground      */
  --color-text-sub: #3b3b3b; /* Secondary text                      */
  --color-text-muted: #717171; /* VS Code line number / hint grey     */

  /* Structure */
  --color-border: #e4e4e4; /* VS Code sidebar border              */
  --color-rule: rgba(0, 0, 0, 0.055); /* Ledger paper line     */

  /* Semantic accents — VS Code Light+ syntax token colours */
  --color-revenue: #098658; /* Number literal green                */
  --color-outcome: #a31515; /* String literal red                  */
  --color-net: #267f99; /* Type / class teal                   */
  --color-credit: #795e26; /* Function / member gold              */
}

[data-theme="dark"] {
  /* Surfaces — VS Code Dark+ editor and sidebar */
  --color-bg: #1e1e1e; /* VS Code editor background           */
  --color-surface: #252526; /* VS Code sidebar background          */

  /* Text */
  --color-text: #d4d4d4; /* VS Code foreground                  */
  --color-text-sub: #9d9d9d; /* Mid grey                            */
  --color-text-muted: #6e6e6e; /* VS Code line number grey            */

  /* Structure */
  --color-border: #3c3c3c; /* VS Code input border                */
  --color-rule: rgba(255, 255, 255, 0.04);

  /* Semantic accents — VS Code Dark+ syntax token colours */
  --color-revenue: #4ec9b0; /* Type / class teal                   */
  --color-outcome: #ce9178; /* String literal orange               */
  --color-net: #569cd6; /* Keyword blue                        */
  --color-credit: #dcdcaa; /* Function / member yellow            */
}
```

### Usage rules

- `--color-bg` is the page shell only. Never use inside a component.
- `--color-surface` is for all cards and overlays.
- Semantic accents appear on: the stat value, the left-border on stat cards, and progress bar fills. Nowhere else.
- Text colours must not be used on coloured backgrounds without verifying contrast. The accent tokens are not text colours by default.
- Never introduce a raw hex value in component code. All colours must map to a token defined here.

---

## 2. Typography

Two families with a strict split by content type.

```
Serif: 'Playfair Display', Georgia, serif
Sans:  'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif
```

**Playfair Display** is used exclusively for large monetary values and percentages. At 21px and 27px, its high stroke contrast gives values a printed-ledger quality. It is not used below 18px — Playfair's low x-height makes it unsuitable for small text.

**Inter** handles everything else: labels, notes, body copy, dropdown text, axis ticks, alert text, page headings. It is neutral enough to stay out of the way and legible at 9px with uppercase tracking.

### Scale

All sizes are multiples of 3.

| Token             | Size | Family | Case      | Tracking | Usage                                 |
| ----------------- | ---- | ------ | --------- | -------- | ------------------------------------- |
| `--text-label`    | 9px  | Sans   | Uppercase | 0.15em   | All card/section labels               |
| `--text-body`     | 12px | Sans   | Sentence  | 0        | Notes, helper text, dropdowns, alerts |
| `--text-title`    | 15px | Sans   | Uppercase | 0.04em   | Page heading                          |
| `--text-value-sm` | 21px | Serif  | —         | −0.3px   | Stat card values                      |
| `--text-value-lg` | 27px | Serif  | —         | −0.3px   | Hero values (e.g. credit card)        |

### Rules

- `font-variant-numeric: tabular-nums` is **required** on all numeric text. Non-negotiable.
- Labels are always `text-transform: uppercase`. Never title-case a label.
- **Serif is only permitted at 21px and above.** Tooltip values, axis ticks, and any number below that threshold use Sans.
- **No `font-weight` above 400** in either family. Emphasis is expressed through colour and size only.

---

## 3. Spacing

Base unit: **3px**. Every spacing value is a multiple of 3 — padding, margin, gap, width, height, and border-radius. There are no exceptions.

| Token       | Value | Usage                                             |
| ----------- | ----- | ------------------------------------------------- |
| `--space-1` | 3px   | Dot-to-label gap, inline micro-gaps               |
| `--space-2` | 6px   | Small internal gaps                               |
| `--space-3` | 9px   | Compact internal padding, dropdown option padding |
| `--space-4` | 12px  | Grid gaps, progress-bar margin                    |
| `--space-5` | 15px  | Standard inner padding (bottom of stat card)      |
| `--space-6` | 18px  | Standard inner padding (top/sides of cards)       |
| `--space-7` | 21px  | Chart section top padding                         |
| `--space-8` | 24px  | Page horizontal padding                           |
| `--space-9` | 27px  | Page vertical padding, header margin-bottom       |

### Page layout

```
Max-width:     1200px, centred
Page padding:  27px top/bottom × 24px left/right

Stat grid:     repeat(4, 1fr), gap: 12px
Bottom grid:   1fr 279px,       gap: 12px
```

`279px = 93 × 3`. The sidebar column is exactly a multiple of 3.

---

## 4. Shape

| Context                     | `border-radius` |
| --------------------------- | --------------- |
| Cards, dropdowns, alert box | 3px             |
| Dropdown option on hover    | 3px             |
| Progress bars               | 0px             |
| Dot indicators (6px × 6px)  | 50%             |

Progress bars have `border-radius: 0` — a flat track with no rounding reads as ruled paper or a graph axis, which suits the aesthetic. The dot indicators are perfectly circular; their diameter is 6px (a multiple of 3).

**Never use `border-radius` above 6px on any container.** If an element looks too harsh, the fix is colour or spacing, not rounding.

---

## 5. Elevation & Shadow

Flat in dark mode. Minimal in light mode.

| Context        | Light mode                    | Dark mode                     |
| -------------- | ----------------------------- | ----------------------------- |
| Cards          | `0 1px 3px rgba(0,0,0,0.07)`  | `none`                        |
| Dropdown panel | `0 6px 18px rgba(0,0,0,0.15)` | `0 6px 18px rgba(0,0,0,0.45)` |
| All else       | `none`                        | `none`                        |

No blur values above 18px. No `drop-shadow` filters. No glow, no inner shadow, no layered shadow stacks.

---

## 6. Texture

The ledger line is the only atmospheric element in this style. It applies to the **page background only**.

```css
.page-shell {
  background-color: var(--color-bg);
  background-image: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 27px,
    var(--color-rule) 27px,
    var(--color-rule) 28px
  );
}
```

27px is the rule interval (a multiple of 3; also aligns with `--space-9`). Do not adjust it.

Cards are fully opaque (`var(--color-surface)`). The ledger lines do not show through card backgrounds. No other texture, pattern, gradient overlay, or background effect is permitted anywhere in the application.

---

## 7. Component Patterns

### 7.1 Stat Card

```
┌─ 2px left accent border
│  [LABEL]      9px, uppercase, 0.15em tracking, --color-text-muted
│
│  [VALUE]      21px, --color-{semantic}
│
│  [note]       12px, --color-text-muted or --color-{semantic}
└──────────────────────────────────────────────
Padding: 18px top × 18px right × 15px bottom × 18px left
```

```css
.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 2px solid var(--color-{semantic});
  border-radius: 3px;
  padding: 18px 18px 15px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07); /* light only */
}
```

Accent assignment:

| Card          | Token             |
| ------------- | ----------------- |
| Total Revenue | `--color-revenue` |
| Total Outcome | `--color-outcome` |
| Net Balance   | `--color-net`     |
| Savings Rate  | `--color-credit`  |

### 7.2 Data Card

General-purpose container. Used for the chart panel and credit panel.

```css
.data-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07); /* light only */
}
```

Internal padding is set per card to suit content. There is no fixed card padding token. Sections within a card are separated by spacing alone — no nested rules or dividers.

### 7.3 Chart (Area)

```
Stroke width:       1.2px (not a spacing value — exempt from 3px grid)
Fill gradient:      0% opacity top → 20% at stop 1 → 0% at bottom
Dot:                none at rest; 3px radius on hover
Grid lines:         none
Axis lines:         none
Tick lines:         none
Tick font:          12px monospace, --color-text-muted
Tooltip cursor:     1px solid --color-border
Chart height:       210px
```

The Y-axis tick formatter omits the zero value label. Recharts config:

```jsx
<YAxis tickFormatter={v => v === 0 ? '' : `${(v / 1000).toFixed(0)}k`} />
<Area strokeWidth={1.2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
```

### 7.4 Dropdown

```css
.dropdown-trigger {
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--color-text-sub);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 9px 12px;
}

.dropdown-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 3px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
}

.dropdown-option {
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  padding: 9px 12px;
  border-radius: 3px;
  color: var(--color-text-sub);
}

.dropdown-option[aria-selected="true"] {
  color: var(--color-revenue);
  background: color-mix(in srgb, var(--color-revenue) 10%, transparent);
}
```

### 7.5 Progress Bar

```css
.progress-track {
  height: 3px;
  background: var(--color-border);
  border-radius: 0;
}

.progress-fill {
  height: 100%;
  border-radius: 0;
  opacity: 0.7;
  background: var(--color-{semantic});
}
```

Height is exactly 3px — one base unit. Do not increase it.

### 7.6 Alert / Notice

Text format: lead with `!` and a space. No SVG icons, no icon fonts, no emoji.

```css
.notice {
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  letter-spacing: 0.03em;
  border-radius: 3px;
  padding: 9px 12px;
  color: var(--color-credit);
  background: color-mix(in srgb, var(--color-credit) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-credit) 30%, transparent);
}
```

---

## 8. Conventions & Hard Rules

**Always:**

- Token names in code, never raw hex values.
- `font-variant-numeric: tabular-nums` on any element displaying a number.
- `text-transform: uppercase` and `letter-spacing: 0.15em` on all labels.
- All spacing, size, and radius values as multiples of 3.
- `!` + space as the text prefix for all alert/notice components.
- Playfair Display only at 21px and above.
- Inter for all text below 21px, regardless of content type.
  **Never:**
- A third font family.
- `font-weight` above 400.
- `border-radius` above 6px.
- `box-shadow` blur above 18px.
- Shadows in dark mode.
- Gradients, animated gradients, glows, or blur effects of any kind.
- Raw hex values in component code.
- Spacing, padding, or size values that are not multiples of 3.
- Transitions slower than 150ms or faster than 0ms. No spring animations.

---

## 9. Theming Implementation

Theme switching is controlled by `data-theme` on `<html>`. Components contain zero theme logic — they reference tokens only.

```js
document.documentElement.setAttribute("data-theme", "dark"); // or 'light'
```

Default (no attribute present): light mode.

`prefers-color-scheme` can be used to set the initial value but should not override an explicit user selection stored in local storage.

---

## 10. What This Style Is Not

Proposed additions that require any of the following do not belong in this system. Revisit the spec before proceeding rather than making a local exception:

- Colours with saturation above what the VS Code Dark+ / Light+ palette uses.
- Border-radius above 6px.
- A second typeface (even "just for headings").
- Drop shadows in dark mode.
- Animations beyond opacity and translate at ≤150ms.
- Icon fonts or SVG icons as status indicators.
- Coloured page backgrounds — only `--color-bg` is permitted as the page surface.
