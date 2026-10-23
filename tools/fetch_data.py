"""Download the raw open-data sources into tools/raw/<source>/.

Run:  python -I tools/fetch_data.py
Each source lands in its own directory. Files already present are skipped.
"""
import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent / "raw"

SOURCES = {
    "jmdict": ["http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz"],
    "kanjidic": ["http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz"],
    "kanjivg": [
        "https://github.com/KanjiVG/kanjivg/releases/download/r20260714/kanjivg-20260714.xml.gz"
    ],
    "tatoeba": [
        "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2",
        "https://downloads.tatoeba.org/exports/per_language/jpn/jpn-eng_links.tsv.bz2",
        "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_transcriptions.tsv.bz2",
        "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2",
    ],
    # Community JLPT level lists (derived from Jonathan Waller's tanos.co.uk lists)
    "jlpt-vocab": [
        f"https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n{n}.csv"
        for n in range(1, 6)
    ],
    "jlpt-kanji": [
        "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json"
    ],
}


def main() -> None:
    only = set(sys.argv[1:])
    for name, urls in SOURCES.items():
        if only and name not in only:
            continue
        folder = RAW / name
        folder.mkdir(parents=True, exist_ok=True)
        for url in urls:
            dest = folder / url.rsplit("/", 1)[1]
            if dest.exists() and dest.stat().st_size > 0:
                print(f"skip {dest.name}")
                continue
            print(f"get  {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "kana-quest-data-fetch"})
            with urllib.request.urlopen(req) as resp, open(dest, "wb") as out:
                while chunk := resp.read(1 << 16):
                    out.write(chunk)
            print(f"     {dest.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
