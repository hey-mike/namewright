# Design Specification: Namewright UI Redesign (Warm Premium)

## 1. Visual Theme & Atmosphere

**High-Contrast Bold (Modern Editorial)**
The interface is confident, modern, and highly engineered, deliberately avoiding generic SaaS aesthetics and neon "AI" tropes. It relies on extreme typographic contrast and a warm monochrome palette to establish a premium, high-agency feel. Information density is managed through visual geometry and strategic whitespace rather than text walls.

## 2. Color Palette & Roles

- **Warm Bone** (`#FBFBFA`): Primary background surface. Prevents pure white from feeling cheap or sterile.
- **Charcoal Ink** (`#111111`): Primary text and high-contrast structural elements. Never pure black.
- **Muted Steel** (`#787774`): Secondary text, descriptions, and metadata.
- **International Orange** (`#FF4F00`): Singular, high-saturation accent color. Used sparingly for primary CTAs, active states, and crucial data indicators (e.g., highlighting trademark risks).
- **Whisper Border** (`rgba(0,0,0,0.06)` or `#EAEAEA`): Structural dividers, matrix tracks, and card borders.

## 3. Typography Rules

- **Display/Headlines:** `Newsreader` (Editorial Serif). Track-tight (`letter-spacing: -0.02em`), controlled scale. Hierarchy is driven by weight and scale, not color.
- **Body/Utility:** `Geist` (Technical Sans). Clean, geometric, used for candidate rationales and standard UI text.
- **Mono:** `Geist Mono` (Monospace). Used for metadata, ranks (e.g., "RANK #01"), processing logs, and high-density technical details.

## 4. Component Stylings

- **Cards & Containers:** Sharp edges, practically zero rounded corners (`border-radius: 2px` or `0`). `1px solid` borders with minimal, ultra-diffuse shadows (`box-shadow: 0 4px 20px rgba(0,0,0,0.03)`).
- **Pills & Indicators:** The only elements permitted to have full rounding (`rounded-full`). Used to differentiate functional data (like "Top Pick" tags) from structural layout.
- **Buttons:** Solid Charcoal or International Orange. Flat, no outer glow. Tactile push feedback on active state (`transform: translateY(0) scale(0.98)`).

## 5. Wait-Time UX: The Split View with Granular Logging

**The 90-Second Wait Mitigation**
To manage the ~90-second report generation time without losing user trust, the loading state will be a **Split View (Editorial + Technical)**.

- **Left Side - Immersive Terminal:** Displays a real-time, highly granular monospace log of the rigorous work the agent is performing (streaming every domain checked, every trademark class scanned). Includes pulsing indicators for active steps and a smooth progress bar tracking the pipeline phases.
- **Right Side - Editorial Content:** Cycles through short, high-value branding tips (e.g., "Descriptive vs. Distinctive", "Why descriptive names are harder to trademark") to provide engaging reading material while the pipeline runs.

## 6. Report Visuals & Layout

- **Candidate Matrix:** Complex trademark and domain data will be visualized using high-contrast visual bands and progress-bar-like indicators rather than dense text labels.
- **The Triad Reveal:** The top results will be explicitly categorized into strategic buckets (e.g., The Safe Bet, The Bold Move, The Best All-Rounder) to guide the founder's decision.
- **Asymmetric Grids:** Move away from centered, symmetrical layouts. Use intentional, editorial layouts (e.g., 2-column offset data points).

## 7. Anti-Patterns (Banned)

- No `Inter`, `Roboto`, or generic serifs (e.g., `Times New Roman`).
- No purple/blue "AI" neon glows or heavy drop shadows.
- No emojis anywhere in the UI.
- No pure black (`#000000`) or pure white (`#FFFFFF`) for large surfaces.
- No pill-shaped buttons for primary CTAs.
- No filler UI text ("Scroll to explore", bouncing arrows).
