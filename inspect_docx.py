from pathlib import Path
from zipfile import ZipFile
import sys

from docx import Document
from docx.document import Document as _Document
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_blocks(parent):
    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    else:
        parent_elm = parent._tc
    for child in parent_elm.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, parent)
        elif child.tag.endswith("}tbl"):
            yield Table(child, parent)


path = Path(sys.argv[1])
doc = Document(path)

print(f"FILE: {path}")
print(f"SECTIONS: {len(doc.sections)}")

for i, block in enumerate(iter_blocks(doc)):
    if isinstance(block, Paragraph):
        text = block.text.replace("\n", "\\n")
        print(f"P{i:04d} [{block.style.name!r}] {text}")
    else:
        print(f"T{i:04d} rows={len(block.rows)} cols={len(block.columns)}")
        for r_idx, row in enumerate(block.rows):
            cells = []
            for cell in row.cells:
                cell_text = " / ".join(p.text for p in cell.paragraphs).replace("\n", "\\n")
                cells.append(cell_text)
            print(f"  R{r_idx:03d}: " + " || ".join(cells))

for s_idx, section in enumerate(doc.sections):
    print(f"HEADER {s_idx}: " + " | ".join(p.text for p in section.header.paragraphs))
    print(f"FOOTER {s_idx}: " + " | ".join(p.text for p in section.footer.paragraphs))

with ZipFile(path) as zf:
    names = set(zf.namelist())
    print("HAS_COMMENTS:", "word/comments.xml" in names)
    print("HAS_FOOTNOTES:", "word/footnotes.xml" in names)
    print("HAS_ENDNOTES:", "word/endnotes.xml" in names)
    doc_xml = zf.read("word/document.xml")
    print("HAS_TRACKED_INSERTIONS:", b"<w:ins" in doc_xml)
    print("HAS_TRACKED_DELETIONS:", b"<w:del" in doc_xml)
