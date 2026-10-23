# Progress log

Read this first when picking the project back up.

## Status (2026-10-23): Phase 1 built

Phase 1 = hiragana + katakana + N5, playable end to end.

### Done
- **Stack:** Vite 8, Preact 11, TypeScript 7, vite-plugin-pwa (Workbox), ts-fsrs (FSRS-6),
  WanaKana, idb-keyval, Vitest. Hash routing and a relative base path, so it runs from any
  GitHub Pages path.
- **Data pipeline** (`tools/`): JMdict, KANJIDIC2, KanjiVG, Tatoeba and community JLPT lists
  produce `public/data/{kana-words,n5/*,strokes/*}.json`.
  - 702 N5 words, 625 of them with Tatoeba example sentences.
  - 79 N5 kanji.
  - 157 kana and 79 kanji stroke sets.
  - 60 reading sentences.
- **Stages:**
  - Hiragana: 11 units. Rows, a わをん + look-alikes drill, dakuten/handakuten, two combo
    units, small っ, long vowels.
  - Katakana: 14 units. The same, plus ッ, ー, two extended-sound units and loanwords.
  - N5: 79 units. 47 vocabulary, 8 kanji, 14 grammar and 10 reading, interleaved in the
    pattern V V G K V G V R.
  - N4–N1 appear as locked "coming soon" stages.
- **Rules:** a unit quiz needs ≥ 90% and unlocks the next unit. The boss exam (30 questions
  for kana, 40 for N5) needs ≥ 85%. If you fail, you get a weak-items list, a drill, then a
  retry. Graduating unlocks the next stage.
- **Exercises:**
  - Kana → romaji, typed or picked.
  - Romaji → kana.
  - Listening, when a ja-JP voice exists.
  - Stroke tracing.
  - Look-alike drills.
  - Vocab meaning, both directions.
  - Typing readings and production with live romaji→kana conversion.
  - Kanji meaning and reading.
  - Grammar: blanks, tiles, choice.
  - Sentence translation and listening.
  - Passage questions.
  - Speed round: 60 s, with a combo multiplier up to ×4.
- **Tap-for-romaji** everywhere through `<Jp>`. Kanji groups show their reading, romaji and
  vocab meaning; the rest of a sentence shows the whole sentence's reading, romaji and
  translation. The global romaji-assist toggle hides romaji.
- **Engagement:** XP, an adjustable daily goal (20/50/100/150), a streak, player level,
  15 badges, the mistakes notebook, confetti, synthesized sound effects, and a 14-day chart.
- **Progress:** IndexedDB, plus export (share sheet or download) and import with validation
  and migration.
- **Tests:**
  - 105 Vitest tests covering romaji, grading, SRS, unlock, progress, furigana, stroke
    matching, kana tables, and content integrity (every unit generates a valid quiz).
  - `scripts/e2e.mjs` plays hiragana (including a failed unit and a failed boss), the
    drill, the boss pass, katakana, N5 units, reviews and a speed round at 390×844, and
    checks for horizontal overflow and console errors.
  - `scripts/pwa-check.mjs` checks the manifest, service worker and an offline reload.

### Next
1. Deploy to GitHub Pages and test on a real phone: install, offline use, the Japanese voice,
   tracing by finger, and the iOS keyboard with live kana input.
2. Have the user check the grammar items listed below.
3. Phase 2: N4. Run `python -I tools/build_data.py n5 n4`, add `grammar-n4.ts` and passages,
   and add the stage in `content/index.ts` (`buildJlptStage('n4', ...)`, mark it available,
   load `n4/*.json` plus `strokes/n4.json`).
4. Nice-to-haves: an optional furigana display mode, a per-stage "test out" placement exam,
   pitch-accent notes, better particle detection for Tatoeba romaji (would need a tokenizer).

## Decisions (small calls made without asking)

