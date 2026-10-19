#!/usr/bin/env python3
"""Mirror a verified unsigned GitHub release into ModelScope."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Callable, Protocol


class ModelScopeApi(Protocol):
    def upload_folder(
        self,
        *,
        repo_id: str,
        folder_path: str,
        path_in_repo: str,
        commit_message: str,
        token: str,
    ) -> object: ...


def read_manifest(directory: Path) -> dict[str, str]:
    manifest = directory / "SHA256SUMS.txt"
    if not manifest.is_file():
        raise ValueError("Missing SHA256SUMS.txt")

    hashes: dict[str, str] = {}
    for line in manifest.read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([a-fA-F0-9]{64})  ([^/\\]+)", line)
        if not match:
            raise ValueError(f"Invalid SHA256SUMS.txt entry: {line!r}")
        digest, name = match.groups()
        if name in hashes or name == "MIRROR-INFO.json":
            raise ValueError(f"Duplicate or reserved release asset name: {name}")
        asset = directory / name
        if not asset.is_file():
            raise ValueError(f"Release asset listed in SHA256SUMS.txt is missing: {name}")
        actual = hashlib.sha256(asset.read_bytes()).hexdigest()
        if actual.lower() != digest.lower():
            raise ValueError(f"SHA-256 mismatch for {name}")
        hashes[name] = actual

    if not hashes:
        raise ValueError("SHA256SUMS.txt contains no assets")
    return hashes


def mirror(
    directory: Path,
    version: str,
    repo_id: str,
    source_commit: str,
    run_id: str,
    api_factory: Callable[[], ModelScopeApi] | None = None,
) -> list[str]:
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise ValueError("version must be a non-v semver")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo_id):
        raise ValueError("Invalid ModelScope repository ID")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", source_commit):
        raise ValueError("source_commit must be a full Git commit SHA")
    if not re.fullmatch(r"[1-9]\d*", run_id):
        raise ValueError("run_id must be a positive integer")

    token = os.environ.get("MODELSCOPE_TOKEN", "")
    if not token:
        raise ValueError("MODELSCOPE_TOKEN is required to upload a mirror")

    hashes = read_manifest(directory)
    info = {
        "version": version,
        "sourceCommit": source_commit.lower(),
        "workflowRunUrl": f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ.get('GITHUB_REPOSITORY', repo_id)}/actions/runs/{run_id}",
        "sha256": hashes,
    }
    (directory / "MIRROR-INFO.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Import the optional SDK only after local inputs have been fully verified.
    if api_factory is None:
        from modelscope.hub.api import HubApi

        api_factory = HubApi

    api = api_factory()
    destinations = [f"releases/archive/{version}", "releases/latest"]
    for destination in destinations:
        api.upload_folder(
            repo_id=repo_id,
            folder_path=str(directory),
            path_in_repo=destination,
            commit_message=f"Unsigned release {version} {source_commit[:12]}",
            token=token,
        )
        print(f"Uploaded unsigned release mirror: {repo_id}/{destination}")
    return destinations


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    mirror(args.directory, args.version, args.repo_id, args.source_commit, args.run_id)


if __name__ == "__main__":
    main()
