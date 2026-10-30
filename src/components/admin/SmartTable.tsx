import { Children, cloneElement, isValidElement, useContext, useState, type ReactElement, type ReactNode } from "react";
import { TableSearchContext } from "./TableSearchContext";

function contentOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(contentOf).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return contentOf(node.props.children);
  return "";
}

function cellValue(row: ReactElement<{ children?: ReactNode }>, index: number) {
  const cells = Children.toArray(row.props.children);
  const cell = cells[index];
  return isValidElement<{ children?: ReactNode }>(cell) ? contentOf(cell.props.children).trim() : "";
}

function compareValues(left: string, right: string) {
  const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
  const aDate = left.match(datePattern);
  const bDate = right.match(datePattern);
  if (aDate && bDate) {
    const a = `${aDate[3]}${aDate[2].padStart(2, "0")}${aDate[1].padStart(2, "0")}`;
    const b = `${bDate[3]}${bDate[2].padStart(2, "0")}${bDate[1].padStart(2, "0")}`;
    return a.localeCompare(b);
  }
  const numeric = (value: string) => {
    const first = value.match(/^-?\d[\d.,]*(?=\s|$)/)?.[0];
    if (!first) return null;
    const normalized = first.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };
  const aNumber = numeric(left);
  const bNumber = numeric(right);
  if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  return left.localeCompare(right, "vi", { numeric: true, sensitivity: "base" });
}

export function SmartTable({ children }: { children: ReactNode }) {
  const query = useContext(TableSearchContext).trim().toLocaleLowerCase("vi");
  const [sort, setSort] = useState<{ column: number; direction: 1 | -1 } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState(0);
  const [filterValue, setFilterValue] = useState("");
  const sections = Children.toArray(children).filter(isValidElement) as ReactElement<{ children?: ReactNode }>[];
  const head = sections.find((section) => section.type === "thead");
  const headRow = Children.toArray(head?.props.children).find(isValidElement) as ReactElement<{ children?: ReactNode }> | undefined;
  const columns = Children.toArray(headRow?.props.children).map(contentOf);
  const body = sections.find((section) => section.type === "tbody");
  const allRows = Children.toArray(body?.props.children).filter(isValidElement) as ReactElement<{ children?: ReactNode }>[];
  const values = [...new Set(allRows.map((row) => cellValue(row, filterColumn)))].filter(Boolean).sort((a, b) => compareValues(a, b));
  const visibleRows = allRows.filter((row) => (!query || contentOf(row.props.children).toLocaleLowerCase("vi").includes(query)) && (!filterValue || cellValue(row, filterColumn) === filterValue));
  if (sort) visibleRows.sort((a, b) => sort.direction * compareValues(cellValue(a, sort.column), cellValue(b, sort.column)));
  const savedKey = `tiem:table:${window.location.pathname}:${columns.join("|")}`;
  const [notice, setNotice] = useState("");
  function saveFilter() {
    try { localStorage.setItem(savedKey, JSON.stringify({ filterColumn, filterValue, sort })); setNotice("Đã lưu lọc cột và sắp xếp trên thiết bị này; không lưu tìm kiếm của trang."); }
    catch { setNotice("Không lưu được thiết lập cột trên thiết bị này."); }
  }
  function restoreFilter() {
    try {
      const saved = JSON.parse(localStorage.getItem(savedKey) || "null");
      if (!saved) { setNotice("Chưa có thiết lập cột đã lưu."); return; }
      if (Number.isInteger(saved.filterColumn) && saved.filterColumn >= 0 && saved.filterColumn < columns.length && typeof saved.filterValue === "string") {
        setFilterColumn(saved.filterColumn); setFilterValue(saved.filterValue); setFiltersOpen(true);
        setSort(saved.sort && Number.isInteger(saved.sort.column) && saved.sort.column >= 0 && saved.sort.column < columns.length && [1, -1].includes(saved.sort.direction) ? saved.sort : null);
        setNotice("Đã áp dụng lọc cột và sắp xếp; giữ nguyên tìm kiếm của trang.");
      }
    } catch { setNotice("Không đọc được bộ lọc đã lưu."); }
  }
  function exportCsv() {
    const escape = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const rows = [columns, ...visibleRows.map((row) => columns.map((_, index) => cellValue(row, index)))];
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "tiemdigital.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
    <div className="table-tools">
      <span className="muted">{visibleRows.length}/{allRows.length} dòng</span>
      <button type="button" disabled={!visibleRows.length} onClick={exportCsv}>Xuất CSV</button>
      <button type="button" onClick={saveFilter}>Lưu thiết lập cột</button>
      <button type="button" onClick={restoreFilter}>Mở thiết lập cột</button>
      {(filterValue || sort) && <button type="button" onClick={() => { setFilterValue(""); setSort(null); }}>Đặt lại bảng</button>}
      {notice && <span role="status">{notice}</span>}
      <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>Lọc cột{filterValue ? " •" : ""}</button>
      {filtersOpen && <>
        <select aria-label="Chọn cột lọc" value={filterColumn} onChange={(event) => { setFilterColumn(Number(event.target.value)); setFilterValue(""); }}>{columns.map((column, index) => column && <option key={index} value={index}>{column}</option>)}</select>
        <select aria-label="Chọn giá trị lọc" value={filterValue} onChange={(event) => setFilterValue(event.target.value)}><option value="">Tất cả giá trị</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        {filterValue && <button type="button" onClick={() => setFilterValue("")}>Xóa lọc</button>}
      </>}
    </div>
    <table>
      {Children.map(children, (section) => {
        if (!isValidElement<{ children?: ReactNode }>(section)) return section;
        if (section.type === "thead") {
          return cloneElement(section, {
            children: Children.map(section.props.children, (row) => {
              if (!isValidElement<{ children?: ReactNode }>(row)) return row;
              return cloneElement(row, {
                children: Children.map(row.props.children, (cell, index) => {
                  if (!isValidElement<{ children?: ReactNode }>(cell) || !cell.props.children) return cell;
                  const active = sort?.column === index;
                  return cloneElement(cell, {
                    "aria-sort": active ? (sort.direction === 1 ? "ascending" : "descending") : "none",
                    children: <button type="button" className="table-sort" onClick={() => setSort(active ? { column: index, direction: sort.direction === 1 ? -1 : 1 } : { column: index, direction: 1 })}>{cell.props.children}<span aria-hidden="true">{active ? (sort.direction === 1 ? "↑" : "↓") : "↕"}</span></button>,
                  } as { children: ReactNode });
                }),
              });
            }),
          });
        }
        if (section.type === "tbody") {
          return cloneElement(section, { children: visibleRows.length ? visibleRows : <tr><td colSpan={100} className="muted table-empty">{query || filterValue ? "Không có kết quả phù hợp. Hãy xóa bộ lọc để xem lại dữ liệu." : "Chưa có dữ liệu."}</td></tr> });
        }
        return section;
      })}
    </table>
    </>
  );
}
