from __future__ import annotations

import hashlib
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("mirror_unsigned_release.py")
SPEC = importlib.util.spec_from_file_location("mirror_unsigned_release", SCRIPT)
assert SPEC and SPEC.loader
mirror_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mirror_module)


class MirrorUnsignedReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(dir=SCRIPT.parents[2])
        self.directory = Path(self.temp.name)
        installer = self.directory / "godot-codely-windows-x64-setup.exe"
        installer.write_bytes(b"unsigned release test asset")
        digest = hashlib.sha256(installer.read_bytes()).hexdigest()
        (self.directory / "SHA256SUMS.txt").write_text(
            f"{digest}  {installer.name}\n", encoding="utf-8"
        )
        self.upload_calls: list[dict[str, object]] = []
        upload_calls = self.upload_calls

        class FakeApi:
            def upload_folder(self, **kwargs: object) -> None:
                upload_calls.append(kwargs)

        self.api_factory = FakeApi

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_uploads_verified_assets_to_archive_and_latest_with_provenance(self) -> None:
        with patch.dict(os.environ, {"MODELSCOPE_TOKEN": "test-token"}):
            destinations = mirror_module.mirror(
                self.directory, "0.1.8-4", "owner/repo", "a" * 40, "12345", self.api_factory
            )

        self.assertEqual(destinations, ["releases/archive/0.1.8-4", "releases/latest"])
        self.assertEqual([call["path_in_repo"] for call in self.upload_calls], destinations)
        info = (self.directory / "MIRROR-INFO.json").read_text(encoding="utf-8")
        self.assertIn('"version": "0.1.8-4"', info)
        self.assertIn('"sourceCommit": "' + "a" * 40 + '"', info)

    def test_rejects_checksum_mismatch_before_upload(self) -> None:
        (self.directory / "godot-codely-windows-x64-setup.exe").write_bytes(b"changed")
        with patch.dict(os.environ, {"MODELSCOPE_TOKEN": "test-token"}):
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                mirror_module.mirror(
                    self.directory, "0.1.8-4", "owner/repo", "a" * 40, "12345", self.api_factory
                )
        self.assertEqual(self.upload_calls, [])


if __name__ == "__main__":
    unittest.main()
