---
name: WhatsApp Community Bot — Control Center
description: Dark Aurora-Glow glassmorphism control panel for a self-hosted WhatsApp community bot.
colors:
  void: "#05070d"
  surface-glass: "#0F162694"
  surface-glass-soft: "#1820388C"
  line: "#82A5FF21"
  text: "#eaf0ff"
  muted: "#8d97b5"
  accent-cyan: "#00e5d0"
  accent-cyan-secondary: "#31b8ff"
  accent-cyan-dim: "#00E5D021"
  accent-cyan-glow: "#00E5D066"
  accent-violet: "#8b6bff"
  accent-violet-secondary: "#d06bff"
  accent-mint: "#42e695"
  accent-mint-secondary: "#3bb2b8"
  warn: "#ffb454"
  bad: "#ff5d7a"
  ok: "#37e08d"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.76rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.09em"
  mono:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "99px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-cyan-dim}"
    textColor: "{colors.accent-cyan}"
    rounded: "{rounded.md}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-cyan-dim}"
    textColor: "{colors.accent-cyan}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "11px 18px"
  button-danger:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.bad}"
    rounded: "{rounded.md}"
    padding: "11px 18px"
  card:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "18px"
  badge-ok:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  badge-bad:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.bad}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
---

# Design System: WhatsApp Community Bot — Control Center

## 1. Overview

**Creative North Star: "The Signal Room"**

A dark operations room for a bot that runs unattended: aurora-glow fields drift slowly behind glass panels, a single status dot tells you in one glance whether the connection is alive, and every number on screen ticks and pulses because it's live, not a screenshot. The palette is near-black and quiet by default; color only shows up where it means something — a cyan glow on the thing you can act on, amber for "watch this," red for "this broke," green for "this is fine." Underneath the technical shell, the bot itself is playful (games, coins, birthdays, emoji-rich lists), and the Control Center lets that personality surface in its interactive states: buttons glow on press, counters tween upward, toasts slide in with a bit of bounce-free energy. It explicitly rejects the flat, light, corporate-SaaS-admin look — this is a control console you'd want to watch at 2am, not a spreadsheet with rounded corners.

**Key Characteristics:**
- Near-black void background (`#05070d`) with slow-drifting aurora-glow blobs behind translucent glass panels.
- One primary accent (cyan by default, user-switchable to violet or mint) used sparingly — glows, active states, the status pulse — never as a body-text or large-surface color.
- Depth from blur + colored glow, not gray drop shadows: cards lift with an accent-tinted ring, not a heavier shadow.
- Playful, energetic component feedback (animated counters, hover lift, pulsing status dot, toast slide-in) layered on an otherwise precise, technical shell.
- Mobile-first: a bottom tab bar on phones becomes a sticky sidebar at ≥900px — the same components, no separate "desktop design."

## 2. Colors

The palette is a near-black glass surface with a single switchable accent; state colors (warn/bad/ok) are the only other saturated hues on screen.

### Primary
- **Signal Cyan** (`#00e5d0`): the default accent — active nav item, focus rings, the status-dot glow when connected, primary button text/glow, chart lines and bars. Used at low opacity (`accent-cyan-dim`, 13%) as a tint and background wash; full-strength only for glows, text, and thin strokes.
- **Signal Cyan — Secondary** (`#31b8ff`): pairs with Signal Cyan in the aurora field and the horizontal progress bars (`.hbar` gradient); never used alone.

### Secondary
- **Violet Signal** (`#8b6bff` / secondary `#d06bff`): the "violet" accent theme — a full swap-in replacement for Signal Cyan via `[data-accent="violet"]`, not a simultaneous second color.
- **Mint Signal** (`#42e695` / secondary `#3bb2b8`): the "mint" accent theme, same swap-in role as Violet.

### Neutral
- **Void** (`#05070d`): page background — the darkest surface, always visible at the edges around the aurora glow.
- **Glass Navy** (`rgba(15,21,38,.58)` / `#0F162694`): the standard panel background — sidebar, cards, tab bar, login card. Always paired with `backdrop-filter: blur(16px) saturate(1.25)`.
- **Glass Navy — Soft** (`rgba(24,32,56,.55)` / `#1820388C`): the hover/secondary glass tone — nav-link hover, toast background.
- **Hairline** (`rgba(130,165,255,.13)`): the one border color in the whole system, a faint cool-blue line at 13% opacity. Every glass panel, input, and button uses exactly this.
- **Ink** (`#eaf0ff`): primary text on dark surfaces.
- **Muted** (`#8d97b5`): secondary text — labels, sub-titles, timestamps, placeholder-adjacent copy.

