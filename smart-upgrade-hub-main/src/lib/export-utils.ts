// Lightweight, zero-dependency export helpers used by the staff directory and
// other report screens. Both formats download a single file the user can open
// in Excel/Numbers/Sheets without losing column types.

export type Column<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: Column<T>[]) {
  const header = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")).join("\n");
  // BOM so Excel detects UTF-8 correctly
  const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, ensureExt(filename, "csv"));
}

/**
 * Excel-compatible XML Spreadsheet (.xls). Opens natively in Excel/Numbers/
 * Sheets without needing a heavy xlsx dependency in the client bundle.
 */
export function downloadExcel<T>(filename: string, sheetName: string, rows: T[], columns: Column<T>[]) {
  const escape = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const headerCells = columns
    .map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escape(c.header)}</Data></Cell>`)
    .join("");
  const bodyRows = rows
    .map((r) => {
      const cells = columns
        .map((c) => {
          const raw = c.value(r);
          if (typeof raw === "number" && Number.isFinite(raw)) {
            return `<Cell><Data ss:Type="Number">${raw}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${escape(raw)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style></Styles>
 <Worksheet ss:Name="${escape(sheetName).slice(0, 30)}">
  <Table>
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  triggerDownload(blob, ensureExt(filename, "xls"));
}

function ensureExt(name: string, ext: string) {
  return name.toLowerCase().endsWith("." + ext) ? name : `${name}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Paginated supabase fetch — returns every row matching the query, in chunks
 * of `pageSize`. Use to export the full filtered set rather than only the
 * page the user is currently viewing.
 */
export async function fetchAllPages<T>(
  build: () => { range: (from: number, to: number) => Promise<{ data: T[] | null; error: any }> },
  pageSize = 1000,
  maxPages = 50
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const from = i * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await build().range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
