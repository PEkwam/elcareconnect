// Shared client CSV import helpers used by CampaignClientsPanel and ClientsTab.

export const STANDARD_CLIENT_FIELDS = [
  "client_name", "name", "full_name", "customer_name",
  "phone", "policy_number",
  "email",
  "product_type", "policy_type",
  "premium_amount", "premium", "cur_premium", "current_premium",
  "premium_due_date", "due_date",
  "payment_status",
];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field.length || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function normalizePhone(s: string): string {
  if (!s) return s;
  const hasPlus = s.startsWith("+");
  const raw = s.replace(/[\s\-()]/g, "");
  if (/e\+?\d+/i.test(raw)) {
    const n = Number(raw);
    if (!isNaN(n)) {
      const expanded = n.toLocaleString("fullwide", { useGrouping: false, maximumFractionDigits: 0 });
      return (hasPlus ? "+" : "") + expanded;
    }
  }
  return s;
}

export function parsePremium(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-eE+]/g, ""));
  return isNaN(n) ? null : n;
}

export function clean(v: unknown): string {
  const s = (v ?? "").toString().trim();
  if (/^<[^>]+>$/.test(s)) return "";
  return s;
}

export function normalizeDate(s: string): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const monMatch = s.match(/^([A-Za-z]{3,9})[\-\s\/](\d{2,4})$/);
  if (monMatch) {
    const key = monMatch[1].toLowerCase();
    const mon = MONTHS[key.slice(0, key.length === 4 && key === "sept" ? 4 : 3)];
    if (mon) {
      let y = monMatch[2];
      if (y.length === 2) y = "20" + y;
      return `${y}-${mon}-01`;
    }
  }
  const dayMon = s.match(/^(\d{1,2})[\-\s\/]([A-Za-z]{3,9})(?:[\-\s\/](\d{2,4}))?$/);
  if (dayMon) {
    const mon = MONTHS[dayMon[2].toLowerCase().slice(0, 3)];
    if (mon) {
      let y = dayMon[3] || String(new Date().getFullYear());
      if (y.length === 2) y = "20" + y;
      return `${y}-${mon}-${dayMon[1].padStart(2, "0")}`;
    }
  }
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, a, b, y] = m;
    let day: string, mon: string;
    if (parseInt(a) > 12) { day = a.padStart(2, "0"); mon = b.padStart(2, "0"); }
    else { mon = a.padStart(2, "0"); day = b.padStart(2, "0"); }
    if (y.length === 2) y = "20" + y;
    return `${y}-${mon}-${day}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

export interface PreparedClientRow {
  row_number: number;
  name: string;
  phone: string;
  policy_number: string | null;
  email: string | null;
  product_type: string | null;
  premium_amount: number | null;
  premium_due_date: string | null;
  payment_status: "current" | "overdue" | "failed" | null;
  custom_data: Record<string, string>;
}

export function prepareClientRow(record: Record<string, string>, rowNumber: number): PreparedClientRow {
  const name = clean(record.client_name || record.name || record.full_name || record.customer_name);
  const rawPhone = normalizePhone(clean(record.phone));
  if (!name || !rawPhone) throw new Error("client_name and phone are required");
  if (!/^\+?\d+$/.test(rawPhone.replace(/\s/g, ""))) {
    throw new Error(`Invalid phone number "${rawPhone}". Use a valid local (0246052499) or international (+233246052499) number.`);
  }
  const paymentStatus = clean(record.payment_status).toLowerCase();
  const custom: Record<string, string> = {};
  for (const k of Object.keys(record)) {
    if (STANDARD_CLIENT_FIELDS.includes(k)) continue;
    if (record[k] != null && String(record[k]).trim() !== "") custom[k] = String(record[k]).trim();
  }
  return {
    row_number: rowNumber,
    name,
    phone: rawPhone,
    policy_number: clean(record.policy_number) || null,
    email: clean(record.email) || null,
    product_type: clean(record.product_type || record.policy_type) || null,
    premium_amount: parsePremium(clean(record.premium_amount ?? record.premium ?? record.cur_premium ?? record.current_premium)),
    premium_due_date: normalizeDate(clean(record.premium_due_date || record.due_date)),
    payment_status: ["current", "overdue", "failed"].includes(paymentStatus) ? (paymentStatus as any) : null,
    custom_data: custom,
  };
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (semiCount > commaCount && semiCount >= tabCount) return ";";
  if (tabCount > commaCount) return "\t";
  return ",";
}

export function normalizeDelimiter(text: string, delim: string): string {
  if (delim === ",") return text;
  let out = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQ = !inQ; out += ch; }
    else if (ch === delim && !inQ) out += ",";
    else out += ch;
  }
  return out;
}

export function extractScriptTags(script: string): string[] {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) set.add(m[1]);
  return Array.from(set);
}

export function downloadClientTemplate(scriptTags: string[] = [], filename = "care-connect-clients-template.csv") {
  const detailColumns = [
    "client_name",
    "phone",
    "policy_number",
    "email",
    "product_type",
    "premium_amount",
    "premium_due_date",
    "payment_status",
  ];
  const tagColumns = scriptTags.filter((t) => !detailColumns.includes(t));
  const header = [...detailColumns, ...tagColumns].join(",");

  const example1 = [
    "Jane Doe",
    "+233200000000",
    "POL-12345",
    "jane.doe@example.com",
    "Life Insurance",
    "500",
    "2026-12-31",
    "current",
    ...tagColumns.map(() => "<value>"),
  ].join(",");

  const example2 = [
    "John Smith",
    "+233240000001",
    "POL-67890",
    "john.smith@example.com",
    "Health Insurance",
    "1200",
    "2026-06-15",
    "overdue",
    ...tagColumns.map(() => ""),
  ].join(",");

  const note = [
    "Care Connect - Client Upload Template",
    "Required: client_name and phone",
    "Phone: local (0240000000) or international (+233240000000)",
    "Date format: yyyy-MM-dd (e.g. 2026-12-31)",
    "payment_status: current | overdue | failed (leave blank if unknown)",
  ].join("\n# ");

  const csv = `# ${note}\n${header}\n${example1}\n${example2}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
