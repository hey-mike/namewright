# Namewright UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Warm Premium" UI redesign, including the High-Contrast Bold aesthetic, Typography updates, and the Split View (Editorial + Technical) Wait-Time UX.

**Architecture:** We will update CSS variables in `globals.css` for the new palette, swap Google Fonts in `layout.tsx`, redesign the `IntakeForm` and `page.tsx` header, build the Split View loading state within `IntakeForm`, and update candidate display components to use visual data matrices.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS (v4), TypeScript.

---

### Task 1: Update Typography & Design Tokens

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update Fonts in `layout.tsx`**

```tsx
import { Newsreader, Geist, Geist_Mono } from 'next/font/google'

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  style: ['normal', 'italic'],
})
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased text-zinc-900 bg-[#FBFBFA]">{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Update `globals.css` Tokens**

```css
@import 'tailwindcss';

@source "../../src/components/**/*.tsx";
@source "../../src/app/**/*.tsx";

:root {
  /* Warm Premium Palette */
  --color-bg: #fbfbfa;
  --color-surface: #ffffff;
  --color-charcoal: #111111;
  --color-muted: #787774;
  --color-accent: #ff4f00;
  --color-border: rgba(0, 0, 0, 0.06);
  --color-border-solid: #eaeaea;

  /* Map to previous names temporarily for smooth migration */
  --color-text-1: var(--color-charcoal);
  --color-text-2: var(--color-charcoal);
  --color-text-3: var(--color-muted);
  --color-text-4: var(--color-muted);
  --color-input-bg: var(--color-surface);
  --color-focus-ring: rgba(255, 79, 0, 0.3);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

body {
  background-color: var(--color-bg);
  color: var(--color-charcoal);
  font-family: var(--font-geist), sans-serif;
}

.serif {
  font-family: var(--font-newsreader), serif;
  letter-spacing: -0.02em;
}

.mono {
  font-family: var(--font-geist-mono), monospace;
}

.btn-primary {
  background-color: var(--color-accent);
  color: white;
  border-radius: 2px;
  transition: all 0.2s var(--ease-out);
  font-family: var(--font-geist-mono), monospace;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
  font-size: 13px;
  padding: 12px 24px;
}

.btn-primary:hover:not(:disabled) {
  background-color: #e64700;
  transform: translateY(-1px);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.btn-primary:disabled {
  background-color: var(--color-border-solid);
  color: var(--color-muted);
  cursor: not-allowed;
}

.card-container {
  border: 1px solid var(--color-border-solid);
  background-color: var(--color-surface);
  border-radius: 0px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

/* Animations */
@keyframes pulse-opacity {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
.animate-pulse-fast {
  animation: pulse-opacity 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

- [ ] **Step 3: Run Dev Server to Verify CSS**
      Run: `npm run dev:next`
      Expected: Server starts successfully without CSS errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "style: implement High-Contrast Bold tokens and typography"
```

---

### Task 2: Redesign Header & Layout Structure

**Files:**

- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update Header in `page.tsx`**

```tsx
import { IntakeForm } from '@/components/IntakeForm'

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#FBFBFA]">
      <header className="border-b border-[rgba(0,0,0,0.06)] bg-white">
        <div className="max-w-6xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF4F00]" />
            <span className="mono text-xs font-bold tracking-widest uppercase text-zinc-900">
              Namewright
            </span>
          </div>
          <div className="mono text-[10px] text-[#787774] uppercase tracking-widest">
            Pre-Incorporation
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 md:px-12 py-12 md:py-24">
        <IntakeForm />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: redesign landing page header (Editorial style)"
```

---

### Task 3: Redesign Intake Form UI (Idle State)

**Files:**

- Modify: `src/components/IntakeForm.tsx`

- [ ] **Step 1: Update Input & Chip Styling in `IntakeForm.tsx`**
      _Locate the rendered `form` inside `IntakeForm.tsx` when `!loading`._
      Apply sharp corners, `mono` fonts for labels, and High-Contrast rules.

```tsx
// Inside IntakeForm render (when not loading)
return (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
    <div className="col-span-1 lg:col-span-5 space-y-6">
      <h1 className="serif text-5xl md:text-7xl font-medium tracking-tight leading-[0.9] text-[#111111]">
        Name your brand.
        <br />
        <span className="italic text-[#787774]">Before you commit.</span>
      </h1>
      <p className="text-lg text-[#787774] leading-relaxed max-w-md">
        Submit a brief, get 8–12 ranked name candidates with preliminary trademark screening and
        domain availability.
      </p>
    </div>

    <div className="col-span-1 lg:col-span-7">
      <div className="card-container p-8 md:p-12 space-y-10">
        {/* Example of updated input group */}
        <div className="space-y-3">
          <label className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
            01 / Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What are you building? Who is it for?"
            className="w-full bg-[#FBFBFA] border border-[#EAEAEA] p-4 font-sans text-sm focus:border-[#FF4F00] focus:ring-1 focus:ring-[#FF4F00] outline-none transition-all resize-none min-h-[120px]"
          />
        </div>

        {/* Update Personality Chips */}
        <div className="space-y-3">
          <label className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
            02 / Personality
          </label>
          <div className="flex flex-wrap gap-2">
            {PERSONALITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setForm({ ...form, personality: p })}
                className={`px-4 py-2 text-xs font-medium border transition-colors ${
                  form.personality === p
                    ? 'bg-[#111111] text-white border-[#111111]'
                    : 'bg-white text-[#787774] border-[#EAEAEA] hover:border-[#111111] hover:text-[#111111]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4 border-t border-[#EAEAEA]">
          <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary w-full">
            Generate Report ($19)
          </button>
        </div>
      </div>
    </div>
  </div>
)
```

- [ ] **Step 2: Commit**

```bash
git add src/components/IntakeForm.tsx
git commit -m "feat: redesign intake form inputs and layout"
```

---

### Task 4: Implement Wait-Time UX (Split View + Terminal)

**Files:**

- Modify: `src/components/IntakeForm.tsx`

- [ ] **Step 1: Replace Loading State with Split View**
      _Locate the `if (loading)` block in `IntakeForm.tsx`._

```tsx
if (loading) {
  // Calculate progress percentage based on loadingStep
  const progress = Math.min(100, Math.max(10, loadingStep * 25 + 15))

  return (
    <div className="w-full h-full flex flex-col md:flex-row border border-[#EAEAEA] bg-white min-h-[600px]">
      {/* Left: Immersive Terminal */}
      <div className="w-full md:w-3/5 bg-[#111111] text-[#EAEAEA] p-8 md:p-12 flex flex-col relative overflow-hidden">
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4 mb-6">
          <span className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
            Pipeline Active
          </span>
          <span className="mono text-xs text-zinc-500">{progress}%</span>
        </div>

        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mb-8">
          <div
            className="h-full bg-[#FF4F00] transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        {/* Terminal Log Stream */}
        <div
          className="flex-1 font-mono text-[11px] leading-relaxed space-y-2 overflow-y-auto"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
          }}
        >
          <div className="text-zinc-500">[System] Initializing pipeline...</div>
          {loadingStep >= 0 && (
            <div className="text-emerald-500">[Agent] Synthesizing brief criteria.</div>
          )}
          {loadingStep >= 1 && (
            <div className="text-zinc-400">[Agent] Generating candidate batch...</div>
          )}
          {loadingStep >= 1 && (
            <div className="text-emerald-500">
              [Agent] 12 candidates generated. Initiating parallel verification.
            </div>
          )}
          {loadingStep >= 2 && (
            <div className="text-zinc-400">[Signa] Querying USPTO TESS database...</div>
          )}
          {loadingStep >= 2 && (
            <div className="text-emerald-500">[Signa] Cross-referencing EUIPO records...</div>
          )}
          {loadingStep >= 3 && (
            <div className="text-zinc-400">[DNS] Probing Layer 1 availability...</div>
          )}
          {loadingStep >= 3 && (
            <div className="text-zinc-400">[RDAP] Resolving Layer 2 WHOIS...</div>
          )}

          <div className="flex gap-2 text-white font-bold animate-pulse-fast mt-4">
            <span className="text-[#FF4F00]">█</span>
            <span>{PIPELINE_STEPS[loadingStep] || 'Finalizing...'}</span>
          </div>
        </div>
      </div>

      {/* Right: Editorial Content */}
      <div className="w-full md:w-2/5 p-8 md:p-12 flex flex-col justify-center bg-[#FBFBFA] border-l border-[#EAEAEA]">
        <span className="mono text-[10px] uppercase tracking-widest text-[#787774] mb-4">
          While you wait
        </span>
        <h3 className="serif text-3xl font-medium leading-tight mb-4 text-[#111111]">
          Descriptive vs. Distinctive
        </h3>
        <p className="text-sm text-[#787774] leading-relaxed">
          Names that literally describe what you do (like "FastMail") are incredibly difficult to
          trademark. The strongest brands use distinctive, arbitrary, or coined words (like "Apple"
          for computers).
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/IntakeForm.tsx
git commit -m "feat: implement Split View wait-time UX with granular logging"
```

---

### Task 5: Candidate Matrix Visualization

**Files:**

- Modify: `src/components/CandidateRow.tsx` (or equivalent file rendering candidates in `FreePreview` / `FullReport`)

- [ ] **Step 1: Replace Text Labels with Visual Bands**
      _Update the component rendering a candidate to use the High-Contrast visual matrix._

```tsx
// Inside the candidate card render
<div className="card-container p-8 space-y-6">
  <div className="flex justify-between items-start">
    <div>
      <h3 className="serif text-4xl font-medium text-[#111111]">{candidate.name}</h3>
    </div>
    {isTopPick && (
      <div className="bg-[#FF4F00] text-white px-3 py-1 text-[10px] mono font-bold uppercase tracking-tighter">
        Top Pick
      </div>
    )}
  </div>

  <p className="text-sm leading-relaxed text-[#787774]">{candidate.rationale}</p>

  {/* Matrix Visualization */}
  <div className="space-y-4 pt-6 border-t border-[#EAEAEA]">
    {/* Trademark Risk */}
    <div>
      <div className="flex justify-between items-center text-[10px] mono uppercase tracking-widest mb-2">
        <span className="text-[#787774]">Trademark Risk</span>
        <span className="font-bold text-[#111111]">{candidate.trademarkRisk}</span>
      </div>
      <div className="w-full h-1.5 bg-[#EAEAEA] rounded-full overflow-hidden">
        <div
          className={`h-full ${candidate.trademarkRisk === 'high' ? 'bg-red-500 w-[85%]' : candidate.trademarkRisk === 'medium' ? 'bg-amber-500 w-[50%]' : 'bg-[#FF4F00] w-[15%]'}`}
        />
      </div>
    </div>

    {/* Domain Status */}
    <div>
      <div className="flex justify-between items-center text-[10px] mono uppercase tracking-widest mb-2">
        <span className="text-[#787774]">Domains Checked</span>
      </div>
      <div className="flex gap-1.5">
        {candidate.domains.map((d) => (
          <div
            key={d.tld}
            className="h-1.5 bg-[#EAEAEA] rounded-full w-full overflow-hidden relative group"
          >
            <div className={`h-full w-full ${d.available ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {/* Tooltip for domain name */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#111111] text-white text-[9px] mono px-2 py-1 rounded-sm whitespace-nowrap">
              .{d.tld}: {d.available ? 'Available' : 'Taken'}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Verify and Commit**
      Run: `npm run test` (to ensure no components broke their tests)

```bash
git add src/components/CandidateRow.tsx
git commit -m "feat: implement high-contrast visual matrix for candidate data"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-namewright-ui-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
