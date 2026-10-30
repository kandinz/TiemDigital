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
  return (
    <>
    <div className="table-tools">
      <span className="muted">{allRows.length} dòng</span>
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
          const rows = Children.toArray(section.props.children).filter(isValidElement) as ReactElement<{ children?: ReactNode }>[];
          const visible = rows.filter((row) => (!query || contentOf(row.props.children).toLocaleLowerCase("vi").includes(query)) && (!filterValue || cellValue(row, filterColumn) === filterValue));
          if (sort) visible.sort((a, b) => sort.direction * compareValues(cellValue(a, sort.column), cellValue(b, sort.column)));
          return cloneElement(section, { children: visible.length ? visible : <tr><td colSpan={100} className="muted table-empty">{query ? "Không có kết quả phù hợp." : "Chưa có dữ liệu."}</td></tr> });
        }
        return section;
      })}
    </table>
    </>
  );
}
