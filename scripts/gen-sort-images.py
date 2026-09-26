#!/usr/bin/env python3
"""Generate timeline sort flashcards via Agnes and save under client/public/sort."""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

PYTHON = sys.executable
AGNES = Path(r"C:\Users\Administrator\.cursor\skills\agnes-ai\scripts\agnes_api.py")
OUT = Path(r"E:\cursor\keji-liliang-scoreboard\client\public\sort")

JOBS = [
    ("yi-hide.png", "Children educational flashcard, ancient people wearing animal hide and leaf clothes, simple flat cartoon illustration, white background, no text, square icon style"),
    ("yi-hemp.png", "Children educational flashcard, rough hemp cloth robe in ancient China, simple flat cartoon illustration, white background, no text, square icon"),
    ("yi-hand-cotton.png", "Children educational flashcard, handmade cotton cloth clothing and hand loom, simple flat cartoon, white background, no text, square icon"),
    ("yi-machine-cotton.png", "Children educational flashcard, machine-woven cotton clothes and textile factory, simple flat cartoon, white background, no text, square icon"),
    ("yi-modern.png", "Children educational flashcard, modern functional sportswear and tech fabric clothing, simple flat cartoon, white background, no text, square icon"),
    ("shi-fire.png", "Children educational flashcard, prehistoric campfire roasting food, simple flat cartoon, white background, no text, square icon"),
    ("shi-pottery.png", "Children educational flashcard, ancient clay pottery cooking pots over fire, simple flat cartoon, white background, no text, square icon"),
    ("shi-wood-stove.png", "Children educational flashcard, traditional clay stove with wood fire and iron wok, simple flat cartoon, white background, no text, square icon"),
    ("shi-gas.png", "Children educational flashcard, modern home gas stove cooking, simple flat cartoon, white background, no text, square icon"),
    ("shi-rice-cooker.png", "Children educational flashcard, electric rice cooker appliance, simple flat cartoon, white background, no text, square icon"),
    ("shi-auto-cook.png", "Children educational flashcard, automatic stir-fry cooking robot machine kitchen, simple flat cartoon, white background, no text, square icon"),
    ("zhu-cave.png", "Children educational flashcard, prehistoric cave dwelling home, simple flat cartoon, white background, no text, square icon"),
    ("zhu-thatch.png", "Children educational flashcard, thatched hut cottage countryside, simple flat cartoon, white background, no text, square icon"),
    ("zhu-adobe.png", "Children educational flashcard, adobe mud brick village house, simple flat cartoon, white background, no text, square icon"),
    ("zhu-brick.png", "Children educational flashcard, brick and tile single-story Chinese house, simple flat cartoon, white background, no text, square icon"),
    ("zhu-highrise.png", "Children educational flashcard, modern high-rise apartment building city, simple flat cartoon, white background, no text, square icon"),
    ("zhu-smart.png", "Children educational flashcard, smart home apartment with robots and gadgets, simple flat cartoon, white background, no text, square icon"),
]


def download(url: str, dest: Path, attempts: int = 4) -> None:
    last: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "kl-scoreboard/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp, dest.open("wb") as out:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    out.write(chunk)
            if dest.stat().st_size > 1000:
                return
            raise RuntimeError(f"downloaded file too small: {dest.stat().st_size}")
        except Exception as exc:  # noqa: BLE001 — retry then fail
            last = exc
            if dest.exists():
                dest.unlink(missing_ok=True)
            print(f"  retry download {i + 1}/{attempts}: {exc}", flush=True)
    raise RuntimeError(f"download failed after {attempts} attempts: {last}")


def gen_one(name: str, prompt: str, attempts: int = 3) -> None:
    dest = OUT / name
    last_err = ""
    for i in range(attempts):
        print(f"gen {name} (try {i + 1}/{attempts}) ...", flush=True)
        proc = subprocess.run(
            [PYTHON, str(AGNES), "image", "--prompt", prompt, "--size", "1K", "--ratio", "1:1"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
        if proc.returncode != 0:
            last_err = (proc.stderr or proc.stdout or "").strip()
            print(f"  FAIL api: {last_err[:400]}", flush=True)
            continue
        raw = proc.stdout.strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find("{")
            end = raw.rfind("}")
            if start < 0 or end < 0:
                last_err = f"no json: {raw[:300]}"
                print(f"  FAIL parse: {last_err}", flush=True)
                continue
            data = json.loads(raw[start : end + 1])
        urls = data.get("urls") or []
        if not urls:
            last_err = f"no url: {raw[:300]}"
            print(f"  FAIL {last_err}", flush=True)
            continue
        try:
            download(urls[0], dest)
            print(f"OK {name} {dest.stat().st_size}", flush=True)
            return
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            print(f"  FAIL download: {last_err}", flush=True)
    print(f"GIVE_UP {name}: {last_err}", flush=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, prompt in JOBS:
        dest = OUT / name
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"skip {name}", flush=True)
            continue
        gen_one(name, prompt)
    print("done", flush=True)


if __name__ == "__main__":
    main()
