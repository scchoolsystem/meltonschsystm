import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
import { Loader2, Plus, Package, AlertTriangle, Search, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";

// ─── SQL to run once in Supabase SQL editor (not a migration file) ──────────
// ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';
// ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS description text;
// ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS location text;
// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

// ─── Item categories ─────────────────────────────────────────────────────────
const ITEM_CATEGORIES = [
  { value: "furniture",     label: "🪑 Furniture",        hint: "Desks, chairs, shelves, beds" },
  { value: "stationery",    label: "✏️ Stationery",       hint: "Pens, paper, books, files" },
  { value: "electronics",   label: "💻 Electronics",      hint: "Computers, projectors, cables" },
  { value: "medical",       label: "💊 Medical",          hint: "Medicines, bandages, equipment" },
  { value: "kitchen",       label: "🍽️ Kitchen",          hint: "Food items, utensils, gas" },
  { value: "cleaning",      label: "🧹 Cleaning",         hint: "Detergents, mops, bins" },
  { value: "sports",        label: "⚽ Sports",           hint: "Balls, nets, jerseys" },
  { value: "laboratory",    label: "🔬 Laboratory",       hint: "Chemicals, glassware, specimens" },
  { value: "library",       label: "📚 Library",          hint: "Books, journals, CDs" },
  { value: "tools",         label: "🔧 Tools",            hint: "Hardware, maintenance tools" },
  { value: "transport",     label: "🚌 Transport",        hint: "Spare parts, fuel, tyres" },
  { value: "security",      label: "🔒 Security",         hint: "Torches, uniforms, equipment" },
  { value: "boarding",      label: "🛏️ Boarding",         hint: "Bedding, mattresses, lockers" },
  { value: "general",       label: "📦 General",          hint: "Miscellaneous" },
];

const categoryLabel = (v: string) => ITEM_CATEGORIES.find(c => c.value === v)?.label ?? v;

// ─── Issue destinations ───────────────────────────────────────────────────────
const ISSUE_DESTINATIONS = [
  { value: "class",       label: "🏫 Classroom",      hint: "Issued to a specific class — picks students & desk count", hasClass: true },
  { value: "clinic",      label: "🏥 Clinic",         hint: "Auto-routes to clinic stock", suggestCategories: ["medical", "cleaning"] },
  { value: "kitchen",     label: "🍽️ Kitchen",        hint: "Auto-routes to kitchen stock", suggestCategories: ["kitchen", "cleaning"] },
  { value: "library",     label: "📚 Library",        hint: "Library department",            suggestCategories: ["library", "stationery"] },
  { value: "boarding",    label: "🛏️ Boarding",       hint: "Dormitory / boarding",          suggestCategories: ["boarding", "cleaning"] },
  { value: "laboratory",  label: "🔬 Laboratory",     hint: "Science laboratory",            suggestCategories: ["laboratory"] },
  { value: "sports",      label: "⚽ Sports",         hint: "Sports & PE department",        suggestCategories: ["sports"] },
  { value: "admin",       label: "🏢 Administration", hint: "Admin office",                  suggestCategories: ["stationery", "electronics"] },
  { value: "maintenance", label: "🔧 Maintenance",    hint: "Maintenance & repairs",         suggestCategories: ["tools", "cleaning"] },
  { value: "security",    label: "🔒 Security",       hint: "Security department",           suggestCategories: ["security"] },
  { value: "transport",   label: "🚌 Transport",      hint: "Transport department",          suggestCategories: ["transport"] },
  { value: "staff",       label: "👤 Staff Member",   hint: "Issued to individual staff" },
  { value: "other",       label: "📦 Other",          hint: "Other — specify in notes" },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
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
        .limit(500);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

function useClasses(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["classes-for-inventory", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, level, students(count)")
        .order("level").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useStudentsByClass(classId: string | undefined) {
  return useQuery({
    queryKey: ["students-by-class", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, adm_no")
        .eq("class_id", classId!)
        .eq("status", "active")
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
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

// ─── Page ─────────────────────────────────────────────────────────────────────
function InventoryPage() {
  const [tab, setTab] = useState("items");
  const { school } = useTenant();
  const schoolId = school?.id;
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("store_admin") || hasRole("store_user") || hasRole("bursar");

  const itemsQ    = useInv<any>("inventory_items", schoolId);
  const suppliersQ = useInv<any>("inventory_suppliers", schoolId);
  const receiptsQ  = useInv<any>("inventory_receipts", schoolId);
  const issuesQ    = useInv<any>("inventory_issues", schoolId);
  const classesQ   = useClasses(schoolId);

  // Low stock items for quick alert
  const lowStock = useMemo(() =>
    (itemsQ.data ?? []).filter((i: any) => Number(i.current_qty) <= Number(i.reorder_level) && Number(i.reorder_level) > 0),
    [itemsQ.data]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Stock items grouped by category · receipts · issues · suppliers</p>
        </div>
        {lowStock.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            {lowStock.length} item{lowStock.length > 1 ? "s" : ""} below reorder level
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>

        {/* ── ITEMS ── */}
        <TabsContent value="items">
          <ItemsTab
            q={itemsQ}
            schoolId={schoolId}
            canEdit={canEdit}
          />
        </TabsContent>

        {/* ── RECEIPTS ── */}
        <TabsContent value="receipts">
          <GenericTab
            q={receiptsQ}
            cols={["received_at", "item_id", "qty", "unit_cost"]}
            lookups={{ item_id: itemsQ.data }}
            action={canEdit && (
              <ReceiptDialog
                schoolId={schoolId}
                items={itemsQ.data ?? []}
                suppliers={suppliersQ.data ?? []}
              />
            )}
          />
        </TabsContent>

        {/* ── ISSUES ── */}
        <TabsContent value="issues">
          <GenericTab
            q={issuesQ}
            cols={["issued_at", "item_id", "qty", "issued_to", "notes"]}
            lookups={{ item_id: itemsQ.data }}
            action={canEdit && (
              <IssueDialog
                schoolId={schoolId}
                items={itemsQ.data ?? []}
                classes={classesQ.data ?? []}
              />
            )}
          />
        </TabsContent>

        {/* ── SUPPLIERS ── */}
        <TabsContent value="suppliers">
          <GenericTab
            q={suppliersQ}
            cols={["name", "contact", "notes"]}
            action={canEdit && <SupplierDialog schoolId={schoolId} />}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Items tab (grouped by category) ─────────────────────────────────────────
function ItemsTab({ q, schoolId, canEdit }: { q: any; schoolId: string | undefined; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  const items: any[] = q.data ?? [];

  const filtered = useMemo(() => items.filter((i) => {
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || (i.category ?? "general") === filterCat;
    return matchSearch && matchCat;
  }), [items, search, filterCat]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of filtered) {
      const cat = item.category ?? "general";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [filtered]);

  const usedCategories = useMemo(() =>
    Array.from(new Set(items.map((i) => i.category ?? "general"))),
    [items]
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2.5 top-2.5" onClick={() => setSearch("")}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-48">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {usedCategories.map((c) => (
              <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit && <ItemDialog schoolId={schoolId} />}
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : grouped.size === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {search || filterCat !== "all" ? "No items match your filter." : "No items yet — add one above."}
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([cat, catItems]) => (
          <CategoryGroup key={cat} category={cat} items={catItems} />
        ))
      )}
    </div>
  );
}

function CategoryGroup({ category, items }: { category: string; items: any[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const catDef = ITEM_CATEGORIES.find(c => c.value === category);
  const lowCount = items.filter(i => Number(i.current_qty) <= Number(i.reorder_level) && Number(i.reorder_level) > 0).length;

  return (
    <Card>
      <CardHeader
        className="flex flex-row items-center justify-between py-3 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">{catDef?.label ?? category}</span>
          <Badge variant="secondary">{items.length}</Badge>
          {lowCount > 0 && (
            <Badge variant="destructive" className="text-xs">{lowCount} low</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{catDef?.hint}</span>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>In Stock</TableHead>
                <TableHead>Reorder At</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const qty = Number(item.current_qty);
                const reorder = Number(item.reorder_level);
                const isLow = reorder > 0 && qty <= reorder;
                const isOut = qty <= 0;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.sku || "—"}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className={isOut ? "text-destructive font-semibold" : isLow ? "text-amber-600 font-semibold" : ""}>
                      {qty}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{reorder || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.location || "—"}</TableCell>
                    <TableCell>
                      {isOut ? (
                        <Badge variant="destructive">Out of stock</Badge>
                      ) : isLow ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200">Low</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Generic tab (receipts / issues / suppliers) ──────────────────────────────
function GenericTab({ q, cols, lookups, action }: {
  q: any;
  cols: string[];
  lookups?: Record<string, any[] | undefined>;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between flex-row">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Records</CardTitle>
          {q.data && <Badge variant="secondary">{q.data.length}</Badge>}
        </div>
        {action}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No records yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {cols.map((c) => (
                  <TableHead key={c} className="capitalize">{c.replace(/_/g, " ")}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((row: any) => (
                <TableRow key={row.id}>
                  {cols.map((c) => (
                    <TableCell key={c} className="text-sm">
                      {lookups?.[c]
                        ? formatLookup(row[c], lookups[c])
                        : formatCell(row[c])}
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

// ─── Item dialog ──────────────────────────────────────────────────────────────
function ItemDialog({ schoolId }: { schoolId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const empty = { sku: "", name: "", category: "general", unit: "unit", current_qty: 0, reorder_level: 0, location: "", description: "" };
  const [form, setForm] = useState(empty);
  const m = useInvMutation("inventory_items", schoolId, () => { setOpen(false); setForm(empty); });

  const f = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Item</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Inventory Item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={f("name")} placeholder="e.g. Student Desk" />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={f("sku")} placeholder="Optional code" />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit} onChange={f("unit")} placeholder="piece / box / litre" />
            </div>
            <div>
              <Label>Opening Qty</Label>
              <Input type="number" value={form.current_qty} onChange={(e) => setForm({ ...form, current_qty: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Reorder Level</Label>
              <Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Storage Location</Label>
              <Input value={form.location} onChange={f("location")} placeholder="e.g. Store Room B" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={f("description")} placeholder="Optional notes about this item" rows={2} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!form.name || m.isPending} onClick={() => m.mutate(form)}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Supplier dialog ──────────────────────────────────────────────────────────
function SupplierDialog({ schoolId }: { schoolId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", notes: "" });
  const m = useInvMutation("inventory_suppliers", schoolId, () => { setOpen(false); setForm({ name: "", contact: "", notes: "" }); });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" />Supplier</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone or email" /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!form.name || m.isPending} onClick={() => m.mutate(form)}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Receipt dialog ───────────────────────────────────────────────────────────
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

  const selectedItem = items.find(i => i.id === form.item_id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!items.length}><Plus className="w-4 h-4 mr-1" />Receipt</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Goods Receipt</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Item *</Label>
            <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {ITEM_CATEGORIES.map((cat) => {
                  const catItems = items.filter(i => (i.category ?? "general") === cat.value);
                  if (!catItems.length) return null;
                  return (
                    <div key={cat.value}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{cat.label}</div>
                      {catItems.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name} <span className="text-muted-foreground text-xs ml-1">({i.current_qty} {i.unit})</span>
                        </SelectItem>
                      ))}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedItem && (
              <p className="text-xs text-muted-foreground mt-1">
                Current stock: <strong>{selectedItem.current_qty}</strong> {selectedItem.unit} · Category: {categoryLabel(selectedItem.category ?? "general")}
              </p>
            )}
          </div>
          <div>
            <Label>Supplier (optional)</Label>
            <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Quantity *</Label><Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} /></div>
            <div><Label>Unit Cost (KES)</Label><Input type="number" min={0} value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!form.item_id || form.qty <= 0 || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Issue dialog (smart: class-aware, destination-aware) ─────────────────────
function IssueDialog({ schoolId, items, classes }: {
  schoolId: string | undefined;
  items: any[];
  classes: any[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    item_id: "",
    qty: 1,
    destination: "",
    class_id: "",
    staff_name: "",
    notes: "",
  });
  const qc = useQueryClient();
  const { user } = useAuth();

  const destDef = ISSUE_DESTINATIONS.find(d => d.value === form.destination);

  // Fetch students when a class is selected
  const studentsQ = useStudentsByClass(form.destination === "class" && form.class_id ? form.class_id : undefined);

  const selectedClass = classes.find(c => c.id === form.class_id);
  const selectedItem = items.find(i => i.id === form.item_id);
  const studentCount = studentsQ.data?.length ?? 0;

  // Items filtered to suggested categories for the selected destination
  const suggestedItems = useMemo(() => {
    if (!destDef?.suggestCategories?.length) return items;
    return items.filter(i => destDef.suggestCategories!.includes(i.category ?? "general"));
  }, [items, destDef]);

  const otherItems = useMemo(() => {
    if (!destDef?.suggestCategories?.length) return [];
    return items.filter(i => !destDef.suggestCategories!.includes(i.category ?? "general"));
  }, [items, destDef]);

  const buildIssuedTo = () => {
    if (!form.destination) return null;
    if (form.destination === "class" && form.class_id) {
      const cls = classes.find(c => c.id === form.class_id);
      return `class:${cls?.name ?? form.class_id}`;
    }
    if ((form.destination === "staff" || form.destination === "other") && form.staff_name.trim()) {
      return `${form.destination}:${form.staff_name.trim()}`;
    }
    return form.destination;
  };

  const m = useMutation({
    mutationFn: async () => {
      if (!form.item_id) throw new Error("Select an item");
      if (!form.destination) throw new Error("Select a destination");
      const available = selectedItem?.current_qty ?? 0;
      if (form.qty > available) throw new Error(`Only ${available} ${selectedItem?.unit ?? "units"} in stock`);

      const { error: insErr } = await supabase.from("inventory_issues").insert({
        school_id: schoolId,
        item_id: form.item_id,
        qty: form.qty,
        issued_to: buildIssuedTo(),
        notes: form.notes || null,
        issued_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      // Optimistic qty deduction (trigger also handles this server-side)
      const { error: updErr } = await supabase.from("inventory_items")
        .update({ current_qty: available - form.qty }).eq("id", form.item_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_issues", schoolId] });
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_items", schoolId] });
      toast.success("Stock issued");
      setOpen(false);
      setForm({ item_id: "", qty: 1, destination: "", class_id: "", staff_name: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Reset class/staff when destination changes
  const handleDestChange = (v: string) => {
    setForm({ ...form, destination: v, class_id: "", staff_name: "", item_id: "" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!items.length}><Plus className="w-4 h-4 mr-1" />Issue</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Issue Stock</DialogTitle></DialogHeader>
        <div className="space-y-4">

          {/* Destination */}
          <div>
            <Label>Destination *</Label>
            <Select value={form.destination} onValueChange={handleDestChange}>
              <SelectTrigger><SelectValue placeholder="Where is this going?" /></SelectTrigger>
              <SelectContent>
                {ISSUE_DESTINATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    <span>{d.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destDef && (
              <p className="text-xs text-muted-foreground mt-1">{destDef.hint}</p>
            )}
          </div>

          {/* Class selector — shown when destination = class */}
          {form.destination === "class" && (
            <div>
              <Label>Class *</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                      {cls.students?.[0]?.count != null && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · {cls.students[0].count} students
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Class info panel */}
              {form.class_id && (
                <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                  <p className="font-medium">{selectedClass?.name}</p>
                  {studentsQ.isLoading ? (
                    <p className="text-muted-foreground text-xs">Loading students…</p>
                  ) : (
                    <>
                      <p className="text-muted-foreground text-xs">
                        <strong>{studentCount}</strong> active student{studentCount !== 1 ? "s" : ""}
                        {studentCount > 0 && " — suggested qty: " + studentCount + " (1 per student)"}
                      </p>
                      {studentCount > 0 && studentsQ.data && studentsQ.data.length <= 15 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {studentsQ.data.map((s: any) => (
                            <Badge key={s.id} variant="outline" className="text-xs">
                              {s.first_name} {s.last_name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {studentCount > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => setForm(f => ({ ...f, qty: studentCount }))}
                        >
                          Set qty to {studentCount} (1 per student)
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Staff name — shown when destination = staff or other */}
          {(form.destination === "staff" || form.destination === "other") && (
            <div>
              <Label>{form.destination === "staff" ? "Staff Member Name *" : "Recipient *"}</Label>
              <Input
                value={form.staff_name}
                onChange={(e) => setForm({ ...form, staff_name: e.target.value })}
                placeholder={form.destination === "staff" ? "e.g. John Kamau" : "Recipient name"}
              />
            </div>
          )}

          {/* Item selector — grouped + suggested categories highlighted */}
          {form.destination && (
            <div>
              <Label>Item *</Label>
              <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {suggestedItems.length > 0 && (
                    <>
                      {destDef?.suggestCategories && (
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-b">
                          Suggested for {destDef.label}
                        </div>
                      )}
                      {suggestedItems.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          <span className="flex items-center gap-1.5">
                            <span>{i.name}</span>
                            <span className="text-xs text-muted-foreground">({i.current_qty} {i.unit})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {otherItems.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-b mt-1">
                        Other items
                      </div>
                      {otherItems.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          <span>{i.name}</span>
                          <span className="text-xs text-muted-foreground ml-1">({i.current_qty} {i.unit})</span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {selectedItem && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available: <strong>{selectedItem.current_qty}</strong> {selectedItem.unit}
                  {" · "}{categoryLabel(selectedItem.category ?? "general")}
                  {selectedItem.location && ` · ${selectedItem.location}`}
                </p>
              )}
            </div>
          )}

          {/* Quantity */}
          {form.item_id && (
            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                min={1}
                max={selectedItem?.current_qty ?? undefined}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
              />
              {selectedItem && form.qty > selectedItem.current_qty && (
                <p className="text-xs text-destructive mt-1">
                  Exceeds available stock ({selectedItem.current_qty})
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional — purpose, reference number, etc."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={
              !form.item_id || !form.destination || form.qty <= 0 ||
              (selectedItem && form.qty > selectedItem.current_qty) ||
              (form.destination === "class" && !form.class_id) ||
              m.isPending
            }
            onClick={() => m.mutate()}
          >
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Issue Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
