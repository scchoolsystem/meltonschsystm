import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";

// Wave 2/3 -> Wave 4: Inventory module. RLS/grants on inventory_items,
// inventory_receipts, inventory_issues, inventory_suppliers already allow full
// CRUD for store_admin/store_user/bursar (see 20260614130000_wave3_db_hardening.sql).
// This page was a read-only stub; add-dialogs below catch the UI up to the DB.
export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

function useInv<T = any>(table: string, schoolId: string | undefined) {
  return useQuery({
    queryKey: ["inventory", table, schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

function InventoryPage() {
  const [tab, setTab] = useState("items");
  const { school } = useTenant();
  const schoolId = school?.id;
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("store_admin") || hasRole("store_user") || hasRole("bursar");

  const itemsQ = useInv<any>("inventory_items", schoolId);
  const suppliersQ = useInv<any>("inventory_suppliers", schoolId);
  const receiptsQ = useInv<any>("inventory_receipts", schoolId);
  const issuesQ = useInv<any>("inventory_issues", schoolId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted-foreground">Stock items, receipts, issues, and suppliers.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <InvList
            table="inventory_items" q={itemsQ}
            cols={["sku", "name", "unit", "current_qty", "reorder_level"]}
            action={canEdit && <ItemDialog schoolId={schoolId} />}
          />
        </TabsContent>

        <TabsContent value="receipts">
          <InvList
            table="inventory_receipts" q={receiptsQ}
            cols={["received_at", "item_id", "qty", "unit_cost"]}
            lookups={{ item_id: itemsQ.data }}
            action={canEdit && <ReceiptDialog schoolId={schoolId} items={itemsQ.data ?? []} suppliers={suppliersQ.data ?? []} />}
          />
        </TabsContent>

        <TabsContent value="issues">
          <InvList
            table="inventory_issues" q={issuesQ}
            cols={["issued_at", "item_id", "qty", "issued_to"]}
            lookups={{ item_id: itemsQ.data }}
            action={canEdit && <IssueDialog schoolId={schoolId} items={itemsQ.data ?? []} />}
          />
        </TabsContent>

        <TabsContent value="suppliers">
          <InvList
            table="inventory_suppliers" q={suppliersQ}
            cols={["name", "contact", "notes"]}
            action={canEdit && <SupplierDialog schoolId={schoolId} />}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvList({ table, q, cols, lookups, action }: { table: string; q: any; cols: string[]; lookups?: Record<string, any[] | undefined>; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between flex-row">
        <div className="flex items-center gap-2">
          <CardTitle className="capitalize">{table.replace("inventory_", "")}</CardTitle>
          {q.data && <Badge variant="secondary">{q.data.length} rows</Badge>}
        </div>
        {action}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid place-items-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No records yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>{cols.map((c) => <TableHead key={c} className="capitalize">{c.replace(/_/g, " ")}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((row: any) => (
                <TableRow key={row.id}>
                  {cols.map((c) => (
                    <TableCell key={c} className="text-sm">
                      {lookups?.[c] ? formatLookup(row[c], lookups[c]) : formatCell(row[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function formatCell(v: any): string {
  if (v == null) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}

function formatLookup(id: any, rows?: any[]): string {
  const found = rows?.find((r) => r.id === id);
  return found?.name ?? formatCell(id);
}

function useInvMutation(table: string, schoolId: string | undefined, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { error } = await supabase.from(table as any).insert({ ...payload, school_id: schoolId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", table, schoolId] });
      toast.success("Saved");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });
}

function ItemDialog({ schoolId }: { schoolId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", unit: "unit", current_qty: 0, reorder_level: 0 });
  const m = useInvMutation("inventory_items", schoolId, () => { setOpen(false); setForm({ sku: "", name: "", unit: "unit", current_qty: 0, reorder_level: 0 }); });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Item</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New inventory item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>Opening qty</Label><Input type="number" value={form.current_qty} onChange={(e) => setForm({ ...form, current_qty: Number(e.target.value) })} /></div>
            <div><Label>Reorder level</Label><Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!form.name || m.isPending} onClick={() => m.mutate(form)}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierDialog({ schoolId }: { schoolId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", notes: "" });
  const m = useInvMutation("inventory_suppliers", schoolId, () => { setOpen(false); setForm({ name: "", contact: "", notes: "" }); });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Supplier</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone or email" /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button disabled={!form.name || m.isPending} onClick={() => m.mutate(form)}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ schoolId, items, suppliers }: { schoolId: string | undefined; items: any[]; suppliers: any[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", supplier_id: "", qty: 1, unit_cost: 0 });
  const qc = useQueryClient();
  const { user } = useAuth();
  const m = useMutation({
    mutationFn: async () => {
      if (!form.item_id) throw new Error("Pick an item");
      const { error: insErr } = await supabase.from("inventory_receipts").insert({
        school_id: schoolId, item_id: form.item_id, supplier_id: form.supplier_id || null,
        qty: form.qty, unit_cost: form.unit_cost || null, received_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      // Bump stock on hand. Read-then-write is good enough for single-counter-clerk
      // usage; revisit with an RPC if concurrent receipts on the same item become common.
      const item = items.find((i) => i.id === form.item_id);
      const { error: updErr } = await supabase.from("inventory_items")
        .update({ current_qty: (item?.current_qty ?? 0) + form.qty }).eq("id", form.item_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_receipts", schoolId] });
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_items", schoolId] });
      toast.success("Receipt recorded");
      setOpen(false);
      setForm({ item_id: "", supplier_id: "", qty: 1, unit_cost: 0 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={!items.length}><Plus className="w-4 h-4 mr-1" />Receipt</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record a goods receipt</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Item</Label>
            <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Supplier (optional)</Label>
            <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Quantity</Label><Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} /></div>
            <div><Label>Unit cost</Label><Input type="number" min={0} value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!form.item_id || form.qty <= 0 || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Destinations that auto-route stock to their respective module
const ISSUE_DESTINATIONS = [
  { value: "clinic",     label: "🏥 Clinic",          hint: "Auto-adds to clinic inventory" },
  { value: "kitchen",    label: "🍽️ Kitchen",          hint: "Auto-adds to kitchen stock" },
  { value: "library",    label: "📚 Library",          hint: "General library supplies" },
  { value: "admin",      label: "🏢 Administration",   hint: "Admin office" },
  { value: "maintenance",label: "🔧 Maintenance",      hint: "Maintenance & repairs" },
  { value: "security",   label: "🔒 Security",         hint: "Security department" },
  { value: "transport",  label: "🚌 Transport",        hint: "Transport department" },
  { value: "boarding",   label: "🛏️ Boarding",         hint: "Boarding / dormitory" },
  { value: "class",      label: "🏫 Classroom",        hint: "Issued to a specific class" },
  { value: "staff",      label: "👤 Staff member",     hint: "Issued to individual staff" },
  { value: "other",      label: "📦 Other",            hint: "Other / specify in notes" },
];

function IssueDialog({ schoolId, items }: { schoolId: string | undefined; items: any[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", qty: 1, destination: "", person: "", notes: "" });
  const qc = useQueryClient();
  const { user } = useAuth();

  const selectedDest = ISSUE_DESTINATIONS.find(d => d.value === form.destination);

  // Build issued_to string: destination + optional person name
  const buildIssuedTo = () => {
    if (!form.destination) return null;
    if (form.person.trim()) return `${form.destination}:${form.person.trim()}`;
    return form.destination;
  };

  const m = useMutation({
    mutationFn: async () => {
      if (!form.item_id) throw new Error("Pick an item");
      if (!form.destination) throw new Error("Select a destination");
      const item = items.find((i) => i.id === form.item_id);
      const available = item?.current_qty ?? 0;
      if (form.qty > available) throw new Error(`Only ${available} ${item?.unit ?? "units"} in stock`);
      const { error: insErr } = await supabase.from("inventory_issues").insert({
        school_id: schoolId,
        item_id: form.item_id,
        qty: form.qty,
        issued_to: buildIssuedTo(),
        notes: form.notes || null,
        issued_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      // Note: trg_stock_issue trigger handles current_qty deduction automatically
      // but the frontend also updates optimistically for immediate UI refresh
      const { error: updErr } = await supabase.from("inventory_items")
        .update({ current_qty: available - form.qty }).eq("id", form.item_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_issues", schoolId] });
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_items", schoolId] });
      toast.success("Issue recorded");
      setOpen(false);
      setForm({ item_id: "", qty: 1, destination: "", person: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={!items.length}><Plus className="w-4 h-4 mr-1" />Issue</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Issue Stock</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Item</Label>
            <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} <span className="text-muted-foreground">({i.current_qty} {i.unit} in stock)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Destination</Label>
            <Select value={form.destination} onValueChange={(v) => setForm({ ...form, destination: v, person: "" })}>
              <SelectTrigger><SelectValue placeholder="Where is this going?" /></SelectTrigger>
              <SelectContent>
                {ISSUE_DESTINATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    <span>{d.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{d.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDest && (
              <p className="text-xs text-muted-foreground mt-1">{selectedDest.hint}</p>
            )}
          </div>
          {(form.destination === "class" || form.destination === "staff" || form.destination === "other") && (
            <div>
              <Label>{form.destination === "class" ? "Class name" : form.destination === "staff" ? "Staff name" : "Specify recipient"}</Label>
              <Input
                value={form.person}
                onChange={(e) => setForm({ ...form, person: e.target.value })}
                placeholder={form.destination === "class" ? "e.g. Form 3A" : form.destination === "staff" ? "e.g. John Kamau" : "Recipient name"}
              />
            </div>
          )}
          <div>
            <Label>Quantity</Label>
            <Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} />
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>
        </div>
        <DialogFooter>
          <Button disabled={!form.item_id || !form.destination || form.qty <= 0 || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
