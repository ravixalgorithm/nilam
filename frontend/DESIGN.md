# NILAM — Interface Design System

Use this doc when building or extending UI for NILAM (crop / field analysis). Match the craft in `src/styles.css` and `src/App.jsx`; do not invent a second visual language.

---

## Product feel

**Warm technical agriculture** — paper canvas, near-black chrome, leaf-green accent. Dense but calm. Feels like a floated desktop app (Chrome-style tabs + dark sidebar), not a marketing site or purple SaaS dashboard.

Keywords: earth neutrals · hatch shells · nested wells · tabular data · Iconsax Bold · flush chrome

---

## Stack & type

| Role | Choice |
|------|--------|
| UI font | **Plus Jakarta Sans** (`--font`) |
| Numbers / mono | **IBM Plex Mono** (`--font-mono`) |
| Icons | **iconsax-react**, `variant="Bold"`, `currentColor` |
| Color space | Prefer **OKLCH**; canvas hex `#f7f6f0` is intentional |

Base: `14px` / `line-height: 1.45` / `-webkit-font-smoothing: antialiased`.

**Type rules**

- Headings: tight tracking (`letter-spacing: -0.02em` to `-0.045em`), weight 600–700.
- Labels / kickers: 11–12px, weight 600–700, optional `letter-spacing: 0.05–0.06em`, uppercase sparingly (section labels, table headers).
- Body / meta: muted or faint; never pure gray that fights warm hue 95.
- Dynamic numbers: `font-variant-numeric: tabular-nums`. No italic on list percentages / KPIs.

---

## Color tokens

Copy from `:root` in `styles.css`. Hue **95** = warm paper; hue **145** = leaf green.

| Token | Role |
|-------|------|
| `--bg` | Pure panel surface (cards, modals) |
| `--canvas` | App workspace paper |
| `--side` | Dark chrome / sidebar / tab bar |
| `--text` / `--muted` / `--faint` | Primary → secondary → tertiary |
| `--line` / `--line-strong` | Hairlines, structure |
| `--accent` / `--accent-strong` / `--accent-ink` / `--accent-soft` | Primary action + emphasis |
| `--bar` / `--bar-fill` / `--bar-fill-off` | Reading marks / ranges |
| `--sow` / `--grow` / `--harvest` | Calendar season chips only |
| `--warn` | Errors / weak fit |

**Do not** default to purple-indigo gradients, cold blue SaaS, or flat pure white everywhere. Keep chroma low on neutrals.

---

## App chrome (required layout)

