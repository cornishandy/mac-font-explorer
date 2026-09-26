#!/usr/bin/env python3
"""Build the single-file page that works from a file:// URL and on GitHub Pages.

Writes two identical files in the project root:
  Mac Font Explorer.html   the descriptive name, for opening locally
  index.html               what GitHub Pages serves
Specimen images in specimens/ are loaded only for fonts missing on the viewing device.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = [ROOT / "Mac Font Explorer.html", ROOT / "index.html"]
html = (ROOT / "index.template.html").read_text()
css = (ROOT / "styles.css").read_text()

stylesheet = '<link rel="stylesheet" href="styles.css" />'
assert html.count(stylesheet) == 1
html = html.replace(stylesheet, f"<style>\n{css}\n</style>")

sources = ("fonts.js", "font-data.js", "app.js")
for filename in sources:
    external = f'<script defer src="{filename}"></script>'
    assert html.count(external) == 1
    html = html.replace(external, "")

scripts = []
for filename in sources:
    source = (ROOT / filename).read_text()
    source = source.replace("</script", "<\\/script")
    scripts.append(f"<script>\n/* {filename} */\n{source}\n</script>")

assert html.count("</body>") == 1
html = html.replace("</body>", "\n".join(scripts) + "\n  </body>")
for output in OUTPUTS:
    output.write_text(html)
print(f"Wrote {', '.join(o.name for o in OUTPUTS)} ({len(html):,} characters)")
