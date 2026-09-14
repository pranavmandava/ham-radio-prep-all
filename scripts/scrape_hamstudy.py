"""Scrape HamStudy.org General 2023-2027 explanations for personal exam prep.

Source pages are public, no login required. Output: explanations.json
  { "<QID>": {"text": "...", "url": "https://hamstudy.org/browse/E3_2023/<GROUP>" } }
Content is HamStudy's (user-contributed, (c) Signal Stuff) — attributed in-app
with a link back per question. Polite: sequential requests, browser UA.
"""
import html as htmlmod
import json
import re
import urllib.request

BASE = "https://hamstudy.org"
# Technician 2022 pool -> E2_2022/T0A.., General 2023 -> E3_2023/G0A.., Extra 2024 -> E4_2024/E0A..
GROUPS = ["G0A","G0B","G1A","G1B","G1C","G1D","G1E","G2A","G2B","G2C","G2D","G2E",
          "G3A","G3B","G3C","G4A","G4B","G4C","G4D","G4E","G5A","G5B","G5C",
          "G6A","G6B","G7A","G7B","G7C","G8A","G8B","G8C","G9A","G9B","G9C","G9D"]

def fetch(path: str) -> str:
    req = urllib.request.Request(
        BASE + path, headers={"User-Agent": "Mozilla/5.0 (exam-prep personal-use)"}
    )
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")

def clean_html_fragment(frag: str) -> str:
    # drop the "Last edited by" and tags paragraphs
    frag = re.sub(r"<p>\s*Last edited by.*?</p>", "", frag, flags=re.S | re.I)
    frag = re.sub(r"<p class=\"tags\".*?</p>", "", frag, flags=re.S | re.I)
    # paragraphs -> newlines, then strip remaining tags
    frag = re.sub(r"</p\s*>", "\n", frag, flags=re.I)
    frag = re.sub(r"<br\s*/?>", "\n", frag, flags=re.I)
    text = re.sub(r"<[^>]+>", "", frag)
    text = htmlmod.unescape(text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text

def parse_page(html: str) -> dict:
    out = {}
    # each question: <div class="flashcard_slide" id="G1A01"> ... <div class="description"><div> ...explanation paras... <p>Last edited
    for m in re.finditer(
        r'<div class="flashcard_slide" id="([A-Z0-9]+)">.*?<div class="description">\s*<div>(.*?)<p>\s*Last edited by',
        html,
        flags=re.S,
    ):
        qid, frag = m.group(1), m.group(2)
        text = clean_html_fragment(frag)
        if text:
            out[qid] = text
    return out

def main() -> None:
    all_exp: dict = {}
    per_page: dict = {}
    for grp in GROUPS:
        path = f"/browse/E3_2023/{grp}"
        html = fetch(path)
        parsed = parse_page(html)
        per_page[path] = len(parsed)
        for qid, text in parsed.items():
            all_exp[qid] = {"text": text, "url": BASE + path}
        print(f"{path}: {len(parsed)} explanations")
    with open("explanations.json", "w") as f:
        json.dump(all_exp, f, indent=1)
    print(f"total: {len(all_exp)} -> explanations.json")

    # coverage vs local pool
    try:
        pool = json.load(open("pool.json"))
        ids = [q["id"] for q in pool]
        hit = sum(1 for i in ids if i in all_exp)
        missing = [i for i in ids if i not in all_exp]
        print(f"pool coverage: {hit}/{len(ids)}")
        if missing:
            print(f"missing ({len(missing)}): {missing[:30]}")
    except FileNotFoundError:
        pass

if __name__ == "__main__":
    main()