```
┌─ shell (near-black page) ─────────────────────────┐
│ sidebar │ container (inset padding)               │
│ (dark)  │ ┌─ app (rounded float) ───────────────┐ │
│         │ │ tabbar (Chrome tabs on --side)      │ │
│         │ │ panes → workspace + inputs          │ │
│         │ └─────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

- **Shell**: full viewport; dark page behind floated app.
- **Container**: ~10px inset so the app reads as a card in space.
- **App**: `border-radius: 16px`, dark top chrome, canvas body, deep soft shadow.
- **Tab bar**: active tab glider matches `--canvas` so the tab *becomes* the workspace. Inactive tabs are quiet. `+` sits tight to the last tab (~4px).
- **Workspace**: `border-top-left-radius` meets the active tab; panes use `--pane-inset` (12px).

Sidebar brand: **NILAM** uppercase wordmark + furrow-contour mark (stroke only, no tile background).

---

## Concentric hatch shells

Primary content pattern for results / empty / inputs groups:

```
outer radius = inner radius + shell pad
pad ≈ 3px, inner-r ≈ 14px
```

- Outer: faint diagonal hatch + soft paper fill + light elevation shadow.
- Inner card: `--bg` or `--canvas`, inset highlight (`inset 0 1px 0 …`), quiet 1px edge.
- Do **not** use loud borders or multi-layer neon glow.

Use shells for: metric summary, crop table, empty state, field inputs. Keep gap between sibling shells ~12px.

---

## Bento tiles (summary metrics)

Inside a metric shell: 12-column grid, paper tiles with:

1. **Head** — Iconsax icon in soft well + short label  
2. **Well** — large value (`bento-value`)  
3. **Foot** — pill (up/down) + one muted hint  

Avoid rainbow fills. Strong / weak states via `--accent-soft` and warm warn tints only.

---

## Lists & tables

- Sticky header row; compact row height (~58px crop rows).
- Fit / confidence as **percentages** (`99%`), centered, tabular, **not italic**.
- Odd rows: subtle canvas stripe (`is-odd`), not heavy zebra.
- Top pick: accent color on rank + fit; optional “Pick” badge.
- Data modal tables: generous cell padding (~11×16), sticky header, center-aligned cells when browsing raw data.

---

## Buttons

| Kind | Look |
|------|------|
| Primary (sidebar CTA) | `--accent` fill, light text, inset top highlight, soft green glow, `scale(0.96)` on press |
| Dark | `--text` fill on light surfaces |
| Ghost / secondary | transparent or hairline; hover `--hover` |
| Chrome controls | 28–32px square, no fill until hover |

Primary actions on the dark sidebar must **pop** (green), not match list-item gray.

---

## Chips & swatches

- Soil / season chips: pill (`border-radius: 999px`), soft inset ring.
- Soil color **swatches are circles** (`border-radius: 50%`), not rounded squares.
- Selected chip: `--accent-soft` + accent ink.

---

## Modals

- Fixed overlay, soft blur, centered panel, rise + fade (~180–220ms).
- `createPortal(…, document.body)` for overlays that must escape the shell grid.
- Header: kicker (uppercase accent) + title + muted sub + circular close (Iconsax `CloseCircle` Bold).
- Escape + backdrop click to dismiss; lock `body` overflow while open.

---

## Motion

- Prefer CSS transitions on exact properties (`background-color`, `color`, `transform`, `opacity`) — never `transition: all`.
- Press: `scale(0.96)`.
- Chrome / tabs: `cubic-bezier(0.32, 0.72, 0, 1)` or `cubic-bezier(0.2, 0, 0, 1)`.
- Respect `prefers-reduced-motion: reduce`.
- Stagger only rare entrances; not every hover.

---

## Density & spacing

- Prefer **one job per section**: one headline, one short support line, then content.
- Pane inset **12px**; half-side padding where panels already feel airy.
- Do not invent large empty “dashboard gaps” under tabs — shells are inset cards with normal pad, not flush-to-chrome bands unless deliberately Chrome-connected.
- Icons in heads: ~15–18px Bold.

---

## Copy tone

- Short, field-facing: “New analysis”, “Fit”, “In range”, “Analyses”.
- Avoid filler marketing (“Unlock insights”, “Power your farm”).
- Empty states: checklist progress + optional sample fill tiles inside a hatch shell.

---

## Anti-patterns (do not)

- Generic leaf logo in a green rounded square  
- Purple / indigo gradient themes  
- Inter / Roboto / system-ui as display face  
- Card-in-card with heavy drop shadows stacked  
- Left accent “active rail” strips on sidebar items  
- Italic KPI percentages  
- Emitting raw `6/7` fit counts — use `%`  
- Putting fullscreen modals as children of the CSS grid `.shell` (breaks layout)

---

## Recipe: new screen

1. Reuse tokens from `:root` — add a variable only if reused 2+ times.  
2. Place content in **workspace** (or sidebar) under existing chrome.  
3. Wrap major blocks in **hatch shell → inner card**.  
4. Use Iconsax Bold + Plus Jakarta; tabular nums for metrics.  
5. Primary CTA = accent button; secondary = quiet.  
6. Match motion tokens above; press scale `0.96`.  
7. Verify dark sidebar + paper canvas contrast still feels warm (hue 95), not cold gray.

---

## File map

| File | Owns |
|------|------|
| `src/styles.css` | Tokens, chrome, shells, bento, tables, modal |
| `src/App.jsx` | Shell structure, tabs, sidebar, results, dataset modal |
| `src/Slider.jsx` | Craft range control for field readings |
| `index.html` | Fonts + favicon (furrow mark) |

When in doubt, mirror an existing pattern in the results panel or sidebar rather than inventing a new component family.
