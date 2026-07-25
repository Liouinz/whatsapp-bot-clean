# Product

## Register

product

## Users

Self-hosting owners/admins of the WhatsApp Community Bot (Render free-tier + Turso). They open the "Control Center" web panel — often from a phone, mobile-first — to check live bot status (SSE), scan the pairing QR, moderate the community, tweak command toggles and group settings, review logs, and manage schedules (messages, birthdays, polls). The job to be done is fast, confident operational control without touching code or the server.

## Product Purpose

The panel is the admin interface for a self-hosted WhatsApp bot: authenticate with `ACCESS_SECRET`, then monitor and steer everything the bot does (status, moderation, economy/leveling config, scheduling, logs, QR re-pairing, accent theme, config export/import). Success is an admin resolving a task (re-pair the bot, mute a raid, adjust a toggle) in a few taps, with the live state always visible and trustworthy.

## Brand Personality

Dark, futuristic, technical. Aurora-Glow + Dark Glassmorphism is already established in code (`src/dashboard-ui.js`): near-black base, glassy translucent panels, glowing cyan/violet/mint accent options, soft radial aurora drift in the background. Voice is precise and confident — an ops console, not a marketing surface.

## Anti-references

Not a generic light/cream SaaS admin template — the dark glass identity is deliberate and already shipped; don't drift toward warm-neutral or flat-light dashboard defaults. Avoid decorative glow/blur that competes with legibility of live status data.

## Design Principles

- Identity preservation: extend the existing Aurora-Glow/Glassmorphism system and accent-switcher rather than introducing a new visual language.
- Clarity over decoration: glow, blur, and gradients are accents; live status, stats, and logs must stay legible first.
- Mobile-first control: every view works one-handed on a phone before being polished for desktop.
- Confident ops tone: technical and precise language and states, no playful/marketing copy — this is a control tool, not a landing page.
- Calm live feedback: SSE-driven state changes should update visibly but without jarring reflows or motion.

## Accessibility & Inclusion

WCAG 2.1 AA: body text ≥4.5:1 contrast against the dark/glass backgrounds (check translucent `--glass`/`--glass2` overlays don't erode this), large text ≥3:1, full keyboard operability for all panel controls (tabs, toggles, forms), and a `prefers-reduced-motion` alternative for the aurora drift and glow animations.
