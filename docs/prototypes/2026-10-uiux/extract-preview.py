from html.parser import HTMLParser
from pathlib import Path
import sys

base = Path(__file__).resolve().parent
prefix = sys.argv[1] if len(sys.argv) > 1 else "tiemdigital-visual-directions"

class Preview(HTMLParser):
    inner = None
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "iframe" and "data-srcdoc" in values:
            self.inner = values["data-srcdoc"]

parser = Preview()
parser.feed((base / (prefix + ".preview.html")).read_text(encoding="utf-8"))
assert parser.inner, "Missing preview frame"
(base / (prefix + ".test.html")).write_text(
    parser.inner.replace("__CODEX_VISUALIZATION_WIDGET_STATE__", "{}"), encoding="utf-8"
)
print("Extracted sandbox document for local browser checks")
