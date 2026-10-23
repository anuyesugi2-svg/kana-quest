"""Turn the raw open-data downloads into small per-level JSON files under public/data/.

Run after fetch_data.py:  python -I tools/build_data.py [levels...]   (default: n5)

Sources (see Credits screen / README for licenses):
  JMdict_e        -> vocabulary readings, meanings, part of speech
  KANJIDIC2       -> kanji meanings, on/kun readings, stroke counts
  KanjiVG         -> stroke order paths (kana + kanji)
  Tatoeba         -> example sentences with English translations and furigana
  JLPT lists      -> level assignment only (community lists derived from Jonathan Waller's)
"""
from __future__ import annotations

import bz2
import csv
import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
OUT = ROOT / "public" / "data"

VOCAB_PER_UNIT = 15
KANJI_PER_UNIT = 10


# ---------------------------------------------------------------- helpers

def is_kanji(ch: str) -> bool:
    return "一" <= ch <= "鿿" or ch == "々"


def is_kana(s: str) -> bool:
    return all("ぁ" <= c <= "ヿ" for c in s)


def is_katakana_word(s: str) -> bool:
    return all("ァ" <= c <= "ヺ" or c == "ー" for c in s)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({len(text.encode()):,} bytes)")


# ---------------------------------------------------------------- JMdict

PRI_RE = re.compile(r"nf(\d\d)")


def pri_score(pris: list[str]) -> int:
    """Lower is more common. nfXX ranks (500-word bands) win; other '1' tags count as common."""
    best = 99
    for p in pris:
        m = PRI_RE.fullmatch(p)
        if m:
            best = min(best, int(m.group(1)))
        elif p.endswith("1"):
            best = min(best, 50)
        elif p.endswith("2"):
            best = min(best, 70)
    return best


def load_jmdict() -> list[dict]:
    print("JMdict ...")
    with gzip.open(RAW / "jmdict" / "JMdict_e.gz", "rt", encoding="utf-8") as f:
        text = f.read()
    # Keep entity *names* (e.g. "v5u", "uk") instead of their long expansions.
    body_start = text.index("<JMdict>")
    body = re.sub(r"&([\w-]+);", lambda m: m.group(0) if m.group(1) in ("amp", "lt", "gt", "quot", "apos") else m.group(1), text[body_start:])
    entries = []
    for _, el in ET.iterparse(__import__("io").StringIO(body), events=("end",)):
        if el.tag != "entry":
            continue
        kebs = [(k.findtext("keb"), [p.text for p in k.findall("ke_pri")]) for k in el.findall("k_ele")]
        rebs = [
            (r.findtext("reb"), [p.text for p in r.findall("re_pri")], [x.text for x in r.findall("re_restr")], r.find("re_nokanji") is not None)
            for r in el.findall("r_ele")
        ]
        senses = []
        last_pos: list[str] = []
        for s in el.findall("sense"):
            pos = [p.text for p in s.findall("pos")] or last_pos
            last_pos = pos
            senses.append({
                "pos": pos,
                "misc": [m.text for m in s.findall("misc")],
                "gloss": [g.text for g in s.findall("gloss") if g.text],
            })
        entries.append({"seq": int(el.findtext("ent_seq")), "k": kebs, "r": rebs, "s": senses})
        el.clear()
    print(f"  {len(entries):,} entries")
    return entries


def entry_score(e: dict) -> int:
    return min([pri_score(p) for _, p in e["k"]] + [pri_score(p) for _, p, _, _ in e["r"]] + [99])


def entry_meanings(e: dict, max_senses: int = 3) -> list[str]:
    out = []
    for s in e["s"][:max_senses]:
        if s["gloss"]:
            out.append("; ".join(s["gloss"][:4]))
    return out


# ---------------------------------------------------------------- JLPT vocab level lists

