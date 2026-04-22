# Namewright Roadmap

## In Progress

- **Agent pipeline (Phase 2a)** — multi-step generation: candidates → Signa trademark verification → DNS domain checks → synthesis

## Up Next (after agent pipeline)

- **Pronunciation field** — add `pronunciation: string` to candidate schema for invented/compound names
- **Personality-driven filtering** — prompt instructs model to weight naming styles by personality input (e.g. "utilitarian/direct" suppresses metaphorical names)
- **Social handle note** — add Instagram/Twitter handle availability guidance to `topPicks.nextSteps`
- **NICE class selection** — infer or ask user for business category to pass correct trademark class to Signa (currently hardcoded to Class 42)

## Later

- **Streaming results** — candidates appear progressively as pipeline completes each step
- **Feedback loops** — thumbs up/down, "which name did you choose" signal capture
- **Regenerate flow** — refine brief and regenerate without paying again
- **User accounts** — persistent report history across sessions