### State
- **Warn** (`#ffb454`), **Bad** (`#ff5d7a`), **Ok** (`#37e08d`): reserved for status dots, badges, and log lines. Never used decoratively.

### Named Rules
**The One Glow Rule.** Only one accent hue is live at a time (cyan, violet, or mint — chosen by the user, persisted to `localStorage`). Never mix two accent hues in the same view; the aurora field's third blob (`#3a5bff`, fixed blue) is the one deliberate exception, there to keep the background from reading as monochrome.

**The Dim-Then-Glow Rule.** Every accent use has exactly two states: a 13%-opacity tint for backgrounds/washes (`accent-dim`) and a 40%-opacity halo for glow (`accent-glow`). Don't invent a third opacity step; consistency across buttons, dots, and rings is what makes the system read as one voice.

## 3. Typography

**Body & UI Font:** Inter, with `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` fallback.
**Monospace Font:** `ui-monospace, Menlo, Consolas, monospace` — log lines only.

**Character:** A single geometric-humanist sans carries every weight and size in the system; hierarchy comes from size, weight, and letter-spacing, not from mixing families. Labels lean on wide uppercase tracking to read as "system chrome" against the free-flowing glass panels.

### Hierarchy
- **Display** (600, 1.75rem, 1.2 line-height): the login screen's bot name — the single largest text in the app, seen once per session.
- **Headline** (600, 1.55rem, 1.25 line-height, 0.01em tracking): `.page-title` — one per screen, top of every tab.
- **Title** (700, 1.15rem): hero card title (`.h-title`) and stat numbers use tabular figures at 1.7rem/700 for the animated counters.
- **Body** (400, 0.95rem, 1.5 line-height): default UI text, form inputs, buttons.
- **Label** (600, 0.76–0.82rem, 0.09em tracking, uppercase): card headings (`h3`), section headers (`.section-h`) — always muted-colored, always uppercase, always tracked wide.
- **Micro-label** (500–600, 0.62–0.68rem): mobile tab-bar labels and pill badges — the smallest readable tier, reserved for chrome, never for content.

### Named Rules
**The One Family Rule.** Every UI text element uses Inter. The only exception is log output, which switches to monospace so timestamps and structured messages align.

## 4. Elevation

Hybrid: neutral drop shadows give panels physical weight at rest, and colored glow is layered on top as the *interactive* signal. A resting glass card has a soft black shadow (`0 10px 38px rgba(0,0,0,.4)`) plus a 1px inner highlight; hovering or activating it adds an accent-tinted ring and glow instead of a heavier gray shadow. Status and brand elements (the logo dot, the online status dot, active nav items) skip neutral shadows entirely and glow purely in the accent color — glow *is* their elevation.

### Shadow Vocabulary
- **Resting glass** (`0 10px 38px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.045)`): default state for every `.glass` panel — card, sidebar, tab bar, login card, toast.
- **Hover lift** (`0 14px 44px rgba(0,0,0,.5), 0 0 0 1px var(--accent-dim)`): cards marked `.hover` on `:hover` — adds depth and a thin accent ring, no color shift on the shadow itself.
- **Accent glow — soft** (`0 0 18px var(--accent-dim)`): buttons on hover.
- **Accent glow — strong** (`0 0 16px var(--accent), 0 0 46px var(--accent-glow)`): the logo dot and the "connected" status dot — a persistent pulse, not a hover-only effect.

### Named Rules
**The Glow-Is-Status Rule.** Colored glow is reserved for things that are *live* or *actionable* right now (status dot, active nav, focused input, hovered button). A static, non-interactive element never gets a glow — only the neutral resting-glass shadow.

## 5. Components

