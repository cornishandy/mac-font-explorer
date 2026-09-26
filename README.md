# Mac Font Explorer

A gallery and data explorer for every font in the T3 Code / Codex font picker: the 183 font families installed on this Mac, plus SF Pro.

**Live site:** https://cornishandy.github.io/mac-font-explorer/
**Local file:** open `Mac Font Explorer.html` in Chrome. No server is needed, and you can leave the tab open indefinitely.

## What it does

- **Specimens** of every family in its own face, with a weight selector (100–900) and a starred-only **compare** view.
- **About & history** for every font: a summary, its history, designer, original design year, and 1–3 source links. Each card also links to its subtype in the Type guide.
- **Type guide**: 7 categories, 33 subtypes, and 18 style tags, each with a description, history, and links, plus a "Show fonts" filter button.
- **Filters**: typeface, subtype, **style tags** (Narrow / condensed, Handwritten, Calligraphic, Rounded, Heavy / black, Typewriter, Textured / chalk, Formal / elegant, and more, matching any or all), tier, English glyph coverage, monospace, installed on this device, year range and year source, cap height, sentence width, and an any-field rule builder.
- **Data table** sortable on every column. **PCA map** of measured geometry. **Visual explorer** with a configurable X, Y, color, and size scatter chart where every field is a dimension.
- **Saved views**, and **sync across computer and phone** through a private GitHub Gist (below).
- **Phone-friendly**: fonts the phone doesn't have are shown as a pre-rendered image of the Mac rendering instead of a misleading fallback font.

## Sync your stars and views between devices

1. On your computer, open the page, go to **Refine the collection → Sync across devices**, and click **Create a token with only the "gist" scope**. On GitHub, keep only `gist` checked, set an expiry you're comfortable with, and click Generate.
2. Paste the token and click **Connect**. The page creates a secret gist named `mac-font-explorer-sync.json` in your account, or finds the existing one, and merges in everything saved locally.
3. Click **Phone setup link**. That copies a link to the live site with the token in the `#fragment`. AirDrop or message it to yourself and open it on the phone once. The phone stores the token and removes it from the address bar.
4. From then on, stars, saved views, and the weight setting sync automatically: on load, a moment after each change, and when you switch back to the tab. Edits on two devices merge per item.

**Export backup / Import backup** saves and merges a JSON file if you'd rather not use GitHub. **Disconnect** forgets the token on that device. Revoke the token at <https://github.com/settings/tokens>.

## Project layout

| Path | What it is |
|---|---|
| `Mac Font Explorer.html`, `index.html` | **Built** single-file pages (identical). Don't edit these directly. |
| `index.template.html`, `styles.css`, `app.js`, `fonts.js` | Page source |
| `font-data.js` | Built dataset (`window.FONT_DATA`) |
| `specimens/` | 183 PNG specimens for devices that don't have a font |
| `data/metrics.json` | CoreText measurements (16 pt, regular face) |
| `data/wikidata-years-raw.json` | Wikidata typeface inception dates |
| `research/descriptions-*.json` | Per-font summary, history, classification, tags, and verified links |
| `research/taxonomy.json` | Category, subtype, and tag write-ups |
| `research/AGENT_BRIEF.md` | The research brief (taxonomy, tag list, sourcing rules) |
| `tools/` | Measurement, specimen, data, and page build scripts |
| `docs/DECISIONS.md` | Decisions and their rationale |
| `docs/SESSION_HANDOFF.md` | History, the old-thread diagnosis, and a resume prompt |

## Rebuild

```bash
cd ~/Documents/ChatGPT/mac-font-explorer
swift tools/generate-font-metrics.swift > data/metrics.json   # only if installed fonts changed
swift tools/render-specimens.swift                            # only if installed fonts changed
python3 tools/build-data.py                                   # research + metrics → font-data.js
python3 tools/build-standalone.py                             # → Mac Font Explorer.html and index.html
```

Publish with `git add -A && git commit -m "…" && git push`. GitHub Pages redeploys in about a minute.

## Status

- [x] Gallery, weights, stars, compare
- [x] Categories, subtypes, tiers, years, measurements, sort and filter everything
- [x] PCA map, visual explorer, saved views
- [x] Single-file page that works from `file://`
- [x] Popularity removed
- [x] Style-tag filter (narrow/condensed, handwritten, …)
- [x] Per-font and per-subtype descriptions, history, and links
- [x] Cross-device sync (GitHub Gist) with export and import fallback
- [x] Image specimens for devices without the font
- [x] Docs: README, decisions, handoff
- [x] GitHub repo and Pages: https://github.com/cornishandy/mac-font-explorer
- [ ] T3 Code project on this folder, with the thread renamed "Mac Font Explorer" (manual: see docs/SESSION_HANDOFF.md)
- [ ] First real sync: connect a gist token on the computer, then open the phone setup link. The merge logic is tested against a mocked GitHub API.
