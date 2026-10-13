# Release automation (Godot Codely)

This fork publishes installers through GitHub Actions. Use **Orchestrate desktop release** as the single entry point; **Release desktop installers** still performs build, signing, and upload.

## One-click flows

Open **Actions → Orchestrate desktop release → Run workflow**.

| Channel | Version example | What happens |
| --- | --- | --- |
| **formal** | `0.1.0` (must match `package.json`, no `-rc`) | Creates and pushes `v0.1.0`; **Release desktop installers** runs on the tag and publishes a **Latest** GitHub Release when macOS, Windows signing, and smoke tests succeed. |
| **prerelease** | `0.1.0-rc.1` | Dispatches **Release desktop installers** with `mode=prerelease`, `target=all`; publishes a **Pre-release** on GitHub when the pipeline succeeds. |

Manual alternative (same result):

- Formal: `git tag -a vX.Y.Z && git push origin vX.Y.Z`
- Prerelease: **Release desktop installers** → `mode=prerelease`, `target=all`, `prerelease_tag=X.Y.Z-rc.N`

## Before the first release

1. Bump **`package.json` `version`** on `main` and merge (required for **formal**).
2. Configure repository **Settings → Secrets and variables → Actions**:
   - **macOS**: `DESKTOP_CSC_LINK`, `DESKTOP_CSC_KEY_PASSWORD`, `DESKTOP_APPLE_API_KEY`, `DESKTOP_APPLE_API_KEY_ID`, `DESKTOP_APPLE_API_ISSUER`, `DESKTOP_APPLE_TEAM_ID`
   - **Windows**: `DESKTOP_WINDOWS_SIGNING_PIN` and a self-hosted runner with labels `self-hosted`, `macOS`, `ARM64` (UKey signing host; see [release runbook](release-runbook.md))
3. Optional:
   - `MODELSCOPE_TOKEN` — mirror installers (skipped when unset)
   - **Variables** `MODELSCOPE_REPO_ID` — defaults to `owner/repo` for this GitHub repository
   - `FEISHU_RELEASE_WEBHOOK`, `MODELS_TOKEN`, `CRASH_ADMIN_TOKEN`

Without macOS secrets or the Windows signing runner, **Publish GitHub Release** will not run; PR and `development` builds still produce short-lived workflow artifacts only.

## What is automated after you trigger

- Build macOS (Apple Silicon + Intel) and Windows installers
- Sign, notarize (macOS), UKey-sign (Windows), and smoke-test Windows installs
- Create or update GitHub Release assets and release notes
- Optional ModelScope mirror and Feishu notification

## Fork vs upstream

Upstream [DSH Desktop releases](https://github.com/dataelement/dsh-desktop/releases) do not include Godot Codely changes. Tags copied from upstream do not replay CI on this fork; releases must be triggered on **this** repository after secrets and runners are configured.
