import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { CalendarIcon, Download, Upload, Trash2, Users, Plus } from "lucide-react";
import { isReservedSystemTag } from "@/lib/reservedTags";
import { toValidE164 } from "@/lib/phone";

interface Props {
  campaignId: string;
  script: string;
}

interface Row {
  id: string;
  client_id: string;
  custom_data: Record<string, string>;
  status: string;
  client: {
    name: string;
    phone: string;
    policy_number: string | null;
    email?: string | null;
    product_type?: string | null;
    premium_amount?: number | null;
    premium_due_date?: string | null;
    payment_status?: string | null;
  } | null;
}

const DEFAULT_COLUMNS = ["client_name", "phone", "policy_number"];
// Rows sent per request to the import function (server caps at 500).
const IMPORT_CHUNK_SIZE = 250;


function extractTags(script: string): string[] {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) set.add(m[1]);
  return Array.from(set);
}

function parseCSV(text: string): string[][] {
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
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

export const CampaignClientsPanel = ({ campaignId, script }: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; inserted: number; updated: number; failed: number } | null>(null);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);


  // Manual add form
  const [manualOpen, setManualOpen] = useState(false);
  const [manualData, setManualData] = useState<Record<string, string>>({});
  // Product types come from the Setup page catalog so manual adds stay consistent
  const [productTypes, setProductTypes] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("product_types")
        .select("id,name")
        .eq("is_active", true)
        .order("name");
      setProductTypes((data as { id: string; name: string }[]) || []);
    })();
  }, []);

  const scriptTags = useMemo(() => extractTags(script).filter(t => !isReservedSystemTag(t) && !["policy_number"].includes(t)), [script]);
  const columns = useMemo(() => [...DEFAULT_COLUMNS, ...scriptTags], [scriptTags]);
  // Manual form always offers product type and due date, sourced from the catalog/standard fields
  const manualColumns = useMemo(() => {
    const extras: string[] = [];
    if (!columns.some(c => c === "product_type" || c === "policy_type")) extras.push("product_type");
    if (!columns.some(c => c === "premium_due_date" || c === "due_date")) extras.push("premium_due_date");
    return [...columns, ...extras];
  }, [columns]);

  const load = async () => {
    if (!campaignId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("campaign_clients")
      .select("id,client_id,custom_data,status,client:clients(name,phone,policy_number,email,product_type,premium_amount,premium_due_date,payment_status)")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campaignId]);

  const downloadTemplate = () => {
    const header = columns.join(",");
    const example = columns.map(c => {
      if (c === "client_name") return "Jane Doe";
      if (c === "phone") return "+233200000000";
      if (c === "policy_number") return "POL-12345";
      return `<${c}>`;
    }).join(",");
    const csv = `${header}\n${example}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-clients-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const STANDARD_CLIENT_FIELDS = [
    "client_name", "name", "full_name", "customer_name",
    "phone", "policy_number",
    "email",
    "product_type", "policy_type",
    "premium_amount", "premium", "cur_premium", "current_premium",
    "premium_due_date", "due_date",
    "payment_status",
  ];

  const parsePremium = (v: any): number | null => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    if (!s) return null;
    // Handle scientific notation, currency symbols, commas
    const n = Number(s.replace(/[^0-9.\-eE+]/g, ""));
    return isNaN(n) ? null : n;
  };

  const clean = (v: any): string => {
    const s = (v ?? "").toString().trim();
    if (/^<[^>]+>$/.test(s)) return "";
    return s;
  };

  // Excel mangles long phone numbers into scientific notation like "2.33246E+11".
  // Re-expand to a digit string and preserve a leading + if present.
  const normalizePhone = (s: string): string => {
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
  };

  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  };

  const normalizeDate = (s: string): string | null => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // "Apr-26" or "Apr 2026" or "April-2026" → first of month
    const monMatch = s.match(/^([A-Za-z]{3,9})[\-\s\/](\d{2,4})$/);
    if (monMatch) {
      const mon = MONTHS[monMatch[1].toLowerCase().slice(0, monMatch[1].length === 4 && monMatch[1].toLowerCase() === "sept" ? 4 : 3)];
      if (mon) {
        let y = monMatch[2];
        if (y.length === 2) y = "20" + y;
        return `${y}-${mon}-01`;
      }
    }
    // "26-Apr" or "26 Apr 2026"
    const dayMon = s.match(/^(\d{1,2})[\-\s\/]([A-Za-z]{3,9})(?:[\-\s\/](\d{2,4}))?$/);
    if (dayMon) {
      const mon = MONTHS[dayMon[2].toLowerCase().slice(0, 3)];
      if (mon) {
        let y = dayMon[3] || String(new Date().getFullYear());
        if (y.length === 2) y = "20" + y;
        return `${y}-${mon}-${dayMon[1].padStart(2, "0")}`;
      }
    }
    // Numeric dd/mm/yyyy or mm/dd/yyyy (assume dd/mm if first > 12)
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
      // Use local date parts so the day never shifts due to timezone offset
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return null;
  };

  const upsertRow = async (record: Record<string, string>) => {
    const name = clean(record.client_name || record.name || record.full_name || record.customer_name);
    const rawPhone = normalizePhone(clean(record.phone));
    const policy = clean(record.policy_number) || null;
    if (!name || !rawPhone) throw new Error("client_name and phone are required");
    const phone = toValidE164(rawPhone);
    if (!phone) {
      throw new Error(`Invalid phone number "${rawPhone}". Use a valid local (0246052499) or international (+233246052499) number.`);
    }

    const email = clean(record.email) || null;
    // Accept either product_type or policy_type as the product/policy descriptor
    const productType = clean(record.product_type || record.policy_type) || null;
    const premium = parsePremium(clean(record.premium_amount ?? record.premium ?? record.cur_premium ?? record.current_premium));
    const dueDate = normalizeDate(clean(record.premium_due_date || record.due_date));
    const paymentStatus = clean(record.payment_status) || null;

    const clientPayload: Record<string, any> = { name, phone };
    if (policy) clientPayload.policy_number = policy;
    if (email) clientPayload.email = email;
    if (productType) clientPayload.product_type = productType;
    if (premium !== null) clientPayload.premium_amount = premium;
    if (dueDate) clientPayload.premium_due_date = dueDate;
    if (paymentStatus) clientPayload.payment_status = paymentStatus;

    // Find client by policy_number or phone, else create
    let clientId: string | null = null;
    if (policy) {
      const { data: existing } = await supabase.from("clients").select("id").eq("policy_number", policy).maybeSingle();
      if (existing) clientId = (existing as any).id;
    }
    if (!clientId) {
      const { data: byPhone } = await supabase.from("clients").select("id").eq("phone", phone).limit(1).maybeSingle();
      if (byPhone) clientId = (byPhone as any).id;
    }
    if (!clientId) {
      const insertPayload: Record<string, any> = { ...clientPayload };
      if (insertPayload.premium_amount === undefined) insertPayload.premium_amount = 0;
      const { data: inserted, error } = await (supabase as any)
        .from("clients")
        .insert([insertPayload])
        .select("id")
        .single();
      if (error) throw error;
      clientId = inserted.id;
    } else {
      await supabase.from("clients").update(clientPayload).eq("id", clientId);
    }

    // Custom tag data — exclude anything synced into the clients table
    const custom: Record<string, string> = {};
    for (const k of Object.keys(record)) {
      if (STANDARD_CLIENT_FIELDS.includes(k)) continue;
      if (record[k] != null && String(record[k]).trim() !== "") custom[k] = String(record[k]).trim();
    }

    const { error: linkErr } = await (supabase as any)
      .from("campaign_clients")
      .upsert(
        { campaign_id: campaignId, client_id: clientId, custom_data: custom },
        { onConflict: "campaign_id,client_id" }
      );
    if (linkErr) throw linkErr;
  };

  // Build the normalized payload the import function expects, without touching the DB.
  const prepareRow = (record: Record<string, string>, rowNumber: number) => {
    const name = clean(record.client_name || record.name || record.full_name || record.customer_name);
    const rawPhone = normalizePhone(clean(record.phone));
    if (!name || !rawPhone) throw new Error("client_name and phone are required");
    const phone = toValidE164(rawPhone);
    if (!phone) {
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
      phone,
      policy_number: clean(record.policy_number) || null,
      email: clean(record.email) || null,
      product_type: clean(record.product_type || record.policy_type) || null,
      premium_amount: parsePremium(clean(record.premium_amount ?? record.premium ?? record.cur_premium ?? record.current_premium)),
      premium_due_date: normalizeDate(clean(record.premium_due_date || record.due_date)),
      payment_status: ["current", "overdue", "failed"].includes(paymentStatus) ? paymentStatus : null,
      custom_data: custom,
    };
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    cancelRef.current = false;
    setImportErrors([]);
    setProgress(null);
    try {
      let text = await file.text();
      // Strip UTF-8 BOM if present (Excel exports often include it)
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      // Auto-detect delimiter: some locales (and Excel) save with semicolons or tabs
      const firstLine = text.split(/\r?\n/)[0] || "";
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      let delim = ",";
      if (semiCount > commaCount && semiCount >= tabCount) delim = ";";
      else if (tabCount > commaCount) delim = "\t";
      if (delim !== ",") {
        // Normalize to comma for parseCSV (only outside quotes)
        let out = ""; let inQ = false;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === '"') { inQ = !inQ; out += ch; }
          else if (ch === delim && !inQ) out += ",";
          else out += ch;
        }
        text = out;
      }
      const grid = parseCSV(text);
      if (grid.length < 2) throw new Error("CSV is empty or has only a header row");
      const header = grid[0].map(h => h.trim().toLowerCase());
      const required = ["client_name", "name", "full_name", "customer_name"];
      if (!header.some(h => required.includes(h)) || !header.includes("phone")) {
        throw new Error(`Header must include 'client_name' and 'phone'. Found: ${header.join(", ")}`);
      }

      // Normalize every data row first so we can report bad rows without a round trip.
      const prepared: ReturnType<typeof prepareRow>[] = [];
      const errors: { row: number; message: string }[] = [];
      for (let i = 1; i < grid.length; i++) {
        const record: Record<string, string> = {};
        header.forEach((h, idx) => { record[h] = (grid[i][idx] ?? "").trim(); });
        try { prepared.push(prepareRow(record, i + 1)); }
        catch (e: any) { errors.push({ row: i + 1, message: e.message || String(e) }); }
      }

      const total = prepared.length + errors.length;
      let done = errors.length;
      let inserted = 0, updated = 0;
      setProgress({ done, total, inserted, updated, failed: errors.length });

      // Send bounded chunks so any file size works and progress stays live.
      for (let i = 0; i < prepared.length; i += IMPORT_CHUNK_SIZE) {
        if (cancelRef.current) break;
        const chunk = prepared.slice(i, i + IMPORT_CHUNK_SIZE);
        const { data, error } = await supabase.functions.invoke("campaign-import-clients", {
          body: { campaign_id: campaignId, rows: chunk },
        });
        if (error) {
          errors.push({ row: chunk[0].row_number, message: `Chunk failed: ${error.message}` });
        } else {
          inserted += data?.inserted ?? 0;
          updated += data?.updated ?? 0;
          for (const e of (data?.errors ?? [])) errors.push(e);
        }
        done += chunk.length;
        setProgress({ done, total, inserted, updated, failed: errors.length });
      }

      setImportErrors(errors);
      const okCount = inserted + updated;
      toast({
        title: cancelRef.current ? "Import cancelled" : okCount ? "Import complete" : "Import failed",
        description: errors.length
          ? `${okCount} added/updated, ${errors.length} failed. First error — row ${errors[0].row}: ${errors[0].message}`
          : `${okCount} added/updated (${inserted} new, ${updated} existing)`,
        variant: errors.length && !okCount ? "destructive" : "default",
      });
      load();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadErrorReport = () => {
    const csv = ["row,error", ...importErrors.map(e => `${e.row},"${String(e.message).replace(/"/g, '""')}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };


  const addManual = async () => {
    try {
      await upsertRow(manualData);
      toast({ title: "Client added" });
      setManualData({});
      setManualOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const removeRow = async (id: string, clientId: string) => {
    const alsoDelete = confirm(
      "Remove this client from the campaign?\n\nClick OK to also permanently delete the client from Client Management (only if they aren't linked to any other campaign).\nClick Cancel to abort."
    );
    if (!alsoDelete) return;
    const { error: delErr } = await (supabase as any).from("campaign_clients").delete().eq("id", id);
    if (delErr) { toast({ title: "Failed", description: delErr.message, variant: "destructive" }); return; }
    // If the client has no other campaign assignments, delete from central clients table too
    const { count } = await (supabase as any)
      .from("campaign_clients")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if ((count ?? 0) === 0) {
      const { error: cErr } = await (supabase as any).from("clients").delete().eq("id", clientId);
      if (cErr) console.warn("client delete failed:", cErr.message);
    }
    toast({ title: "Removed", description: "Client removed from campaign and synced." });
    load();
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Campaign Clients</h3>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-3 w-3 mr-1" /> Template CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gradient-primary">
            <Upload className="h-3 w-3 mr-1" /> {uploading ? "Uploading..." : "Upload CSV"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setManualOpen(v => !v)}>
            <Plus className="h-3 w-3 mr-1" /> Add One
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Template auto-includes <code>client_name</code>, <code>phone</code>, <code>policy_number</code> plus every <code>{"{{tag}}"}</code> in your script (excluding the system-handled <code>{"{{client_name}}"}</code>). Re-uploading the same client (by policy number or phone) updates their data.
      </p>

      {manualOpen && (
        <Card className="border-primary/40">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {manualColumns.map((col) => (
                <div key={col} className="grid gap-1">
                  <Label className="text-xs font-mono">{col}{(col === "client_name" || col === "phone") && " *"}</Label>
                  {col === "product_type" || col === "policy_type" ? (
                    <Select
                      value={manualData[col] || ""}
                      onValueChange={(v) => setManualData({ ...manualData, [col]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={productTypes.length ? "Select product type" : "No product types in catalog"} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {productTypes.map((pt) => (
                          <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : col === "premium_due_date" || col === "due_date" ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", !manualData[col] && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {manualData[col] ? format(parseISO(manualData[col]), "PPP") : <span>Pick a due date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={manualData[col] ? parseISO(manualData[col]) : undefined}
                          onSelect={(d) => setManualData({ ...manualData, [col]: d ? format(d, "yyyy-MM-dd") : "" })}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Input
                      value={manualData[col] || ""}
                      onChange={(e) => setManualData({ ...manualData, [col]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setManualOpen(false); setManualData({}); }}>Cancel</Button>
              <Button size="sm" onClick={addManual}>Add Client</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border overflow-x-auto w-full max-w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Policy</TableHead>
              {scriptTags.map(t => <TableHead key={t} className="font-mono text-xs">{t}</TableHead>)}
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5 + scriptTags.length} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5 + scriptTags.length} className="text-center text-muted-foreground py-6">
                No clients assigned yet. Download the template, fill it in, and upload.
              </TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.client?.name || "—"}</TableCell>
                <TableCell>{r.client?.phone || "—"}</TableCell>
                <TableCell>{r.client?.policy_number || "—"}</TableCell>
                {scriptTags.map(t => {
                  const fromCustom = r.custom_data?.[t];
                  let fromClient: any = null;
                  if (!fromCustom && r.client) {
                    if (t === "due_date" || t === "premium_due_date") fromClient = r.client.premium_due_date;
                    else if (t === "premium_amount" || t === "premium" || t === "cur_premium" || t === "current_premium") {
                      fromClient = r.client.premium_amount != null ? r.client.premium_amount : null;
                    }
                    else if (t === "policy_type" || t === "product_type") fromClient = r.client.product_type;
                    else if (t === "email") fromClient = r.client.email;
                    else if (t === "payment_status") fromClient = r.client.payment_status;
                  }
                  let val = fromCustom || (fromClient != null && fromClient !== "" ? String(fromClient) : "");
                  // Format due_date as Month-Year, e.g. "April-2026"
                  if ((t === "due_date" || t === "premium_due_date") && val) {
                    // Parse as a plain calendar date (no timezone shift)
                    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(val);
                    const d = ymd
                      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
                      : new Date(val);
                    if (!isNaN(d.getTime())) {
                      val = d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).replace(" ", "-");
                    }
                  }
                  return (
                    <TableCell key={t} className="text-xs">{val || <span className="text-muted-foreground italic">—</span>}</TableCell>
                  );
                })}
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => removeRow(r.id, r.client_id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CampaignClientsPanel;
