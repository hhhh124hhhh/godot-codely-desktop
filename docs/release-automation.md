# Release automation (Godot Codely)

This fork publishes installers through GitHub Actions. Use **Orchestrate desktop release** as the single entry point; **Release desktop installers** performs build and upload.

## Automatic unsigned releases

Every push to **`main`** that touches code (not docs-only markdown) runs **Orchestrate desktop release** and dispatches **`mode=unsigned`** with **`target=all`**, using the semver in **`package.json`**. The GitHub Release tag is **`v<version>-unsigned`** (assets are replaced on rebuild). Add **`[skip release]`** to a commit message to skip one push. New pushes cancel an in-progress auto release for the same branch (`cancel-in-progress`).

## Manual flows

Open **Actions → Orchestrate desktop release → Run workflow**.

| Channel | Version example | What happens |
| --- | --- | --- |
| **unsigned** (default) | `0.1.0` | Dispatches `mode=unsigned` on GitHub-hosted runners. Builds **Linux AppImage** (`build:linux-pack`, no bundled Office runtime), **macOS DMG/ZIP**, and/or **Windows NSIS** without code signing and publishes **`v0.1.0-unsigned`** on GitHub Releases. Use `target=linux` for a Linux-only release. |
| **formal** | `0.1.0` (must match `package.json`, no `-rc`) | Creates and pushes `v0.1.0`; signed **Latest** release when Apple secrets and the Windows UKey runner succeed. |
| **prerelease** | `0.1.0-rc.1` | Signed **Pre-release** when the full signed pipeline succeeds. |

Manual alternative (same result):

- Formal: `git tag -a vX.Y.Z && git push origin vX.Y.Z`
- Prerelease: **Release desktop installers** → `mode=prerelease`, `target=all`, `prerelease_tag=X.Y.Z-rc.N`

## Before the first release

1. For **unsigned**, set **`unsigned_version`** / orchestrator **version** to the semver you want (bumping `package.json` is recommended but not enforced).
2. For **formal**, bump **`package.json` `version`** on `main` and merge.
3. **Unsigned** needs no signing secrets. **Formal / prerelease** require **Settings → Secrets and variables → Actions**:
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
