# EchoSim Environment

## Machine toolchain (verified)

| Tool | Version | Notes |
|---|---|---|
| Windows | win32, PowerShell 5.1 | dev host |
| .NET SDKs | 8.0.100 / 9.0.308 / 10.0.203 | headless compile + tests |
| Git | 2.39.1.windows.1 | repo VCS |
| Unity Hub | installed at `C:\Program Files\Unity\Hub` | |
| Unity 6 | **6000.5.6f1** (`C:\Program Files\Unity\Hub\Editor\6000.5.6f1`) | project target editor |
| Unity 2022.3.16f1 | present (legacy) | not used by EchoSim |

## Project targets

- Engine: **Unity 6000.5.6f1** (recorded in `ProjectSettings/ProjectVersion.txt`)
- Scripting: C# **9.0** (LangVersion pinned in `Directory.Build.props` to match
  the Unity 6 Roslyn profile), API level `netstandard2.1`
- Test framework: **NUnit 3** — same API family as Unity Test Framework, so
  domain tests port into EditMode tests with minimal friction

## First open in Unity

The repository is a valid Unity project root (`Assets/`, `Packages/`,
`ProjectSettings/`). On first open the editor will:

1. Resolve packages from `Packages/manifest.json`,
2. Import `Assets/EchoSim/**` and assign meta GUIDs,
3. Compile `EchoSim.Core.asmdef` + `EchoSim.Simulation.asmdef`.

Headless verification does not require the editor:

```powershell
dotnet build EchoSim.sln
dotnet test  EchoSim.sln
dotnet run --project tools/EchoSim.HeadlessDemo   # seed 1234, 3 residents, 2 days
```

## Notes

- NuGet restore verified working (Microsoft.NET.Test.Sdk 17.11.1, NUnit 3.14).
- URP package intentionally not pinned yet; added when Sprint 4 introduces the
  visual town so the version can be resolved against the actual editor.
- No secrets in repository; `.env` and key files are gitignored.