def load_jlpt_vocab(level: str) -> list[tuple[str, str, str]]:
    rows = []
    with open(RAW / "jlpt-vocab" / f"{level}.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            expr = row["expression"].split(";")[0].strip()
            rows.append((expr, row["reading"].split(";")[0].strip(), row["meaning"].strip()))
    return rows


def match_vocab(rows, entries):
    by_keb = defaultdict(list)
    by_reb = defaultdict(list)
    for e in entries:
        for k, _ in e["k"]:
            by_keb[k].append(e)
        for r, _, _, _ in e["r"]:
            by_reb[r].append(e)

    def overlap(e, csv_meaning):
        want = set(re.findall(r"[a-z]+", csv_meaning.lower())) - {"to", "a", "the", "of", "an", "be"}
        have = set(re.findall(r"[a-z]+", " ".join(entry_meanings(e)).lower()))
        return len(want & have)

    def kana_fit(e, reading):
        # For kana-only list entries prefer JMdict entries that are kana words or "usually kana".
        if not e["k"]:
            return 0
        return 0 if e["s"] and "uk" in e["s"][0]["misc"] else 1

    out, misses, seen = [], [], set()
    for expr, reading, csv_meaning in rows:
        reading = reading.replace("～", "").replace("〜", "")
        expr = expr.replace("～", "").replace("〜", "")
        cands = []
        for ex, rd in ((expr, reading), (re.sub(r"(する|と)$", "", expr), re.sub(r"(する|と)$", "", reading))):
            if is_kana(ex):
                cands = by_reb.get(ex, [])
            else:
                cands = [e for e in by_keb.get(ex, []) if any(r == rd for r, *_ in e["r"])] or by_keb.get(ex, [])
            if cands:
                expr, reading = ex, rd
                break
        if not cands:
            misses.append(expr)
            continue
        if is_kana(expr):
            e = min(cands, key=lambda e: (-overlap(e, csv_meaning), kana_fit(e, reading), entry_score(e)))
        else:
            e = min(cands, key=lambda e: (-overlap(e, csv_meaning), entry_score(e)))
        if e["seq"] in seen:
            continue
        seen.add(e["seq"])
        kanji_form = None if is_kana(expr) else expr
        uk = bool(e["s"]) and "uk" in e["s"][0]["misc"]
        meanings = entry_meanings(e) or [csv_meaning]
        item = {
            "id": f"v:{e['seq']}",
            "w": reading if (kanji_form is None or uk) else kanji_form,
            "r": reading,
            "m": meanings,
            "pos": e["s"][0]["pos"] if e["s"] else [],
            "f": entry_score(e),
        }
        if kanji_form and uk:
            item["k"] = kanji_form
        out.append(item)
    return out, misses


# ---------------------------------------------------------------- KANJIDIC2

def load_kanjidic(chars: set[str]) -> dict[str, dict]:
    print("KANJIDIC2 ...")
    out = {}
    with gzip.open(RAW / "kanjidic" / "kanjidic2.xml.gz", "rb") as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != "character":
                continue
            c = el.findtext("literal")
            if c in chars:
                rm = el.find("reading_meaning")
                rmg = rm.find("rmgroup") if rm is not None else None
                on, kun, mean = [], [], []
                if rmg is not None:
                    on = [r.text for r in rmg.findall("reading") if r.get("r_type") == "ja_on"]
                    kun = [r.text for r in rmg.findall("reading") if r.get("r_type") == "ja_kun"]
                    mean = [m.text for m in rmg.findall("meaning") if m.get("m_lang") is None]
                misc = el.find("misc")
                out[c] = {
                    "strokes": int(misc.findtext("stroke_count")),
                    "grade": int(misc.findtext("grade") or 99),
                    "freq": int(misc.findtext("freq") or 9999),
                    "on": on,
                    "kun": kun,
                    "m": mean,
                }
            el.clear()
    return out


# ---------------------------------------------------------------- KanjiVG

def load_strokes(chars: set[str]) -> dict[str, list[str]]:
    print("KanjiVG ...")
    out = {}
    with gzip.open(RAW / "kanjivg" / "kanjivg-20260714.xml.gz", "rb") as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != "kanji":
                continue
            code = el.get("id", "").rsplit("_", 1)[-1]
            if "-" in code:  # variant forms like kanji_05b57-Kaisho
                el.clear()
                continue
            ch = chr(int(code, 16))
            if ch in chars:
                paths = []
                for p in el.iter("path"):
                    m = re.search(r"-s(\d+)$", p.get("id", ""))
                    if m:
                        paths.append((int(m.group(1)), p.get("d")))
                out[ch] = [d for _, d in sorted(paths)]
            el.clear()
    missing = chars - out.keys()
    if missing:
        print(f"  no stroke data for: {''.join(sorted(missing))}")
    return out


# ---------------------------------------------------------------- Tatoeba

FURI_RE = re.compile(r"\[([^\]|]+)((?:\|[^\]|]*)+)\]")


def furi_to_plain(furi: str) -> tuple[str, str]:
    """'[今日|きょう]は' -> ('今日は', 'きょうは')."""
    plain = FURI_RE.sub(lambda m: m.group(1), furi)
    reading = FURI_RE.sub(lambda m: "".join(m.group(2).split("|")), furi)
    return plain, reading


def load_tatoeba(allowed_kanji: set[str]) -> dict[int, dict]:
    print("Tatoeba ...")
    t = RAW / "tatoeba"
    jpn = {}
    with bz2.open(t / "jpn_sentences.tsv.bz2", "rt", encoding="utf-8") as f:
        for line in f:
            sid, _, text = line.rstrip("\n").split("\t", 2)
            if 4 <= len(text) <= 28 and all(not is_kanji(c) or c in allowed_kanji for c in text):
                jpn[int(sid)] = text
    furi = {}
    with bz2.open(t / "jpn_transcriptions.tsv.bz2", "rt", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            sid = int(parts[0])
            if sid in jpn and parts[2] == "Hrkt":
                plain, reading = furi_to_plain(parts[-1])
                if plain == jpn[sid] and is_kana(re.sub(r"[。、！？「」・…\s!?.,ー〜]", "", reading)):
                    furi[sid] = parts[-1]
    links = {}
    with bz2.open(t / "jpn-eng_links.tsv.bz2", "rt", encoding="utf-8") as f:
        for line in f:
            a, b = map(int, line.split("\t"))
            if a in furi and a not in links:
                links[a] = b
    want = set(links.values())
    eng = {}
    with bz2.open(t / "eng_sentences.tsv.bz2", "rt", encoding="utf-8") as f:
        for line in f:
            sid, _, text = line.rstrip("\n").split("\t", 2)
            if int(sid) in want:
                eng[int(sid)] = text
    out = {}
    for sid, e in links.items():
        if e in eng:
            out[sid] = {"jp": jpn[sid], "furi": furi[sid], "en": eng[e]}
    print(f"  {len(out):,} usable sentences")
    return out


# ---------------------------------------------------------------- kana practice words

SOKUON_RE = re.compile(r".[っッ].")
LONG_H_RE = re.compile(r"(ああ|いい|うう|えい|ええ|おう|おお)")
EXTENDED = ["ファ", "フィ", "フェ", "フォ", "ティ", "ディ", "トゥ", "ドゥ", "ウィ", "ウェ", "ウォ",
            "ヴァ", "ヴィ", "ヴ", "ヴェ", "ヴォ", "シェ", "ジェ", "チェ", "ツァ", "デュ"]


AVOID_MISC = {"vulg", "X", "sl", "derog", "arch", "obs", "abbr", "col", "joc"}


def kana_words(entries, vocab_lists):
    def common_entries(pred):
        res = []
        for e in entries:
            score = entry_score(e)
            if score > 50 or not e["s"] or AVOID_MISC & set(e["s"][0]["misc"]):
                continue
            reb = e["r"][0][0]
            if pred(reb):
                res.append((score, len(reb), e["seq"], reb, e))
        res.sort()
        return res

    def pack(cands, n, seen):
        out = []
        for _, _, seq, reb, e in cands:
            if seq in seen or len(out) >= n:
                continue
            seen.add(seq)
            out.append({"id": f"w:{seq}", "kana": reb, "m": entry_meanings(e, 1)[0]})
        return out

    seen: set[int] = set()
    # Practice words come from the JLPT lists (easiest level first) so they're useful later too.
    vocab = [v for lv in vocab_lists for v in sorted(lv, key=lambda v: v["f"])]

    def pick(script_ok, pred, n):
        out = []
        for v in vocab:
            seq = int(v["id"][2:])
            if seq in seen or not (3 <= len(v["r"]) <= 6) or not script_ok(v["r"]) or not pred(v["r"]):
                continue
            seen.add(seq)
            out.append({"id": f"w:{seq}", "kana": v["r"], "m": v["m"][0]})
            if len(out) >= n:
                break
        return out

    hira = lambda r: all("ぁ" <= c <= "ゖ" for c in r)
    result = {
        "sokuon_h": pick(hira, lambda r: SOKUON_RE.search(r) is not None, 12),
        "long_h": pick(hira, lambda r: LONG_H_RE.search(r) is not None and "っ" not in r, 12),
        "sokuon_k": pick(is_katakana_word, lambda r: "ッ" in r[1:-1], 10),
        "long_k": pick(is_katakana_word, lambda r: "ー" in r and "ッ" not in r, 10),
    }
    ext = []
    for sound in EXTENDED:
        ext += pack(common_entries(lambda r, s=sound: is_katakana_word(r) and s in r and 3 <= len(r) <= 7 and not r.endswith("ッ")), 1, seen)
    result["ext_k"] = ext
    return result


KANA_CHARS = (
    "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"
    "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょっ"
    "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン"
    "ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポャュョッヴァィゥェォー"
)


# ---------------------------------------------------------------- main

def main() -> None:
    levels = sys.argv[1:] or ["n5"]
    entries = load_jmdict()

    kana_strokes = load_strokes(set(KANA_CHARS))
    write_json(OUT / "strokes" / "kana.json", kana_strokes)

    kanji_levels = json.loads((RAW / "jlpt-kanji" / "kanji.json").read_text(encoding="utf-8"))
    vocab_by_level = {}
    for lv in ["n5", "n4"] + levels:
        if lv not in vocab_by_level:
            v, misses = match_vocab(load_jlpt_vocab(lv), entries)
            vocab_by_level[lv] = v
            print(f"{lv}: {len(v)} words matched, {len(misses)} unmatched: {' '.join(misses[:30])}")

    if "n3" not in vocab_by_level:
        vocab_by_level["n3"] = match_vocab(load_jlpt_vocab("n3"), entries)[0]
    write_json(OUT / "kana-words.json", kana_words(entries, [vocab_by_level[k] for k in ("n5", "n4", "n3")]))

    cumulative_kanji: set[str] = set()
    for lv in sorted(levels, reverse=True):  # n5 first
        n = int(lv[1])
        level_kanji = {c for c, v in kanji_levels.items() if v["jlpt_new"] == n}
        cumulative_kanji |= {c for c, v in kanji_levels.items() if v["jlpt_new"] and v["jlpt_new"] >= n}
        kd = load_kanjidic(level_kanji)
        strokes = load_strokes(level_kanji)
        write_json(OUT / "strokes" / f"{lv}.json", strokes)

        vocab = sorted(vocab_by_level[lv], key=lambda v: (v["f"], len(v["r"])))
        # Examples may use kanji from one level up (you can tap them for readings);
        # reading passages stay within the level's cumulative kanji.
        next_kanji = {c for c, v in kanji_levels.items() if v["jlpt_new"] == n - 1}
        word_kanji = {c for v in vocab for c in (v.get("k") or v["w"]) if is_kanji(c)}
        easy = cumulative_kanji | next_kanji
        sentences = load_tatoeba(easy | word_kanji)
        for s in sentences.values():
            s["reading"] = furi_to_plain(s["furi"])[1]
            s["hard"] = sum(1 for c in s["jp"] if is_kanji(c) and c not in cumulative_kanji)
            s["kanji"] = {c for c in s["jp"] if is_kanji(c)}

        def contains(v, s):
            """Does sentence s use word v? Conjugating words match on their stem, checked against furigana."""
            conj = any(p.startswith(("v1", "v5", "adj-i", "vk", "vs-")) for p in v["pos"])
            for form in filter(None, (v.get("k"), v["w"])):
                stem, rstem = (form[:-1], v["r"][:-1]) if conj and len(form) > 1 else (form, v["r"])
                if not stem or stem not in s["jp"]:
                    continue
                if is_kana(stem):
                    if len(stem) >= 3:
                        return True
                    continue
                if len(stem) == 1:
                    if f"[{stem}|{rstem}]" in s["furi"] or (conj and f"[{stem}|" in s["furi"] and rstem in s["reading"]):
                        return True
                elif rstem in s["reading"]:
                    return True
            return False

        used = {}
        ordered = sorted(sentences.items(), key=lambda kv: (kv[1]["hard"], len(kv[1]["jp"]), kv[0]))
        for v in vocab:
            ex = []
            ok_kanji = easy | {c for c in (v.get("k") or v["w"])}
            for sid, s in ordered:
                if len(s["jp"]) >= 6 and s["kanji"] <= ok_kanji and contains(v, s):
                    ex.append(sid)
                    used[sid] = s
                    if len(ex) == 2:
                        break
            if ex:
                v["ex"] = ex
        print(f"  {sum(1 for v in vocab if 'ex' in v)}/{len(vocab)} words have example sentences")

        # Reading sets: sentences dense in this level's vocabulary.
        words = [v["w"] for v in vocab if len(v["w"]) >= 2]
        scored = []
        for sid, s in sentences.items():
            if 10 <= len(s["jp"]) <= 26 and s["hard"] == 0:
                hits = sum(1 for w in words if w in s["jp"])
                if hits >= 3:
                    scored.append((len(s["jp"]), sid))
        scored.sort()
        step = max(1, len(scored) // 60)
        reading = [sid for _, sid in scored[::step]][:60]
        for sid in reading:
            used[sid] = sentences[sid]

        kanji = []
        for c in sorted(level_kanji, key=lambda c: (kd[c]["grade"], kd[c]["freq"], kd[c]["strokes"])):
            k = kd[c]
            kanji.append({
                "id": f"j:{c}", "c": c, "m": k["m"][:4], "on": k["on"][:4], "kun": k["kun"][:4],
                "s": k["strokes"],
                "words": [v["id"] for v in vocab if c in (v.get("k") or v["w"])][:6],
            })
        for v in vocab:
            v.pop("f", None)

        write_json(OUT / lv / "vocab.json", vocab)
        write_json(OUT / lv / "kanji.json", kanji)
        write_json(OUT / lv / "sentences.json", {str(k): {"furi": v["furi"], "en": v["en"]} for k, v in used.items()})
        write_json(OUT / lv / "reading.json", reading)


if __name__ == "__main__":
    main()
