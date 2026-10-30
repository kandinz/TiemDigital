import { useRef, useState, type ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https:\/\/[^\s)]+\)|https:\/\/[^\s]+)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    if (part.startsWith("https://")) return <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    return part;
  });
}

export function ProductDescription({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return <div className="product-description formatted-description">{blocks.map((block, index) => {
    if (block.startsWith("## ")) return <h3 key={index}>{inline(block.slice(3))}</h3>;
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*] /.test(line))) return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{inline(line.slice(2))}</li>)}</ul>;
    return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</span>)}</p>;
  })}</div>;
}

export function ProductDescriptionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  function insert(before: string, after = "", fallback = "nội dung") {
    const element = input.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }
  return <div className="description-editor">
    <div className="description-toolbar" role="toolbar" aria-label="Định dạng mô tả">
      <button type="button" onClick={() => insert("## ", "", "Tiêu đề")}>Tiêu đề</button>
      <button type="button" onClick={() => insert("**", "**")}>Đậm</button>
      <button type="button" onClick={() => insert("*", "*")}>Nghiêng</button>
      <button type="button" onClick={() => insert("- ", "", "Mục nổi bật")}>Danh sách</button>
      <button type="button" onClick={() => insert("[", "](https://example.com)", "Liên kết")}>Liên kết</button>
      <button type="button" className={preview ? "primary" : ""} onClick={() => setPreview(!preview)}>{preview ? "Chỉnh sửa" : "Xem trước"}</button>
    </div>
    {preview ? <ProductDescription text={value} /> : <textarea ref={input} aria-label="Mô tả sản phẩm" maxLength={10000} rows={10} value={value} onChange={(event) => onChange(event.target.value)} />}
  </div>;
}
