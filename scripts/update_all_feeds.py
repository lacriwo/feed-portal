#!/usr/bin/env python3
import json
import time
import urllib.error
import urllib.request
import xml.dom.minidom as minidom
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECTS_FILE = ROOT / "data" / "projects.json"
STATE_FILE = ROOT / "data" / "state.json"
FEEDS_DIR = ROOT / "feeds"
INDEX_FILE = FEEDS_DIR / "index.json"

FEEDS_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, data) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def fetch_xml_bytes(url: str, retries: int = 3, timeout: int = 90) -> bytes:
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                status = getattr(response, "status", 200)
                if status >= 400:
                    raise RuntimeError(f"HTTP status {status}")
                return response.read()
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(attempt * 2)
    raise RuntimeError(f"Failed to load source feed: {last_error}")


def local_name(tag: str) -> str:
    if tag.startswith("{") and "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def should_refresh(slug: str, interval_hours: int, state: dict, now: datetime) -> bool:
    entry = state.get(slug)
    if not entry:
        return True

    last = entry.get("last_refresh_utc")
    if not last:
        return True

    try:
        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
    except ValueError:
        return True

    return now - last_dt >= timedelta(hours=interval_hours)


def build_patched_feed(project: dict) -> bytes:
    xml_data = fetch_xml_bytes(project["source_feed_url"])
    root = ET.fromstring(xml_data)

    ns_uri = ""
    if root.tag.startswith("{") and "}" in root.tag:
        ns_uri = root.tag[1:root.tag.index("}")]
        ET.register_namespace("", ns_uri)

    target_fields = set(project["fields"])
    replacement = project["replacement_value"]

    for elem in root.iter():
        if local_name(elem.tag) in target_fields:
            elem.text = replacement

    compact = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    pretty = minidom.parseString(compact).toprettyxml(indent="  ", encoding="utf-8")
    return pretty


def main() -> None:
    projects_payload = load_json(PROJECTS_FILE, {"projects": []})
    projects = projects_payload.get("projects", [])
    state = load_json(STATE_FILE, {})
    now = datetime.now(timezone.utc)
    updated = []

    for project in projects:
        slug = project["slug"]
        interval = int(project["interval_hours"])

        if not should_refresh(slug, interval, state, now):
            print(f"Skip {slug}: not due yet")
            continue

        print(f"Refreshing {slug}...")
        xml_bytes = build_patched_feed(project)
        out_file = FEEDS_DIR / f"{slug}.xml"
        with out_file.open("wb") as fh:
            fh.write(xml_bytes)

        state[slug] = {"last_refresh_utc": now.isoformat().replace("+00:00", "Z")}
        updated.append(slug)

    save_json(STATE_FILE, state)

    index_payload = {
        "generated_at_utc": now.isoformat().replace("+00:00", "Z"),
        "projects": [
            {
                "slug": p["slug"],
                "project_name": p["project_name"],
                "interval_hours": p["interval_hours"],
                "feed_path": f"feeds/{p['slug']}.xml",
            }
            for p in projects
        ],
    }
    save_json(INDEX_FILE, index_payload)
    print(f"Updated feeds: {', '.join(updated) if updated else 'none'}")


if __name__ == "__main__":
    main()
