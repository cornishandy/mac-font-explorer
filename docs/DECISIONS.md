# Decisions

Newest first. Each entry records what was decided, why, and what was ruled out.

## 2026-09-26: continuation session (Claude Code)

**Project moved to `~/Documents/ChatGPT/mac-font-explorer`.** This follows the convention of `ai-model-frontier` and `tidal-miniplayer-extension`: a kebab-case folder, a public GitHub repo, and GitHub Pages. The old `T3 Code/t3-nightly-toy/font-gallery` folder stays untouched because a Chrome tab points at it.

**Renamed from "Font Field" to "Mac Font Explorer".** The user asked for descriptive names. Local file: `Mac Font Explorer.html`. Pages serves `index.html`. Both are identical single-file builds.

**Popularity removed.** The only proxy covering system fonts was a 2014 CSS crawl, which the user judged too old. The `popularityRank`, `webSiteCount`, and `webSharePercent` fields, the Web-rank filter, and `web-popularity-2014.csv` are gone.

**Cross-device sync uses a private GitHub Gist.**
- Why: the user already publishes to GitHub, and a gist needs no server, database, or new account. The GitHub API allows CORS from any origin, including `file://`, so the local file and the Pages site both sync.
- How: one document `{version: 3, stars, views, weight}` holds every entry with a timestamp, and deletions are kept as tombstones. Merges are last-write-wins per star and per view, so two devices editing different things never clobber each other. Sync runs on load, 1.2 s after any change, on window focus or visibility, and every 2 minutes while visible. The gist is found by filename (`mac-font-explorer-sync.json`) or created as secret.
- Token: a classic token with **only** the `gist` scope, pasted once per browser and stored in localStorage. "Phone setup link" puts the token in the URL **fragment** (`#sync=…`), which browsers never send to a server. The page reads the fragment once and strips it from the address bar and history.
- Known trade-off: every page on `cornishandy.github.io` shares one origin, so any of the user's own Pages sites could read the token. It's scoped to gists only. Revoke it at github.com/settings/tokens if needed.
- Ruled out: Firebase or Supabase (needs a new account and config), iCloud (no web write API), and URL-only state sharing (not persistent). Export and import of a JSON backup is kept as a manual fallback.
- Migration: the first run reads the original Font Field localStorage keys, so stars and views from the old tab carry over when the new file is opened in the same Chrome. Chrome shares one origin across all `file://` pages.

**Phones get image specimens.** iOS and other computers lack many Mac fonts, and their browsers silently fall back to another font. The page detects installed fonts with a canvas-width test against three generic families. For missing fonts it shows a pre-rendered PNG of the Mac rendering (`tools/render-specimens.swift`, 183 images, about 4.6 MB). Images load lazily, only for missing fonts. On a Mac, fonts with no Latin glyphs count as installed because a Latin probe can't detect them.

**New taxonomy, researched per font.** There are 7 categories and 33 subtypes. They loosely follow Vox-ATypI, simplified for readability (for example, "Serif / Didone / modern"). Every family has a researched summary, history, designer, original design year, and 1–3 source links. The links were checked for HTTP 200 at research time. Research lives in `research/descriptions-*.json` and the category, subtype, and tag write-ups in `research/taxonomy.json`. The old regex classifier remains only as a fallback, and its bugs are fixed: InaiMathi is a Tamil font, not a math symbol font.

**Style tags as a separate, multi-select filter.** Tags like "Narrow / condensed", "Handwritten", "Rounded", "Heavy / black", "Typewriter", "Textured / chalk", and "Formal / elegant" cut across categories. For example, DIN Condensed is both Industrial and Narrow. The filter matches any or all of the selected tags. Researched tags are merged with measured ones. "Narrow / condensed" is added automatically when relative width (sentence width ÷ cap height) is below 23.5 for serif, sans, or display faces. Arial measures 28.0, Arial Narrow 22.8, and DIN Condensed 19.6.

**Year precedence.** Researched original design year comes first, then the Wikidata inception date, then the earliest year in the font file's copyright notice, which is labeled as such.

**Type guide tab.** It holds category, subtype, and tag descriptions with history and links, plus a "Show fonts" filter button. Each card's subtype label and "Read about this subtype" button jump to the guide.

## 2026-09-24: original Codex thread

- The font list is the T3 Code font picker: macOS installed families plus "SF Pro", 183 in total.
- English samples are shown for all 183 families. Families without full A–Z coverage are labeled "fallback likely" and excluded from the metrics and PCA.
- Measurements come from CoreText at 16 pt in the regular face. PCA runs on 8 standardized metrics across Latin-oriented families.
- Tier shows family breadth (S = 8+ faces, A = 4–7, B = 2–3, C = 1). It is not a quality score.
- The page is one self-contained HTML file that works from `file://` without a server.
