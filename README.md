# Kana Quest かなクエスト

A Japanese learning game for phone and desktop. Learn hiragana, graduate to katakana,
then climb JLPT N5 → N1. Every stage is split into short units. Pass a unit quiz (≥ 90%)
to unlock the next one, and pass the stage's boss exam (≥ 85%) to graduate. Everything
you learn stays in FSRS spaced-repetition review.

- **Exercises:** recognition, production with live romaji→kana typing, listening (ja-JP
  speech), stroke-order tracing (KanjiVG), speed rounds with combos, look-alike drills,
  grammar (particle blanks, sentence tiles, translation) and reading.
- **Tap for romaji:** tap any Japanese text for its Hepburn romaji, reading and meaning.
  Turn *romaji assist* off in Settings as you improve.
- **Motivation:** XP, a daily goal and streak, level badges, a mistakes notebook,
  sounds and animations (both can be turned off).
- **Offline PWA:** installable, works offline, progress saved on the device, with
  export/import to move it between devices.

Status: **Phase 1** (hiragana, katakana, N5). N4–N1 appear on the map as "coming soon".
See [PROGRESS.md](PROGRESS.md).

## Run locally

Requirements: **Node.js 20+** (tested with 24) and npm. Python 3.10+ is only needed to
regenerate the data files, which are already committed.

```bash
git clone <your repo url> kana-quest
cd kana-quest
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm test             # unit tests (SRS, grading, kana conversion, unlock rules, content integrity)
npm run typecheck
npm run build        # production build in dist/
npm run preview      # serve dist/ at http://localhost:4173 (service worker active)
```

To try it on your phone on the same Wi-Fi, run `npm run dev -- --host` and open the
"Network" URL it prints. Installing as an app and working offline need HTTPS, so for the
real phone install use the GitHub Pages deployment below.

### End-to-end checks (optional)

These drive a real browser (Edge or Chrome, found automatically; set `BROWSER=` to override)
at phone size:

```bash
npx vite --port 5199 --strictPort            # terminal 1
node scripts/e2e.mjs e2e-shots               # terminal 2: plays hiragana → katakana → N5, saves screenshots
npm run build && npx vite preview --port 5299 --strictPort   # terminal 1
node scripts/pwa-check.mjs                   # terminal 2: manifest, service worker, offline reload
```

## Deploy to GitHub Pages

The repo includes `.github/workflows/deploy.yml`, which tests, builds and publishes on every
push to `main`. The build uses relative paths, so it works under any repository name.

1. Create an empty repository on GitHub, e.g. `kana-quest`. It must be public on a free
   account.
2. Push this project to it:
   ```bash
   git remote add origin https://github.com/<you>/kana-quest.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to finish (about 1 minute).
   If it ran before you changed the Pages setting, click **Re-run all jobs**.
5. Your app is at `https://<you>.github.io/kana-quest/`.

### Add it to your home screen

- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** ⋮ menu → *Install app* (or *Add to Home screen*).
- **Desktop (Chrome/Edge):** the install icon in the address bar.

Open the app once while online so it can cache everything. After that it works offline.
Updates install themselves the next time you open the app online.

### Moving progress between devices

Progress lives in each browser's storage (IndexedDB). Go to **Me → Settings → Export
progress** on one device (on phones this opens the share sheet, so you can save the file or
send it to yourself), then **Import progress** on the other. Each browser and installed app
keeps its own storage, so export before clearing site data.

## Data

`tools/fetch_data.py` downloads the open data. `tools/build_data.py` turns it into small
per-level JSON files in `public/data/` (N5 vocabulary + examples ≈ 230 KB).

```bash
npm run data:fetch                         # ≈ 50 MB into tools/raw/ (git-ignored)
npm run data:build                         # N5 (default)
python -I tools/build_data.py n5 n4        # more levels for later phases
```

| Data | Source | License |
|---|---|---|
| Vocabulary | JMdict (EDRDG) | CC BY-SA 4.0 |
| Kanji | KANJIDIC2 (EDRDG) | CC BY-SA 4.0 |
| Stroke order | KanjiVG | CC BY-SA 3.0 |
| Example sentences | Tatoeba | CC BY 2.0 FR |
| JLPT levels | Jonathan Waller's lists via open-anki-jlpt-decks and kanji-data | CC BY / MIT |

Grammar lessons (`src/content/grammar-n5.ts`) and reading passages
(`src/content/passages-n5.ts`) are written by hand. The Credits screen in the app lists all
sources.

## Project layout

```
src/core/       pure logic + types: romaji, grading, srs (ts-fsrs), unlock rules, progress, quiz generation
src/content/    kana tables, stage layouts, N5 grammar & passages, data loader
src/ui/         Preact screens and components
public/data/    generated per-level JSON (vocab, kanji, sentences, strokes)
tools/          Python data pipeline
tests/          Vitest unit + content-integrity tests
scripts/        browser end-to-end and PWA checks
```

## License

Code: MIT. Data in `public/data/`: CC BY-SA 4.0 (see [LICENSE](LICENSE)).
