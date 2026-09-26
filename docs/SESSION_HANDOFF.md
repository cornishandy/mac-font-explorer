# Session handoff: Mac Font Explorer (formerly "Font Field")

_Written 2026-09-26 by Claude Code (Opus 5.5), taking over from a broken Codex thread in T3 Code._

## Where this came from

- **Original T3 Code thread:** `080f242c-bc53-4d66-a99a-146638a977e3`, titled "Font Preview and Comparison Tool". It lived in project `t3-nightly-toy` and ran on Codex `gpt-6-sol`.
- **Original folder:** `/Users/andrewphillips/Documents/ChatGPT/T3 Code/t3-nightly-toy/font-gallery/`. This is **reference only**. The user's open Chrome tab points at `…/font-gallery/Mac Font Gallery and Data Explorer.html` (and `index.html` is a symlink to it). Leave it unedited so that tab keeps working.
- **New home:** `/Users/andrewphillips/Documents/ChatGPT/mac-font-explorer/`. All work continues here.

## Why the old thread broke (diagnosis)

T3 Code's session row showed `status: error` with `last_error: thread 01a0d18a-f064-72c1-af35-4be949249f07 already has an active writer`.

- `01a0d18a-…` is the underlying **Codex** session ID (rollout `~/.codex/sessions/2026/09/23/rollout-2026-09-23T23-52-18-01a0d18a-….jsonl`).
- Codex allows one writer per session through `~/.codex/thread-writer-locks/<id>.lock`.
- `lsof` showed the lock held by **PID 64022**, the **ChatGPT desktop app's embedded Codex app-server** (`/Applications/ChatGPT.app/…/codex … app-server`). It opened that session at 00:26 on 2026-09-26, most likely when the thread appeared in or was clicked in the ChatGPT app's Codex sidebar. That app-server has kept the lock ever since.
- **Fix:** quit the ChatGPT desktop app (⌘Q), or at least close that conversation in its Codex pane. That releases the lock, and the T3 thread can send again. No files need deleting. Don't delete the `.lock` file while PID 64022 is alive, because the lock is held on the open file descriptor, not by the file's existence.

## Full request history (verbatim intent)

1. Build a site listing every font available in the Codex/T3 font picker. Show each font in its own face with sample sentences, a font-weight dropdown, stars, and a "compare starred only" view.
2. Show all fonts in English. Categorize by typeface and subtype, and add tiers, year created, popularity rank, and standardized height and width measurements. Include mono/sans/serif. Make everything sortable and filterable. Add a PCA chart and a Tableau-style chart where every field works as a filter or dimension (including starred), plus saved views.
   - Q&A decisions: popularity was to use a public-web proxy, and **all 183 families** were to get English samples with fallback labels.
3. Make it a single HTML file that works from `file://` day after day with no server. Done with `build-standalone.py`.
4. Give it a descriptive filename. It became `Mac Font Gallery and Data Explorer.html`.
5. **(Unanswered when the thread broke; this session's work):**
   - Make saves (stars, saved views, weight) **persistent across computer and phone**.
   - Add **descriptions and history for each font and each subtype**, with links to detailed info.
   - **Remove popularity entirely** (the 2014 crawl was too old).
   - Add a new **category/style filter**: "narrow/condensed", "handwritten" (Chalkboard, Noteworthy …), and other categories like those.
   - Eventually: wrap up documentation and decisions, **publish to GitHub**, create a **local project page** in `Documents/ChatGPT`, start a **new T3 Code project** on that folder, and **rename the thread** to match.

## Architecture (as inherited)

| File | Role |
|---|---|
| `tools/generate-font-metrics.swift` | CoreText measurement of each family's regular face at 16 pt, written to `data/metrics.json` |
| `data/wikidata-years-raw.json` | Wikidata typeface inception dates |
| `tools/build-data.py` | Classification, tiers, years, and PCA (Jacobi eigen), written to `font-data.js` (`window.FONT_DATA`) |
| `fonts.js` | `window.FONT_FAMILIES` list (183) |
| `index.template.html`, `styles.css`, `app.js` | UI in vanilla JS with no dependencies, SVG charts, and localStorage |
| `tools/build-standalone.py` | Inlines everything into the single-file HTML |

## Decisions made in this session

See `docs/DECISIONS.md` for the full list and rationale.

## Status checklist

See `README.md` § Status. It is updated as work lands.

## Resume prompt (paste into a new thread)

> Continue the Mac Font Explorer project at `~/Documents/ChatGPT/mac-font-explorer`. Read `docs/SESSION_HANDOFF.md`, `docs/DECISIONS.md`, and `README.md` § Status first. Then finish any unchecked items: cross-device sync via a private GitHub Gist, per-font and per-subtype descriptions and history with links, style-tag filters (narrow/condensed, handwritten, …), popularity removed, docs, a GitHub repo with Pages at cornishandy.github.io/mac-font-explorer, and the T3 project and thread rename. Rebuild with `python3 tools/build-data.py && python3 tools/build-standalone.py`, and verify in a browser before claiming done.
