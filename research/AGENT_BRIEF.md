# Research brief: per-font descriptions and history

Project: a gallery and data explorer of the 183 font families installed on a Mac (the T3 Code font picker list). Each font needs a short, accurate description, some history, a classification, style tags, and links for further reading.

Input metadata for every family (designer and copyright strings read from the installed font files) is in `research/families-input.json`. Your batch of family names is in `research/batches.json`.

## Rules

- **Accuracy over coverage.** Only state facts you've verified from a source, such as Wikipedia (REST: `https://en.wikipedia.org/api/rest_v1/page/summary/<Title>`, search: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=<q>&format=json`), a foundry page (Monotype, Linotype, MyFonts, Adobe Fonts, ParaType, Google Fonts/Noto, Apple), Fonts In Use, Typewolf, and similar. Send a User-Agent header with curl (`-A "MacFontExplorer/1.0 research"`). If you can't verify something, say less. Never invent designers or dates.
- **Every link must be verified.** Run `curl -sL -o /dev/null -w '%{http_code}' -A "Mozilla/5.0" <url>` and include the link only if it returns 200 (a 403 from a bot-blocking site that obviously exists, like MyFonts, is acceptable if you've confirmed the exact URL through a search result). Prefer 1–3 links per font: Wikipedia first when an article exists, then the foundry or specimen page. For Apple-exclusive fonts with no article, an Apple Developer or Apple Support page, or a Fonts In Use or MyFonts page, is fine.
- Plain, friendly English. `summary` is 1–2 sentences on what it is, what it looks like, and what it's good for. `history` is 1–4 sentences covering who designed it, when, for whom, what it was based on, and when or why Apple ships it. World-script fonts can be shorter, but name the script and languages.
- `originalDesignYear` is the year the typeface design was first released (not the digital or Apple revision). Use `null` if you can't verify it.
- Pick `category` and `subtype` **only** from the taxonomy below. Pick 0–4 `tags` **only** from the tag list.

## Taxonomy

- **Serif:** Old-style · Transitional · Didone / modern · Slab serif · Glyphic / incised · Contemporary text serif
- **Sans serif:** Grotesque / neo-grotesque · Humanist · Geometric · Industrial / DIN
- **Monospace:** Coding monospace · Typewriter
- **Script & handwriting:** Formal / calligraphic · Casual handwriting · Brush / marker
- **Display & decorative:** Engraved / titling · Historical / antique · Textured / novelty
- **Symbols & pictographs:** Dingbats / pictographs · Math & technical · Emoji · Braille
- **World script:** Arabic · Hebrew · Indic · Chinese · Japanese · Korean · Southeast Asian · Tibetan · Ethiopic · Armenian · Other world script

## Tags (cross-cutting style filters)

`Narrow / condensed`, `Wide / extended`, `Handwritten`, `Calligraphic`, `Brush / marker`, `Rounded`, `Heavy / black`, `Typewriter`, `Caps / small caps`, `Engraved / inline`, `Textured / chalk`, `Historical / antique`, `Screen / UI`, `Web-safe classic`, `Pan-Unicode / multi-script`, `Signage / industrial`, `Formal / elegant`, `Playful / casual`

(Tags describe the family's look or purpose. For example, Chalkboard gets `Handwritten`, `Playful / casual`; Arial Narrow gets `Narrow / condensed`, `Web-safe classic`; Noteworthy gets `Handwritten`, `Playful / casual`.)

## Output

Write a JSON array to `research/descriptions-<BATCH>.json`, with one object per family in your batch, in batch order:

```json
{
  "family": "Chalkboard",
  "summary": "…",
  "history": "…",
  "designers": "…",
  "originalDesignYear": 2003,
  "category": "Script & handwriting",
  "subtype": "Casual handwriting",
  "tags": ["Handwritten", "Playful / casual"],
  "links": [{"label": "Wikipedia", "url": "https://…"}, {"label": "Fonts In Use", "url": "https://…"}]
}
```

Validate that the file parses (`python3 -m json.tool`) and contains every family in your batch. Then report back briefly: the count, how many have Wikipedia links, and any fonts where you were unsure.
