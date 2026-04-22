import React, { useState } from "react";
import {
    ArrowRight,
    Loader2,
    AlertCircle,
    RotateCcw,
    ExternalLink,
    Sparkles,
} from "lucide-react";

const SYSTEM_PROMPT = `# Role
You are a Brand Strategy Agent designed to support startup founders and solo developers in developing and validating brand identities. You combine expertise in naming strategy, trademark law fundamentals, and domain availability research.

# Task
Help users create strong brand names and verify their viability across trademark registries and domain name availability. Your output should be actionable and confidence-building.

# Instructions
- Generate 8-12 brand name candidates varying in style (descriptive, invented, metaphorical, acronyms, compound).
- For each: strategic rationale, trademark risk assessment (USE web_search to research real conflicts with established companies, products, services), domain availability inference.
- Rank by combined viability (trademark-clear AND likely-acquirable).
- Be honest when something requires official verification (USPTO, IP Australia, WHOIS, registrars).
- Do NOT generate unpronounceable, offensive, or legally risky names (too close to famous brands, generic terms, misleading descriptors).

# Output
You MUST respond with ONLY a valid JSON object. No markdown fences, no preamble, no explanation outside the JSON. Schema:

{
  "summary": "1-2 sentence recap of what the user is building",
  "candidates": [
    {
      "name": "string",
      "style": "descriptive | invented | metaphorical | acronym | compound",
      "rationale": "2-3 sentences on why this works strategically",
      "trademarkRisk": "low | moderate | high",
      "trademarkNotes": "1-2 sentences citing any conflicts found or why risk is low",
      "domains": {
        "com": "likely available | likely taken | uncertain",
        "io": "likely available | likely taken | uncertain",
        "co": "likely available | likely taken | uncertain",
        "alternates": ["up to 3 suggested alternate domain strings if primary is taken"]
      }
    }
  ],
  "topPicks": [
    { "name": "must match a candidate name", "reasoning": "why this is a safest bet", "nextSteps": "specific verification actions" }
  ],
  "recommendation": "1-2 sentences naming the top 1-2 to pursue first and why"
}

Rank candidates array from most to least viable. Return 8-12 candidates and exactly 3 topPicks.`;