### Buttons
- **Shape:** 12px radius (`.small` variant: 10px); pill-adjacent but not fully rounded.
- **Primary:** transparent-to-black vertical gradient wash tinted with `accent-dim`, accent-colored text, 1px hairline border, `11px 18px` padding.
- **Hover / Focus:** soft accent glow (`0 0 18px var(--accent-dim)`); the trailing arrow glyph (where present) slides 4px right. `:active` scales to 0.97.
- **Ghost:** transparent background, muted text, no glow on hover — text brightens to `--text` instead. Used for secondary actions ("← Zurück", "Abmelden").
- **Danger:** `rgba(255,93,122,.08)` background, `--bad` text — no glow; the red itself is the warning.

### Cards
- **Corner Style:** 18px radius, matching every `.glass` surface.
- **Background:** Glass Navy at 58% opacity over blur(16px) + saturate(1.25%).
- **Shadow Strategy:** see Elevation — resting glass shadow at rest, hover-lift + accent ring on `.hover` cards (stat tiles, group rows).
- **Border:** 1px Hairline (`rgba(130,165,255,.13)`) on every card, no exceptions.
- **Internal Padding:** 18px standard; list-item rows use 13px/16px.

### Inputs / Fields
- **Style:** near-black translucent fill (`rgba(4,7,14,.65)`), Hairline border, 11–13px radius depending on context (form inputs vs. login).
- **Focus:** border shifts to the active accent color plus a 3px accent-dim halo (login) or a plain border-color change (in-panel forms) — no layout shift.
- **Toggle switch:** a 46×26px pill track; off-state uses a neutral blue-gray fill and pale thumb, on-state swaps the track to `accent-dim` and the thumb to accent color with a small glow.

### Badges
- **Style:** pill radius (99px), 3px/9px padding, 0.68rem bold uppercase-tracked text.
- **Roles:** `ok` (green), `bad` (red), `warn` (amber), `accent` (current accent) — background is always the same color at ~12% opacity, text at full strength. No neutral/default badge variant exists; a badge always carries a state.

### Navigation
- **Desktop (≥900px):** sticky glass sidebar, 232px wide, icon + label rows; active item gets `accent-dim` background and accent-colored text and label weight bumps to 600.
- **Mobile (<900px):** the sidebar disappears entirely in favor of a fixed bottom glass tab bar with icon-over-micro-label items, horizontally scrollable if it overflows; active item styled identically to desktop (accent-dim background, accent text).
- **Accent switcher:** a row of three small filled circles (cyan/violet/mint) beneath the desktop nav, and a larger version in Extras — the selected dot gets a white ring.

### Status Dot (signature component)
A single 14px circle that is the entire "is the bot alive" answer: red/static (stopped or connecting-without-glow), amber pulsing (connecting), green pulsing with a strong glow (connected). It appears once per session, top of the Übersicht tab, and is the only element allowed a *permanent* (non-hover) glow.

## 6. Do's and Don'ts

### Do:
- **Do** keep the void (`#05070d`) as the true background color on every screen — glass panels float on top of it, they never replace it.
- **Do** use exactly the two accent-opacity steps (13% dim, 40% glow) — see The Dim-Then-Glow Rule.
- **Do** pair neutral resting shadows with accent-colored *interactive* glow (The Glow-Is-Status Rule) rather than inventing new shadow colors.
- **Do** keep all body/UI text in Inter; switch to the monospace stack only for log output.
- **Do** let the bot's playful register (emoji, animated counters, medal-style leaderboards) show up in content and micro-interactions, even though the shell itself is precise and dark.
- **Do** maintain WCAG 2.1 AA contrast (≥4.5:1 body text, ≥3:1 large text) against the dark/glass backgrounds, and ship every animation (drift, pulse, shimmer, tween) with a `prefers-reduced-motion` fallback — both already implemented, keep them when extending the UI.

### Don't:
- **Don't** introduce a light or cream-neutral surface anywhere in the panel — this is not a generic light-mode SaaS admin template, and warm-neutral backgrounds contradict the established dark-glass identity.
- **Don't** run two accent hues at once outside the fixed third aurora blob (`#3a5bff`) — see The One Glow Rule.
- **Don't** add gray/neutral drop shadows to status or brand elements (logo dot, status dot, active nav) — those glow, they don't shadow.
- **Don't** pair a 1px border with a wide, soft, non-accent-colored drop shadow on cards or buttons ("ghost-card" pattern) — the system's depth vocabulary is blur + accent glow, not generic soft shadows.
- **Don't** add a second font family for "variety" — one sans (Inter) plus one monospace (logs only) is the complete type system.