| Area | Decision |
|---|---|
| Romaji style | Hepburn as typed on a keyboard (wāpuro): shi/chi/tsu/fu/ji, long vowels doubled (koohii, otousan), n' before vowels and y. Macrons are accepted in answers. |
| Accepted input | Hepburn or kunrei (si, tu, zi…), ti/di for ティ/ディ, `-` for ー, n with or without the apostrophe. を also accepts "o"; ぢ/づ accept "ji/zu" or "di/du". |
| SRS | FSRS (ts-fsrs) with 90% target retention, a 3-year maximum interval, and fuzz. Items enter SRS when their unit is first passed. Rated Good if never missed in the quiz, Hard if peeked, Again if missed. Reviews: one question per item, missed items asked once more (unrated), batches of 20. A missed item in a boss exam is reset to Again. |
| Peeking | Tapping the prompt in a quiz counts as a peek: the answer still shows, but scores as a miss and rates Hard. |
| Missed questions | Asked again once at the end of a unit quiz, unscored, so the score is first attempts only. Drills repeat until correct. |
| Writing | At most 2 tracing questions per quiz, none in boss exams or speed rounds. A trace counts as correct with ≤ max(2, strokes/3) mistakes. After 3 misses on one stroke, the canvas shows it and moves on. Can be turned off in Settings. |
| Listening | Skipped automatically when the device has no Japanese voice (Settings explains how to add one). |
| XP | +2 per correct answer, +20 for a first unit pass (+5 on repeats), +10 for a perfect score, +100 for a first boss pass, ×1–×4 per correct answer in speed rounds. Default daily goal is 50 XP. |
| Streak | A day counts when the daily goal is met. Missing a day resets it. No streak freezes. |
| Mistakes notebook | An item leaves after 3 correct answers in a row, in any mode. |
| Kana practice words | Picked automatically from the N5/N4/N3 lists (っ/ッ, long vowels) and common JMdict loanwords for extended sounds. |
| N5 vocab order | JMdict frequency (nfXX) first, then reading length, in 15-word units. Kanji ordered by school grade, then frequency, in 10-kanji units. |
| Examples | Up to 2 Tatoeba sentences per word, shortest first. They may use the word's own kanji plus N5/N4 kanji. Reading sentences use only N5 kanji. |
| Reading | Tatoeba sentence sets (6 per unit), plus 4 hand-written passages spread across the reading units. Reading items are not put into SRS. |
| Fonts | Noto Sans JP 400/700 via @fontsource, cached on first use (not precached, since that's ~4 MB). On a fresh offline install, unseen glyphs fall back to the system Japanese font. |
| Storage | Progress is one IndexedDB record, saved 250 ms after each change. `navigator.storage.persist()` is requested. |
| Licensing | Code is MIT. Generated data is CC BY-SA 4.0 (Tatoeba parts CC BY 2.0 FR). Credits screen in the app. |

## Please check (grammar and content I'm not 100% sure about)

1. **なん vs なに** (`ka`): I simplified it to "なん before です and counters; なに before particles like を". There are more rules (なんで, なにで, etc.).
2. **も** (`mo`): the "question word + も + negative" rule. Note that どこも + a positive verb ("everywhere") is fine; my wording only targets the "nothing/nobody" meaning.
3. **七時** is read しちじ in the examples. ななじ is also heard; only しちじ appears as an answer.
4. **知っています / 知りません** (`te-iru`): I teach that "I don't know" is 知りません rather than 知っていません.
5. **たい for other people** (`tai`): I say it sounds odd in plain statements about others (you'd use たがっている, which isn't taught yet).
6. **Particle detection in Tatoeba romaji:** は/へ after kanji, katakana or common words is read wa/e. This is a heuristic, so a few sentences may romanize は as "ha" or the reverse. Hand-written content marks particles explicitly.
7. **Okurigana spacing in romaji** (食べる → taberu, 天気です → tenki desu) is also heuristic; spacing can look odd in long kana-only stretches.
8. **N5 list quirks:** the community list includes a few items such as 四 (し) and はく. Meanings come from JMdict, so some first glosses are broad (e.g. 台 "stand; rest; base").
9. **Tatoeba sentences** are crowd-sourced. A few are casual or dialectal (e.g. 足ぐねたんか？).
10. **Grammar ordering** follows a common N5 textbook order; the JLPT has no official grammar list.

## Notes for future sessions
- Preact 11 does **not** add `px` to numeric inline styles; use strings (`'8px'`).
- Don't rewrite source files with Windows PowerShell `Get-Content`/`Set-Content`: it double-encodes UTF-8. Use the editor or Node/Python.
- Dev-only hooks (`window.__kqQuestion`, `window.__kqState`) exist for the e2e script; they're stripped from production builds (`import.meta.env.DEV`).