export default function BrandStrategyAgent() {
    const [step, setStep] = useState("intake");
    const [form, setForm] = useState({
        description: "",
        personality: "",
        constraints: "",
        geography: "",
    });
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const personalities = [
        "Serious / technical",
        "Playful / approachable",
        "Premium / refined",
        "Utilitarian / direct",
        "Bold / contrarian",
    ];
    const geographies = [
        "US-first",
        "Global",
        "Australia / APAC",
        "Europe",
        "China / Asia",
    ];

    const canSubmit =
        form.description.trim().length > 10 &&
        form.personality &&
        form.geography;

    async function submit() {
        setStep("loading");
        setError(null);
        const userMessage = `Product: ${form.description}

Brand personality: ${form.personality}
Constraints: ${form.constraints || "none specified"}
Primary market: ${form.geography}

Generate brand name candidates per the schema. Use web_search to research potential trademark conflicts for your strongest candidates. Return valid JSON only.`;

        try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "claude-sonnet-4-20250514",
                    max_tokens: 4000,
                    system: SYSTEM_PROMPT,
                    messages: [{ role: "user", content: userMessage }],
                    tools: [
                        { type: "web_search_20250305", name: "web_search" },
                    ],
                }),
            });
            if (!res.ok) throw new Error(`API returned ${res.status}`);
            const data = await res.json();
            const text = data.content
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("\n")
                .trim();
            const clean = text
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();
            const jsonStart = clean.indexOf("{");
            const jsonEnd = clean.lastIndexOf("}");
            if (jsonStart === -1 || jsonEnd === -1)
                throw new Error("No JSON object found in response");
            const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
            setResult(parsed);
            setStep("results");
        } catch (e) {
            setError(e.message || "Something went wrong");
            setStep("error");
        }
    }

    function reset() {
        setStep("intake");
        setForm({
            description: "",
            personality: "",
            constraints: "",
            geography: "",
        });
        setResult(null);
        setError(null);
    }

    return (
        <div
            className="min-h-screen w-full"
            style={{
                backgroundColor: "#f5efe6",
                color: "#1f1a14",
                fontFamily: "'Fraunces', Georgia, serif",
            }}
        >
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=JetBrains+Mono:wght@400;500&display=swap');
        .display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; font-variation-settings: "SOFT" 50, "WONK" 0; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .accent { color: #b0532b; }
        .bg-accent { background-color: #b0532b; }
        .border-accent { border-color: #b0532b; }
        .paper { background-color: #faf5ec; }
        .ink-soft { color: #5a4f42; }
        .ink-softer { color: #8a7d6e; }
        .rule { border-color: #1f1a14; }
        .rule-soft { border-color: #d6cbb8; }
        .btn-primary { background-color: #b0532b; color: #faf5ec; transition: background-color 0.2s; }
        .btn-primary:hover:not(:disabled) { background-color: #8d3f1e; }
        .btn-primary:disabled { background-color: #d6cbb8; color: #8a7d6e; cursor: not-allowed; }
        .chip { transition: all 0.15s ease; }
        .chip:hover { border-color: #b0532b; }
        .chip-active { background-color: #1f1a14; color: #f5efe6; border-color: #1f1a14; }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .stagger > * { animation: fadeIn 0.5s ease-out backwards; }
        .stagger > *:nth-child(1) { animation-delay: 0.05s; }
        .stagger > *:nth-child(2) { animation-delay: 0.1s; }
        .stagger > *:nth-child(3) { animation-delay: 0.15s; }
      `}</style>

            {/* Header */}
            <header className="max-w-5xl mx-auto px-6 md:px-12 pt-10 pb-6 flex items-baseline justify-between border-b rule">
                <div className="flex items-baseline gap-3">
                    <span className="mono text-xs tracking-widest ink-softer uppercase">
                        Vol. 01
                    </span>
                    <span className="mono text-xs tracking-widest ink-softer">
                        —
                    </span>
                    <span className="mono text-xs tracking-widest ink-softer uppercase">
                        A Naming Consultancy
                    </span>
                </div>
                <span className="mono text-xs tracking-widest ink-softer uppercase hidden md:inline">
                    {new Date().toLocaleDateString("en-GB", {
                        year: "numeric",
                        month: "short",
                    })}
                </span>
            </header>

            {/* INTAKE */}
            {step === "intake" && (
                <main className="max-w-5xl mx-auto px-6 md:px-12 py-10 md:py-16 fade-in">
                    <div className="mb-12 md:mb-16">
                        <p className="mono text-xs tracking-widest accent uppercase mb-4">
                            The Brand Strategist
                        </p>
                        <h1
                            className="display text-5xl md:text-7xl leading-[0.95] font-light mb-6"
                            style={{ letterSpacing: "-0.02em" }}
                        >
                            Name it
                            <br />
                            <em className="italic" style={{ fontWeight: 400 }}>
                                well.
                            </em>{" "}
                            Own it
                            <br />
                            <em
                                className="italic accent"
                                style={{ fontWeight: 400 }}
                            >
                                defensibly.
                            </em>
                        </h1>
                        <p className="text-lg md:text-xl ink-soft max-w-2xl leading-relaxed">
                            Tell us what you're building. We'll generate a
                            ranked shortlist of brand names with trademark risk
                            research and domain availability for each.
                        </p>
                    </div>

                    <div className="space-y-10 md:space-y-12">
                        <section>
                            <div className="flex items-baseline gap-4 mb-3">
                                <span className="mono text-xs accent">01</span>
                                <h2 className="display text-xl md:text-2xl">
                                    What are you building?
                                </h2>
                            </div>
                            <p className="ink-soft text-sm mb-4 ml-10">
                                Product category, core function, who it's for. A
                                sentence or two.
                            </p>
                            <textarea
                                value={form.description}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        description: e.target.value,
                                    })
                                }
                                placeholder="e.g. A mobile app that helps solo runners find training partners at their pace within 5km of them."
                                rows={3}
                                className="w-full paper border rule-soft p-4 text-base focus:outline-none focus:border-accent transition-colors"
                                style={{
                                    fontFamily: "inherit",
                                    color: "#1f1a14",
                                }}
                            />
                        </section>

                        <section>
                            <div className="flex items-baseline gap-4 mb-4">
                                <span className="mono text-xs accent">02</span>
                                <h2 className="display text-xl md:text-2xl">
                                    Brand personality?
                                </h2>
                            </div>
                            <div className="ml-10 flex flex-wrap gap-2">
                                {personalities.map((p) => (
                                    <button
                                        key={p}
                                        onClick={() =>
                                            setForm({ ...form, personality: p })
                                        }
                                        className={`chip px-4 py-2 border rule-soft text-sm ${form.personality === p ? "chip-active" : "paper"}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section>
                            <div className="flex items-baseline gap-4 mb-3">
                                <span className="mono text-xs accent">03</span>
                                <h2 className="display text-xl md:text-2xl">
                                    Any constraints?{" "}
                                    <span className="ink-softer text-base italic font-light">
                                        (optional)
                                    </span>
                                </h2>
                            </div>
                            <p className="ink-soft text-sm mb-4 ml-10">
                                Max length, languages to avoid, must be
                                pronounceable in a specific language, etc.
                            </p>
                            <input
                                type="text"
                                value={form.constraints}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        constraints: e.target.value,
                                    })
                                }
                                placeholder="e.g. Under 8 characters. Must be pronounceable in Mandarin."
                                className="w-full paper border rule-soft p-4 text-base focus:outline-none focus:border-accent transition-colors"
                                style={{
                                    fontFamily: "inherit",
                                    color: "#1f1a14",
                                }}
                            />
                        </section>

                        <section>
                            <div className="flex items-baseline gap-4 mb-4">
                                <span className="mono text-xs accent">04</span>
                                <h2 className="display text-xl md:text-2xl">
                                    Primary market?
                                </h2>
                            </div>
                            <div className="ml-10 flex flex-wrap gap-2">
                                {geographies.map((g) => (
                                    <button
                                        key={g}
                                        onClick={() =>
                                            setForm({ ...form, geography: g })
                                        }
                                        className={`chip px-4 py-2 border rule-soft text-sm ${form.geography === g ? "chip-active" : "paper"}`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </section>

                        <div className="pt-6 border-t rule-soft">
                            <button
                                onClick={submit}
                                disabled={!canSubmit}
                                className="btn-primary px-8 py-4 display text-lg inline-flex items-center gap-3"
                            >
                                Generate shortlist
                                <ArrowRight size={18} strokeWidth={1.5} />
                            </button>
                            {!canSubmit && (
                                <p className="mono text-xs ink-softer mt-3">
                                    Answer 01, 02, and 04 to continue.
                                </p>
                            )}
                        </div>
                    </div>
                </main>
            )}

            {/* LOADING */}
            {step === "loading" && (
                <main className="max-w-5xl mx-auto px-6 md:px-12 py-20 md:py-32 fade-in">
                    <div className="flex flex-col items-start gap-6">
                        <Loader2
                            className="accent animate-spin"
                            size={32}
                            strokeWidth={1.5}
                        />
                        <div>
                            <p className="mono text-xs tracking-widest accent uppercase mb-3">
                                In progress
                            </p>
                            <h2
                                className="display text-3xl md:text-5xl font-light mb-4"
                                style={{ letterSpacing: "-0.02em" }}
                            >
                                Generating candidates,{" "}
                                <em className="italic">researching</em>{" "}
                                conflicts.
                            </h2>
                            <p className="ink-soft text-base max-w-xl leading-relaxed">
                                Live web search for trademark conflicts takes
                                20–40 seconds. We're pulling real signals rather
                                than guessing.
                            </p>
                        </div>
                    </div>
                </main>
            )}

            {/* ERROR */}
            {step === "error" && (
                <main className="max-w-5xl mx-auto px-6 md:px-12 py-20 fade-in">
                    <div className="flex items-start gap-4 mb-8">
                        <AlertCircle
                            className="accent mt-2"
                            size={28}
                            strokeWidth={1.5}
                        />
                        <div>
                            <p className="mono text-xs tracking-widest accent uppercase mb-3">
                                Something broke
                            </p>
                            <h2 className="display text-3xl md:text-4xl font-light mb-4">
                                We couldn't complete the research.
                            </h2>
                            <p className="ink-soft text-base mb-2">
                                Error:{" "}
                                <span className="mono text-sm">{error}</span>
                            </p>
                            <p className="ink-soft text-sm mb-8">
                                Usually this is a transient API issue or a
                                malformed response. Retry is safe.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={submit}
                                    className="btn-primary px-6 py-3 display text-base inline-flex items-center gap-2"
                                >
                                    <RotateCcw size={16} strokeWidth={1.5} />{" "}
                                    Retry
                                </button>
                                <button
                                    onClick={reset}
                                    className="px-6 py-3 border rule text-base display hover:bg-black hover:text-white transition-colors"
                                >
                                    Start over
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            )}

            {/* RESULTS */}
            {step === "results" && result && (
                <main className="max-w-5xl mx-auto px-6 md:px-12 py-10 md:py-14 fade-in">
                    <section className="mb-12 md:mb-16 pb-10 border-b rule">
                        <p className="mono text-xs tracking-widest accent uppercase mb-4">
                            The brief, as we heard it
                        </p>
                        <p
                            className="display text-2xl md:text-4xl leading-[1.2] font-light italic"
                            style={{ letterSpacing: "-0.01em" }}
                        >
                            "{result.summary}"
                        </p>
                    </section>

                    {result.topPicks?.length > 0 && (
                        <section className="mb-16 md:mb-20">
                            <div className="flex items-baseline gap-4 mb-8">
                                <Sparkles
                                    className="accent"
                                    size={20}
                                    strokeWidth={1.5}
                                />
                                <p className="mono text-xs tracking-widest accent uppercase">
                                    The three to pursue
                                </p>
                            </div>
                            <div className="grid md:grid-cols-3 gap-6 stagger">
                                {result.topPicks.map((pick, i) => (
                                    <div
                                        key={i}
                                        className="paper border-2 border-accent p-6 relative"
                                    >
                                        <span className="mono text-xs accent absolute top-4 right-4">
                                            0{i + 1}
                                        </span>
                                        <h3
                                            className="display text-3xl md:text-4xl font-medium mb-4"
                                            style={{ letterSpacing: "-0.02em" }}
                                        >
                                            {pick.name}
                                        </h3>
                                        <p className="text-sm ink-soft mb-4 leading-relaxed">
                                            {pick.reasoning}
                                        </p>
                                        <div className="pt-4 border-t rule-soft">
                                            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
                                                Next
                                            </p>
                                            <p className="text-xs ink-soft leading-relaxed">
                                                {pick.nextSteps}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="mb-16 md:mb-20">
                        <div className="flex items-baseline justify-between mb-8 pb-4 border-b rule-soft">
                            <div className="flex items-baseline gap-4">
                                <p className="mono text-xs tracking-widest accent uppercase">
                                    Full shortlist
                                </p>
                                <span className="mono text-xs ink-softer">
                                    {result.candidates?.length || 0} candidates,
                                    ranked
                                </span>
                            </div>
                        </div>
                        <div className="space-y-0">
                            {result.candidates?.map((c, i) => (
                                <CandidateRow key={i} c={c} index={i} />
                            ))}
                        </div>
                    </section>

                    {result.recommendation && (
                        <section className="mb-16 md:mb-20 paper border-l-4 border-accent p-6 md:p-8">
                            <p className="mono text-xs tracking-widest accent uppercase mb-3">
                                Editor's pick
                            </p>
                            <p className="display text-xl md:text-2xl leading-snug italic font-light">
                                {result.recommendation}
                            </p>
                        </section>
                    )}

                    <section className="mb-16 md:mb-20">
                        <p className="mono text-xs tracking-widest accent uppercase mb-6">
                            Verify before you commit
                        </p>
                        <h2
                            className="display text-2xl md:text-3xl font-light mb-6"
                            style={{ letterSpacing: "-0.02em" }}
                        >
                            Nothing here replaces an{" "}
                            <em className="italic">official</em> check.
                        </h2>
                        <p className="ink-soft text-sm mb-6 max-w-2xl leading-relaxed">
                            Our trademark risk assessment is based on web
                            research. Domain availability is inferred, not live
                            WHOIS. Before you commit, run these:
                        </p>
                        <ul className="space-y-3 max-w-2xl">
                            {[
                                {
                                    label: "USPTO TESS trademark search (US)",
                                    url: "https://tmsearch.uspto.gov/search/search-information",
                                },
                                {
                                    label: "IP Australia trademark search",
                                    url: "https://search.ipaustralia.gov.au/trademarks/search/quick",
                                },
                                {
                                    label: "EUIPO trademark search (EU)",
                                    url: "https://www.tmdn.org/tmview/",
                                },
                                {
                                    label: "WHOIS domain lookup",
                                    url: "https://www.whois.com/whois/",
                                },
                                {
                                    label: "Namecheap / registrar availability",
                                    url: "https://www.namecheap.com/",
                                },
                            ].map((item) => (
                                <li key={item.url}>
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-sm border-b rule-soft hover:border-accent transition-colors pb-0.5"
                                    >
                                        {item.label}{" "}
                                        <ExternalLink
                                            size={12}
                                            strokeWidth={1.5}
                                        />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="pt-8 border-t rule flex flex-wrap items-center justify-between gap-4">
                        <p className="mono text-xs ink-softer">
                            End of report.
                        </p>
                        <button
                            onClick={reset}
                            className="btn-primary px-6 py-3 display text-base inline-flex items-center gap-2"
                        >
                            <RotateCcw size={16} strokeWidth={1.5} /> Run
                            another
                        </button>
                    </section>
                </main>
            )}
        </div>
    );
}

function CandidateRow({ c, index }) {
    const [open, setOpen] = useState(index < 3);
    const riskColor =
        c.trademarkRisk === "low"
            ? "#4a6b3a"
            : c.trademarkRisk === "moderate"
              ? "#a87415"
              : "#8d3f1e";
    const riskLabel = (c.trademarkRisk || "uncertain").toUpperCase();

    const domainStatus = (s) => {
        if (s === "likely available")
            return { label: "likely free", color: "#4a6b3a" };
        if (s === "likely taken")
            return { label: "likely taken", color: "#8d3f1e" };
        return { label: "uncertain", color: "#8a7d6e" };
    };

    return (
        <div className="border-b rule-soft">
            <button
                onClick={() => setOpen(!open)}
                className="w-full py-5 flex items-baseline justify-between gap-4 text-left hover:bg-black/[0.02] transition-colors px-2 -mx-2"
            >
                <div className="flex items-baseline gap-6 flex-1 min-w-0">
                    <span className="mono text-xs ink-softer shrink-0 w-6">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3
                        className="display text-2xl md:text-3xl font-medium truncate"
                        style={{ letterSpacing: "-0.02em" }}
                    >
                        {c.name}
                    </h3>
                    <span className="mono text-[10px] tracking-widest ink-softer uppercase hidden md:inline">
                        {c.style}
                    </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span
                        className="mono text-[10px] tracking-widest uppercase"
                        style={{ color: riskColor }}
                    >
                        ◆ {riskLabel}
                    </span>
                </div>
            </button>
            {open && (
                <div className="pb-6 pl-10 pr-2 grid md:grid-cols-3 gap-6 fade-in">
                    <div className="md:col-span-2">
                        <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
                            Why it works
                        </p>
                        <p className="text-sm leading-relaxed mb-4 ink-soft">
                            {c.rationale}
                        </p>
                        <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
                            Trademark notes
                        </p>
                        <p className="text-sm leading-relaxed ink-soft">
                            {c.trademarkNotes}
                        </p>
                    </div>
                    <div>
                        <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-3">
                            Domains
                        </p>
                        <ul className="space-y-1.5 mb-4">
                            {["com", "io", "co"].map((tld) => {
                                const s = domainStatus(c.domains?.[tld]);
                                return (
                                    <li
                                        key={tld}
                                        className="flex items-baseline justify-between text-sm"
                                    >
                                        <span className="mono">
                                            {c.name.toLowerCase()}.{tld}
                                        </span>
                                        <span
                                            className="mono text-[10px] tracking-wider"
                                            style={{ color: s.color }}
                                        >
                                            {s.label}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        {c.domains?.alternates?.length > 0 && (
                            <>
                                <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
                                    If taken, try
                                </p>
                                <ul className="space-y-1">
                                    {c.domains.alternates.map((alt, i) => (
                                        <li
                                            key={i}
                                            className="mono text-xs ink-soft"
                                        >
                                            {alt}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
