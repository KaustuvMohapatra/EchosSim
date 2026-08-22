# AGENTS.md — project instructions for OpenCode

Concise operational notes. The full product spec lives in the master document
(ECHOSIM.txt) and `docs/`; do not duplicate it here.

## What this is
EchoSim: an emergent social-simulation sandbox (Unity 6 host, engine-free C#
simulation core). Deterministic, seed-driven, event-sourced style domain.

## Layout
- `Assets/EchoSim/Core/**` + `Assets/EchoSim/Simulation/**` — domain source of truth (compiled by Unity asmdefs AND by `src/*.csproj` globs; keep both compiling).
- `src/`, `tests/`, `tools/` — dotnet wrappers for headless build/test/demo. Do not put domain code outside `Assets/`.
- `docs/` — architecture, decisions, roadmap, environment, testing.

## Commands
```powershell
dotnet build EchoSim.sln
dotnet test EchoSim.sln
dotnet run --project tools/EchoSim.HeadlessDemo   # must stay byte-reproducible per seed
```

## Hard rules
1. Domain code (`Assets/EchoSim/Core|Simulation`) must never reference UnityEngine or Console.
2. C# 9 only (LangVersion pinned). No file-scoped namespaces, no record structs.
3. All randomness via `SimRandomProvider` named streams; never `System.Random` or wall clock.
4. New behavior requires tests in the same sprint; fix = regression test.
5. Update `docs/ROADMAP.md` status markers honestly (Implemented/Partial/Planned).
6. Work on branch `feature/echosim`. Never push without explicit instruction.
7. When a sprint finishes, append a report to `docs/SPRINT_REPORTS.md`.
