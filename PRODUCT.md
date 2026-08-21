# Product

## Register

product

## Users

Self-hosting owners/admins of the WhatsApp Community Bot (Render free-tier + Turso). They open the "Control Center" web panel — often from a phone, mobile-first — to check live bot status (SSE), scan the pairing QR, look up a specific person by name or phone number, moderate the community, tweak command toggles and group settings, review logs, and manage schedules (messages, birthdays, polls). The job to be done is fast, confident operational control without touching code or the server.

## Product Purpose

The panel is the admin interface for a self-hosted WhatsApp bot: authenticate with `ACCESS_SECRET`, then monitor and steer everything the bot does (status, people, moderation, command toggles and leveling config, scheduling, logs, QR re-pairing, accent theme, config export/import). Success is an admin resolving a task (re-pair the bot, find the person behind a number, mute a raid, adjust a toggle) in a few taps, with the live state always visible and trustworthy.

## Brand Personality

Quiet, precise, operational. A control room, not a showroom. The surface stays neutral so that the few colored things on screen actually mean something: one switchable accent (amber/violet/mint) for interaction, three state colors for statements about the bot's operation. Voice is technical and confident — an ops console, not a marketing surface.

The earlier Aurora-Glow/Dark-Glassmorphism identity has been deliberately retired: blur, glow, and multi-hue gradients cost legibility and phone performance while carrying no information. See `DESIGN.md` for the token system that replaced it.

## Anti-references

Not a decorative dashboard: no glow, blur, or gradient that competes with live status data, and no color used for anything but interaction or operational state. Equally not a generic enterprise admin template — density and one-glance answers matter more than uniform gray tables.

## Design Principles

- Meaning before decoration: every color, badge, and shadow either states a fact about the operation or marks something interactive.
- One token system: spacing, type scale, radii, and shadows come from the defined scales; ad-hoc pixel values are how a system rots.
- Mobile-first control: every view works one-handed on a phone before being polished for desktop.
- Identity is the JID, name is only display: actions always carry the technical ID; the readable name exists so a human picks the right person.
- Calm live feedback: SSE-driven state changes update visibly but without jarring reflows or motion.

## Accessibility & Inclusion

WCAG 2.1 AA, measured rather than assumed: body text ≥4.5:1 and graphical objects ≥3:1 in both themes (dark and `nature`) across all three accents, checked against the darkest surface of the light theme (`--bg-2`). Full keyboard operability for every control — clickable list rows are real buttons, the command palette traps focus and closes on Escape. A global `prefers-reduced-motion` rule disables animation and smooth scrolling.
