export type OrderStatus = "completed" | "processing" | "failed";

const COMPLETED = new Set(["completed", "complete", "invited", "paid", "success", "succeeded", "done", "delivered", "fulfilled"]);
const PROCESSING = new Set(["processing", "pending", "in_progress", "queued"]);
const FAILED = new Set(["failed", "error", "cancelled", "canceled", "refunded", "rejected"]);

// Empty means the vendor answered synchronously; anything unrecognized is treated as still processing.
export function normalizeStatus(raw?: string | null): OrderStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value || COMPLETED.has(value)) return "completed";
  if (FAILED.has(value)) return "failed";
  if (PROCESSING.has(value)) return "processing";
  return "processing";
}

const LIST_KEYS = [
  "deliveredKey",
  "deliveredKeys",
  "key",
  "keys",
  "deliveredAccount",
  "deliveredAccounts",
  "account",
  "accounts",
  "licenseKey",
  "license_key",
  "license",
  "deliveredFileRef",
  "deliveredFile",
  "code",
  "codes",
  "token",
  "tokens",
  "serial",
  "serials",
  "delivered_items",
  "delivered_data",
  "items",
  "products"
];

export function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJson(text: unknown): unknown {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toLines(value: unknown): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
}

// Vendors return delivered goods under many shapes; callers only ever see plain lines.
export function normalizeDeliveredItems(payload: unknown): string[] {
  if (payload == null) return [];
  if (typeof payload === "string") return [payload];
  if (Array.isArray(payload)) return toLines(payload);
  if (!isObject(payload)) return [String(payload)];

  const containers = [payload, payload.data, payload.order, payload.result].filter(isObject);
  for (const key of LIST_KEYS) {
    for (const container of containers) {
      if (container[key] != null) return toLines(container[key]);
    }
  }
  return typeof payload.data === "string" ? [payload.data] : [];
}

// Stored rows hold the new list when present, otherwise fallback to delivered_data or response_raw.
export function deliveredItemsOfRow(row: { delivered_items?: unknown; delivered_data?: unknown; response_raw?: unknown }): string[] {
  const stored = parseJson(row.delivered_items);
  if (Array.isArray(stored) && stored.length > 0) return stored as string[];
  const fromData = normalizeDeliveredItems(parseJson(row.delivered_data) ?? row.delivered_data);
  if (fromData.length > 0) return fromData;
  return normalizeDeliveredItems(parseJson(row.response_raw) ?? row.response_raw);
}

export interface BackfillRow {
  id: string;
  status?: string | null;
  delivered_data?: string | null;
  delivered_items?: string | null;
}

export interface BackfillChange {
  id: string;
  status: OrderStatus;
  delivered_items: string;
  statusChanged: boolean;
  itemsFilled: boolean;
}

// Only fills what is missing or non-normalized; never touches delivered_data or response_raw.
export function planBackfill(rows: BackfillRow[]): { changes: BackfillChange[]; undecodable: string[] } {
  const changes: BackfillChange[] = [];
  const undecodable: string[] = [];

  for (const row of rows) {
    const itemsFilled = row.delivered_items == null;
    const items = itemsFilled ? deliveredItemsOfRow(row) : (parseJson(row.delivered_items) as string[]);
    const status = normalizeStatus(row.status);
    const statusChanged = status !== row.status;

    if (itemsFilled && row.delivered_data && items.length === 0) undecodable.push(row.id);
    if (itemsFilled || statusChanged) {
      changes.push({ id: row.id, status, delivered_items: itemsFilled ? JSON.stringify(items) : String(row.delivered_items), statusChanged, itemsFilled });
    }
  }
  return { changes, undecodable };
}
