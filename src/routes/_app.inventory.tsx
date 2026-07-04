import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
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
import { Loader2, Plus, AlertTriangle, Search, Filter, X, BarChart3, Package, XCircle, Clock, Bell, ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from "recharts";
import { toast } from "sonner";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";
import { useActiveStudents } from "@/lib/students.functions";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

// ─── Item categories ──────────────────────────────────────────────────────────
const ITEM_CATEGORIES = [
  { value: "furniture",   label: "🪑 Furniture",      hint: "Desks, chairs, shelves, beds" },
  { value: "stationery",  label: "✏️ Stationery",     hint: "Pens, paper, books, files" },
  { value: "electronics", label: "💻 Electronics",    hint: "Computers, projectors, cables" },
  { value: "medical",     label: "💊 Medical",        hint: "Medicines, bandages, equipment" },
  { value: "kitchen",     label: "🍽️ Kitchen",        hint: "Food items, utensils, gas" },
  { value: "cleaning",    label: "🧹 Cleaning",       hint: "Detergents, mops, bins" },
  { value: "sports",      label: "⚽ Sports",         hint: "Balls, nets, jerseys" },
  { value: "laboratory",  label: "🔬 Laboratory",     hint: "Chemicals, glassware, specimens" },
  { value: "library",     label: "📚 Library",        hint: "Books, journals, CDs" },
  { value: "tools",       label: "🔧 Tools",          hint: "Hardware, maintenance tools" },
  { value: "transport",   label: "🚌 Transport",      hint: "Spare parts, fuel, tyres" },
  { value: "security",    label: "🔒 Security",       hint: "Torches, uniforms, equipment" },
  { value: "boarding",    label: "🛏️ Boarding",       hint: "Bedding, mattresses, lockers" },
  { value: "general",     label: "📦 General",        hint: "Miscellaneous" },
];

const categoryLabel = (v: string) => ITEM_CATEGORIES.find(c => c.value === v)?.label ?? v;

// ─── Smart subcategories (section 3) — optional, falls back to free text ───
const SUBCATEGORIES: Record<string, string[]> = {
  furniture:   ["Classroom", "Office", "Dormitory"],
  electronics: ["Computers", "Printers", "Networking"],
  library:     ["Textbooks", "Story Books", "Reference"],
  medical:     ["Medicines", "Equipment"],
  sports:      ["Indoor", "Outdoor"],
};

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "disposed", label: "Disposed" },
];

// ─── Issue destinations ───────────────────────────────────────────────────────
const ISSUE_DESTINATIONS = [
  { value: "class",       label: "🏫 Classroom",      hint: "Issued to a specific class", hasClass: true },
  { value: "clinic",      label: "🏥 Clinic",         hint: "Auto-routes to clinic stock",       suggestCategories: ["medical", "cleaning"] },
  { value: "kitchen",     label: "🍽️ Kitchen",        hint: "Auto-routes to kitchen stock",      suggestCategories: ["kitchen", "cleaning"] },
  { value: "library",     label: "📚 Library",        hint: "Library department",                suggestCategories: ["library", "stationery"] },
  { value: "boarding",    label: "🛏️ Boarding",       hint: "Dormitory / boarding",              suggestCategories: ["boarding", "cleaning"] },
  { value: "laboratory",  label: "🔬 Laboratory",     hint: "Science laboratory",                suggestCategories: ["laboratory"] },
  { value: "sports",      label: "⚽ Sports",         hint: "Sports & PE department",            suggestCategories: ["sports"] },
  { value: "admin",       label: "🏢 Administration", hint: "Admin office",                      suggestCategories: ["stationery", "electronics"] },
  { value: "maintenance", label: "🔧 Maintenance",    hint: "Maintenance & repairs",             suggestCategories: ["tools", "cleaning"] },
  { value: "security",    label: "🔒 Security",       hint: "Security department",               suggestCategories: ["security"] },
  { value: "transport",   label: "🚌 Transport",      hint: "Transport department",              suggestCategories: ["transport"] },
  { value: "staff",       label: "👤 Staff Member",   hint: "Issued to individual staff" },
  { value: "other",       label: "📦 Other",          hint: "Other — specify in notes" },
];

// ─── Hook: resolve schoolId (useTenant + direct DB fallback) ─────────────────
function useSchoolId() {
  const { school } = useTenant();
  const [fallbackId, setFallbackId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If useTenant already gave us an id, no need for fallback
    if (school?.id) return;
    // Only attempt fallback once
    if (fallbackId) return;
    setLoading(true);
    supabase
      .from("schools" as any)
      .select("id")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.id) setFallbackId(data.id);
        setLoading(false);
      });
  }, [school?.id, fallbackId]);

  return { schoolId: school?.id ?? fallbackId, loading: !school?.id && loading };
}

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

function useStores(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["inventory-stores", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_stores" as any)
        .select("id, name, code")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) return []; // table may not exist yet if migration hasn't run
      return (data ?? []) as any[];
    },
  });
}

// NOTE: previously this file had its own useStudentsByClass() hook that
// queried `students` directly with `.select("id, first_name, last_name, adm_no")`
// and only checked `status === "active"`. That column is actually named
// `admission_no` (per src/lib/students.functions.ts), so the select silently
// errored and always returned an empty list — which is why the "Issue Stock"
// dialog showed "0 active students" even though the class dropdown (which
// just does a raw `students(count)` over ALL students, active or not)
// correctly showed 30. Replaced with the canonical useActiveStudents() hook
// so this module agrees with library/attendance/clinic/etc. on both status
// fields and the correct column names.

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

// ─── Dashboard (section 1) ─────────────────────────────────────────────────
const DASH_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#8b5cf6", "#0ea5e9"];

function useDashboardData(schoolId: string | undefined, items: any[], issues: any[], receipts: any[]) {
  const { data: pendingRequests = 0 } = useQuery({
    queryKey: ["inventory-dashboard-requests", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("inventory_requests" as any)
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .eq("status", "pending");
      if (error) return 0; // table may not exist yet on older deployments
      return count ?? 0;
    },
  });

  return useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const in30Days = new Date(today); in30Days.setDate(in30Days.getDate() + 30);

    const totalItems = items.length;
    const totalQty = items.reduce((s, i) => s + Number(i.current_qty || 0), 0);
    const totalValue = items.reduce((s, i) => s + Number(i.current_qty || 0) * Number(i.unit_cost || 0), 0);
    const lowStock = items.filter(i => Number(i.current_qty) <= Number(i.reorder_level) && Number(i.reorder_level) > 0).length;
    const outOfStock = items.filter(i => Number(i.current_qty) <= 0).length;
    const expiring = items.filter(i => i.expiry_date && new Date(i.expiry_date) <= in30Days && new Date(i.expiry_date) >= today).length;

    const issuedToday = issues.filter((x: any) => x.issued_at && new Date(x.issued_at) >= today).length;
    const receivedToday = receipts.filter((x: any) => x.received_at && new Date(x.received_at) >= today).length;
    const issuedThisWeek = issues.filter((x: any) => x.issued_at && new Date(x.issued_at) >= weekAgo).length;
    const receivedThisMonth = receipts.filter((x: any) => x.received_at && new Date(x.received_at) >= monthStart).length;

    // Monthly movement (last 6 months)
    const months: Record<string, { month: string; issued: number; received: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      months[key] = { month: d.toLocaleString("default", { month: "short" }), issued: 0, received: 0 };
    }
    for (const x of issues as any[]) {
      if (!x.issued_at) continue;
      const d = new Date(x.issued_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (months[key]) months[key].issued++;
    }
    for (const x of receipts as any[]) {
      if (!x.received_at) continue;
      const d = new Date(x.received_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (months[key]) months[key].received++;
    }
    const monthlyMovement = Object.values(months);

    // Category distribution + value by category
    const catCounts: Record<string, number> = {};
    const catValue: Record<string, number> = {};
    for (const i of items) {
      const cat = i.category || "general";
      catCounts[cat] = (catCounts[cat] || 0) + 1;
      catValue[cat] = (catValue[cat] || 0) + Number(i.current_qty || 0) * Number(i.unit_cost || 0);
    }
    const categoryDistribution = Object.entries(catCounts).map(([name, value]) => ({ name: categoryLabel(name), value }));
    const valueByCategory = Object.entries(catValue).filter(([, v]) => v > 0).map(([name, value]) => ({ name: categoryLabel(name), value }));

    return {
      totalItems, totalQty, totalValue, lowStock, outOfStock, expiring,
      pendingRequests, issuedToday, receivedToday, issuedThisWeek, receivedThisMonth,
      monthlyMovement, categoryDistribution, valueByCategory,
    };
  }, [items, issues, receipts, pendingRequests]);
}

function InventoryDashboard({ schoolId, items, issues, receipts }: { schoolId: string; items: any[]; issues: any[]; receipts: any[] }) {
  const d = useDashboardData(schoolId, items, issues, receipts);

  const statCards = [
    { label: "Total Items", value: d.totalItems, icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Total Stock Value", value: `KES ${d.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Total Quantity", value: d.totalQty.toLocaleString(), icon: Package, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Low Stock", value: d.lowStock, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Out of Stock", value: d.outOfStock, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Expiring Soon", value: d.expiring, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Pending Requests", value: d.pendingRequests, icon: Bell, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Issued Today", value: d.issuedToday, icon: ArrowUpRight, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "Received Today", value: d.receivedToday, icon: ArrowDownRight, color: "text-teal-600", bg: "bg-teal-50" },
    { label: "Issued This Week", value: d.issuedThisWeek, icon: TrendingUp, color: "text-sky-600", bg: "bg-sky-50" },
    { label: "Received This Month", value: d.receivedThisMonth, icon: TrendingUp, color: "text-lime-600", bg: "bg-lime-50" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 px-3">
              <div className={`h-8 w-8 rounded-full ${bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-lg font-bold leading-tight">{value}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Monthly Issues vs Receipts</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={d.monthlyMovement}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="issued" stroke="#ef4444" strokeWidth={2} name="Issued" dot={false} />
                <Line type="monotone" dataKey="received" stroke="#22c55e" strokeWidth={2} name="Received" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Category Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={d.categoryDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                  {d.categoryDistribution.map((_, i) => <Cell key={i} fill={DASH_COLORS[i % DASH_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm">Inventory Value by Category</CardTitle></CardHeader>
          <CardContent>
            {d.valueByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Add a Unit Cost to items to see valuation.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={d.valueByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `KES ${Number(v).toLocaleString()}`} />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="Value (KES)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function InventoryPage() {
  const [tab, setTab] = useState("items");
  const { schoolId, loading: schoolLoading } = useSchoolId();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("store_admin") || hasRole("store_user") || hasRole("bursar");

  const itemsQ     = useInv<any>("inventory_items", schoolId);
  const suppliersQ = useInv<any>("inventory_suppliers", schoolId);
  const receiptsQ  = useInv<any>("inventory_receipts", schoolId);
  const issuesQ    = useInv<any>("inventory_issues", schoolId);
  const classesQ   = useClasses(schoolId);
  const storesQ    = useStores(schoolId);

  const lowStock = useMemo(() =>
    (itemsQ.data ?? []).filter((i: any) =>
      Number(i.current_qty) <= Number(i.reorder_level) && Number(i.reorder_level) > 0
    ), [itemsQ.data]
  );

  if (schoolLoading || !schoolId) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

      <InventoryDashboard schoolId={schoolId} items={itemsQ.data ?? []} issues={issuesQ.data ?? []} receipts={receiptsQ.data ?? []} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <ItemsTab q={itemsQ} schoolId={schoolId} canEdit={canEdit} stores={storesQ.data ?? []} />
        </TabsContent>

        <TabsContent value="assets">
          <AssetsTab schoolId={schoolId} items={itemsQ.data ?? []} classes={classesQ.data ?? []} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="requests">
          <RequestsTab schoolId={schoolId} items={itemsQ.data ?? []} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="transfers">
          <TransfersTab schoolId={schoolId} items={itemsQ.data ?? []} stores={storesQ.data ?? []} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="receipts">
          <GenericTab
            q={receiptsQ}
            cols={["received_at", "item_id", "qty", "unit_cost"]}
            lookups={{ item_id: itemsQ.data }}
            action={canEdit && (
              <ReceiptDialog schoolId={schoolId} items={itemsQ.data ?? []} suppliers={suppliersQ.data ?? []} />
            )}
          />
        </TabsContent>

        <TabsContent value="issues">
          <GenericTab
            q={issuesQ}
            cols={["issued_at", "item_id", "qty", "issued_to", "notes"]}
            lookups={{ item_id: itemsQ.data }}
            action={canEdit && (
              <IssueDialog schoolId={schoolId} items={itemsQ.data ?? []} classes={classesQ.data ?? []} />
            )}
          />
        </TabsContent>

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

// ─── Items tab ────────────────────────────────────────────────────────────────
function ItemsTab({ q, schoolId, canEdit, stores }: { q: any; schoolId: string; canEdit: boolean; stores: any[] }) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const items: any[] = q.data ?? [];

  const filtered = useMemo(() => items.filter((i) => {
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || (i.category ?? "general") === filterCat;
    return matchSearch && matchCat;
  }), [items, search, filterCat]);

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
        {canEdit && <ItemDialog schoolId={schoolId} stores={stores} />}
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
  const lowCount = items.filter(i =>
    Number(i.current_qty) <= Number(i.reorder_level) && Number(i.reorder_level) > 0
  ).length;

  return (
    <Card>
      <CardHeader
        className="flex flex-row items-center justify-between py-3 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">{catDef?.label ?? category}</span>
          <Badge variant="secondary">{items.length}</Badge>
          {lowCount > 0 && <Badge variant="destructive" className="text-xs">{lowCount} low</Badge>}
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
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const qty = Number(item.current_qty);
                const reorder = Number(item.reorder_level);
                const isLow = reorder > 0 && qty <= reorder;
                const isOut = qty <= 0;
                const expiringSoon = item.expiry_date && (() => {
                  const days = (new Date(item.expiry_date).getTime() - Date.now()) / 86400000;
                  return days >= 0 && days <= 30;
                })();
                const expired = item.expiry_date && new Date(item.expiry_date).getTime() < Date.now();
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.name}
                      {item.is_individually_tracked && (
                        <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">
                          {item.asset_tag_prefix ? `${item.asset_tag_prefix} tagged` : "Individually tracked"}
                        </Badge>
                      )}
                      {item.subcategory && <div className="text-[11px] text-muted-foreground font-normal">{item.subcategory}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.sku || "—"}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className={isOut ? "text-destructive font-semibold" : isLow ? "text-amber-600 font-semibold" : ""}>
                      {qty}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{reorder || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.location || "—"}</TableCell>
                    <TableCell>
                      {item.condition ? (
                        <Badge
                          variant="outline"
                          className={
                            item.condition === "new" || item.condition === "good" ? "text-emerald-700 border-emerald-300" :
                            item.condition === "fair" ? "text-amber-700 border-amber-300" :
                            "text-red-700 border-red-300"
                          }
                        >
                          {item.condition}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {isOut ? (
                          <Badge variant="destructive">Out of stock</Badge>
                        ) : isLow ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Low</Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                        {expired && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                        {!expired && expiringSoon && <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">Expiring soon</Badge>}
                      </div>
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

// ─── Generic tab ──────────────────────────────────────────────────────────────
// ─── Assets tab (sections 4–6: individual desk/locker/bed tracking + seating) ─
const ASSET_STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-800 border-emerald-200",
  assigned:  "bg-blue-100 text-blue-800 border-blue-200",
  broken:    "bg-red-100 text-red-800 border-red-200",
  repair:    "bg-amber-100 text-amber-800 border-amber-200",
  lost:      "bg-slate-200 text-slate-700 border-slate-300",
  disposed:  "bg-slate-100 text-slate-500 border-slate-200",
};

function useAssetUnits(schoolId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: ["inventory-asset-units", schoolId, itemId],
    enabled: !!schoolId && !!itemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_asset_units" as any)
        .select("id, asset_number, status, condition, class_id, assigned_student_id, notes, classes(id,name), students(id,first_name,last_name,admission_no)")
        .eq("school_id", schoolId!)
        .eq("item_id", itemId!)
        .order("asset_number");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function AssetsTab({ schoolId, items, classes, canEdit }: { schoolId: string; items: any[]; classes: any[]; canEdit: boolean }) {
  const trackedItems = useMemo(() => items.filter(i => i.is_individually_tracked), [items]);
  const [selectedItemId, setSelectedItemId] = useState<string>(trackedItems[0]?.id ?? "");
  useEffect(() => {
    if (!selectedItemId && trackedItems.length) setSelectedItemId(trackedItems[0].id);
  }, [trackedItems, selectedItemId]);

  const unitsQ = useAssetUnits(schoolId, selectedItemId || undefined);
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"list" | "seating">("list");
  const qc = useQueryClient();

  const units = unitsQ.data ?? [];
  const filteredUnits = statusFilter === "all" ? units : units.filter(u => u.status === statusFilter);
  const counts = useMemo(() => {
    const c: Record<string, number> = { available: 0, assigned: 0, broken: 0, repair: 0, lost: 0, disposed: 0 };
    for (const u of units) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [units]);

  const unassignMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const { error } = await supabase.from("inventory_asset_units" as any)
        .update({ status: "available", assigned_student_id: null, class_id: null, updated_at: new Date().toISOString() })
        .eq("id", unitId);
      if (error) throw error;
      await supabase.from("student_asset_assignments" as any)
        .update({ returned_at: new Date().toISOString() })
        .eq("asset_unit_id", unitId)
        .is("returned_at", null);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-asset-units", schoolId, selectedItemId] }); toast.success("Unassigned"); },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ unitId, status }: { unitId: string; status: string }) => {
      const patch: any = { status, updated_at: new Date().toISOString() };
      if (status !== "assigned") { patch.assigned_student_id = null; patch.class_id = null; }
      const { error } = await supabase.from("inventory_asset_units" as any).update(patch).eq("id", unitId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-asset-units", schoolId, selectedItemId] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!trackedItems.length) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
        No individually-tracked items yet. In <strong>Items → Add Item → Identification tab</strong>, tick
        "Track as individual assets" and give it a tag prefix (e.g. TBL for desks) to start generating numbered units here.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedItemId} onValueChange={setSelectedItemId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select item" /></SelectTrigger>
          <SelectContent>
            {trackedItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.keys(ASSET_STATUS_STYLES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto">
          <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>List</Button>
          <Button size="sm" variant={view === "seating" ? "default" : "outline"} onClick={() => setView("seating")}>Seating Plan</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} variant="outline" className={ASSET_STATUS_STYLES[status]}>
            {status}: {count}
          </Badge>
        ))}
      </div>

      {unitsQ.isLoading ? (
        <div className="grid place-items-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : view === "seating" ? (
        <SeatingGrid units={units} classes={classes} schoolId={schoolId} itemId={selectedItemId} canEdit={canEdit} />
      ) : (
        <Card><CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Assigned To</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUnits.length === 0 && (
                <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">No units match this filter.</TableCell></TableRow>
              )}
              {filteredUnits.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs font-medium">{u.asset_number}</TableCell>
                  <TableCell><Badge variant="outline" className={ASSET_STATUS_STYLES[u.status]}>{u.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.condition || "—"}</TableCell>
                  <TableCell className="text-xs">{u.classes?.name || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {u.students ? `${u.students.first_name} ${u.students.last_name} (${u.students.admission_no})` : "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {u.status === "assigned" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => unassignMutation.mutate(u.id)}>Unassign</Button>
                        )}
                        {u.status === "available" && (
                          <AssignAssetDialog schoolId={schoolId} unit={u} classes={classes} onDone={() => qc.invalidateQueries({ queryKey: ["inventory-asset-units", schoolId, selectedItemId] })} />
                        )}
                        {u.status !== "broken" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => setStatusMutation.mutate({ unitId: u.id, status: "broken" })}>Mark Broken</Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}

function AssignAssetDialog({ schoolId, unit, classes, onDone }: { schoolId: string; unit: any; classes: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const studentsQ = useActiveStudents({ classId: classId || null, enabled: !!classId });

  const m = useMutation({
    mutationFn: async () => {
      const { error: uErr } = await supabase.from("inventory_asset_units" as any)
        .update({ status: "assigned", class_id: classId, assigned_student_id: studentId, updated_at: new Date().toISOString() })
        .eq("id", unit.id);
      if (uErr) throw uErr;
      const { error: aErr } = await supabase.from("student_asset_assignments" as any).insert({
        school_id: schoolId, student_id: studentId, asset_unit_id: unit.id,
        condition_at_assignment: unit.condition || "good",
      });
      if (aErr) throw aErr;
    },
    onSuccess: () => { toast.success(`${unit.asset_number} assigned`); setOpen(false); setClassId(""); setStudentId(""); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="h-7 text-xs">Assign</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign {unit.asset_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setStudentId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Student ({studentsQ.data?.length ?? 0})</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={!classId}>
              <SelectTrigger><SelectValue placeholder={classId ? "Select student" : "Choose class first"} /></SelectTrigger>
              <SelectContent>
                {(studentsQ.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!classId || !studentId || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeatingGrid({ units, classes, schoolId, itemId, canEdit }: { units: any[]; classes: any[]; schoolId: string; itemId: string; canEdit: boolean }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const classUnits = useMemo(() => units.filter(u => u.class_id === classId), [units, classId]);
  const unassigned = useMemo(() => units.filter(u => u.status === "available"), [units]);

  return (
    <div className="space-y-3">
      <Select value={classId} onValueChange={setClassId}>
        <SelectTrigger className="w-56"><SelectValue placeholder="Select class to view seating" /></SelectTrigger>
        <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>

      {!classId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Pick a class to see its seating layout.</p>
      ) : classUnits.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No desks assigned to this class yet. Use the List view's "Assign" action, or bulk-assign from the {unassigned.length} available unit{unassigned.length !== 1 ? "s" : ""}.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {classUnits.map((u: any) => (
            <div
              key={u.id}
              className={`rounded-lg border p-2 text-center text-xs ${ASSET_STATUS_STYLES[u.status]}`}
              title={u.students ? `${u.students.first_name} ${u.students.last_name}` : u.status}
            >
              <div className="font-mono font-semibold">{u.asset_number.split("-").pop()}</div>
              <div className="truncate mt-0.5">
                {u.students ? `${u.students.first_name} ${u.students.last_name?.[0]}.` : u.status === "available" ? "Vacant" : u.status}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Print support: use your browser's print dialog on this view, or export via Reports once that module is added.
      </p>
    </div>
  );
}

// ─── Requests workflow (section 7) ──────────────────────────────────────────
const REQUEST_DEPARTMENTS = [
  { value: "kitchen", label: "🍽️ Kitchen" },
  { value: "library", label: "📚 Library" },
  { value: "admin", label: "🏢 Administration" },
  { value: "ict", label: "💻 ICT" },
  { value: "sports", label: "⚽ Sports" },
  { value: "boarding", label: "🛏️ Boarding" },
  { value: "clinic", label: "🏥 Clinic" },
  { value: "maintenance", label: "🔧 Maintenance" },
  { value: "teachers", label: "👤 Teachers" },
];
const deptLabel = (v: string) => REQUEST_DEPARTMENTS.find(d => d.value === v)?.label ?? v;

const REQUEST_STATUS_STYLES: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-800 border-amber-200",
  approved:  "bg-blue-100 text-blue-800 border-blue-200",
  rejected:  "bg-red-100 text-red-800 border-red-200",
  issued:    "bg-indigo-100 text-indigo-800 border-indigo-200",
  received:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

function useRequests(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["inventory-requests", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_requests" as any)
        .select("*, inventory_items(id,name,current_qty,unit)")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function RequestsTab({ schoolId, items, canEdit }: { schoolId: string; items: any[]; canEdit: boolean }) {
  const requestsQ = useRequests(schoolId);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const requests = requestsQ.data ?? [];
  const filtered = statusFilter === "all" ? requests : requests.filter((r: any) => r.status === statusFilter);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["inventory-requests", schoolId] });

  const approveMutation = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      const { error } = await supabase.from("inventory_requests" as any)
        .update({ status: "approved", qty_approved: qty, approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Request approved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("inventory_requests" as any)
        .update({ status: "rejected", rejected_reason: reason, approved_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Request rejected"); },
    onError: (e: any) => toast.error(e.message),
  });

  const issueMutation = useMutation({
    mutationFn: async (req: any) => {
      const item = items.find(i => i.id === req.item_id);
      if (!item) throw new Error("Linked item not found — this request may use a free-text item description only");
      const qty = req.qty_approved ?? req.qty_requested;
      if (qty > item.current_qty) throw new Error(`Only ${item.current_qty} ${item.unit} in stock`);
      const { error: itemErr } = await supabase.from("inventory_items").update({ current_qty: item.current_qty - qty }).eq("id", item.id);
      if (itemErr) throw itemErr;
      const { error: reqErr } = await supabase.from("inventory_requests" as any)
        .update({ status: "issued", qty_issued: qty, issued_at: new Date().toISOString() })
        .eq("id", req.id);
      if (reqErr) throw reqErr;
      await supabase.from("inventory_movements" as any).insert({
        school_id: schoolId, item_id: item.id, event_type: "issued",
        qty_before: item.current_qty, qty_after: item.current_qty - qty,
        reason: `Request fulfilled — ${deptLabel(req.department)}`, performed_by: user?.id ?? null,
      });
    },
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["inventory", "inventory_items", schoolId] }); toast.success("Request issued — stock updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const receiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_requests" as any).update({ status: "received", received_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Marked as received"); },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_requests" as any).update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Request cancelled"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.keys(REQUEST_STATUS_STYLES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto"><RequestDialog schoolId={schoolId} items={items} /></div>
      </div>

      <Card><CardContent className="pt-4">
        {requestsQ.isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No requests match this filter.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Qty Requested</TableHead>
                <TableHead>Qty Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{deptLabel(r.department)}</TableCell>
                  <TableCell className="text-sm">{r.inventory_items?.name ?? r.item_description ?? "—"}</TableCell>
                  <TableCell>{r.qty_requested}</TableCell>
                  <TableCell>{r.qty_approved ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={REQUEST_STATUS_STYLES[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{r.reason || r.rejected_reason || "—"}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {r.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => approveMutation.mutate({ id: r.id, qty: r.qty_requested })}>Approve</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => { const reason = prompt("Reason for rejection?") ?? ""; rejectMutation.mutate({ id: r.id, reason }); }}>Reject</Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" className="h-7 text-xs" onClick={() => issueMutation.mutate(r)} disabled={issueMutation.isPending}>Issue</Button>
                        )}
                        {r.status === "issued" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => receiveMutation.mutate(r.id)}>Mark Received</Button>
                        )}
                        {r.status === "pending" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => cancelMutation.mutate(r.id)}>Cancel</Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function RequestDialog({ schoolId, items }: { schoolId: string; items: any[] }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ department: "", item_id: "", item_description: "", qty_requested: 1, reason: "" });

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventory_requests" as any).insert({
        school_id: schoolId, requested_by: user?.id ?? null,
        department: form.department, item_id: form.item_id || null,
        item_description: form.item_id ? null : (form.item_description || null),
        qty_requested: form.qty_requested, reason: form.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-requests", schoolId] });
      toast.success("Request submitted");
      setOpen(false);
      setForm({ department: "", item_id: "", item_description: "", qty_requested: 1, reason: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />New Request</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request Stock</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Department *</Label>
            <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
              <SelectTrigger><SelectValue placeholder="Requesting department" /></SelectTrigger>
              <SelectContent>{REQUEST_DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Item (from catalog, optional)</Label>
            <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select if it's already in inventory" /></SelectTrigger>
              <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.current_qty} {i.unit})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!form.item_id && (
            <div><Label>Or describe the item</Label><Input value={form.item_description} onChange={(e) => setForm({ ...form, item_description: e.target.value })} placeholder="e.g. Whiteboard markers, assorted colors" /></div>
          )}
          <div><Label>Quantity *</Label><Input type="number" min={1} value={form.qty_requested} onChange={(e) => setForm({ ...form, qty_requested: Number(e.target.value) })} /></div>
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} placeholder="Why is this needed?" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!form.department || (!form.item_id && !form.item_description.trim()) || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transfers between stores (section 10) ──────────────────────────────────
// NOTE: inventory_items.current_qty is a single global number, not tracked
// per-store. A bulk item's "transfer" therefore moves its ENTIRE remaining
// balance to the new store (updates store_id) rather than splitting qty
// across two locations — true partial-quantity multi-store stock requires
// a separate stock-by-location ledger table, which is a bigger schema change
// not included in this pass. Individually-tracked assets (desks etc.) don't
// have this limitation — each unit has its own store_id and transfers cleanly.
const TRANSFER_STATUS_STYLES: Record<string, string> = {
  requested:  "bg-amber-100 text-amber-800 border-amber-200",
  approved:   "bg-blue-100 text-blue-800 border-blue-200",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  received:   "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled:  "bg-slate-100 text-slate-500 border-slate-200",
};

function useTransfers(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["inventory-transfers", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transfers" as any)
        .select("*, inventory_items(id,name,current_qty,unit,store_id,is_individually_tracked)")
        .eq("school_id", schoolId!)
        .order("requested_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function TransfersTab({ schoolId, items, stores, canEdit }: { schoolId: string; items: any[]; stores: any[]; canEdit: boolean }) {
  const transfersQ = useTransfers(schoolId);
  const qc = useQueryClient();
  const { user } = useAuth();
  const transfers = transfersQ.data ?? [];
  const storeName = (id: string) => stores.find((s: any) => s.id === id)?.name ?? "—";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["inventory-transfers", schoolId] });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_transfers" as any).update({ status: "approved", approved_by: user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Transfer approved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const markInTransitMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_transfers" as any).update({ status: "in_transit" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Marked in transit"); },
    onError: (e: any) => toast.error(e.message),
  });

  const receiveMutation = useMutation({
    mutationFn: async (t: any) => {
      // Move the item (bulk) or asset unit (tracked) to its new store.
      if (t.asset_unit_id) {
        const { error } = await supabase.from("inventory_asset_units" as any).update({ store_id: t.to_store_id, updated_at: new Date().toISOString() }).eq("id", t.asset_unit_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_items").update({ store_id: t.to_store_id }).eq("id", t.item_id);
        if (error) throw error;
      }
      const { error: tErr } = await supabase.from("inventory_transfers" as any)
        .update({ status: "received", received_by: user?.id ?? null, received_at: new Date().toISOString() })
        .eq("id", t.id);
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_items", schoolId] });
      qc.invalidateQueries({ queryKey: ["inventory-asset-units", schoolId] });
      toast.success("Transfer received — location updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_transfers" as any).update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Transfer cancelled"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (stores.length < 2) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        You need at least 2 stores set up to transfer stock between them. Add stores directly in Supabase's <code>inventory_stores</code> table for now (a dedicated Stores admin screen can be added in a later pass).
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canEdit && <TransferDialog schoolId={schoolId} items={items} stores={stores} />}
      </div>
      <Card><CardContent className="pt-4">
        {transfersQ.isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No transfers yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{t.inventory_items?.name ?? "—"}{t.asset_unit_id ? " (unit)" : ""}</TableCell>
                  <TableCell className="text-xs">{storeName(t.from_store_id)}</TableCell>
                  <TableCell className="text-xs">{storeName(t.to_store_id)}</TableCell>
                  <TableCell><Badge variant="outline" className={TRANSFER_STATUS_STYLES[t.status]}>{t.status}</Badge></TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {t.status === "requested" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => approveMutation.mutate(t.id)}>Approve</Button>}
                        {t.status === "approved" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markInTransitMutation.mutate(t.id)}>Mark In Transit</Button>}
                        {t.status === "in_transit" && <Button size="sm" className="h-7 text-xs" onClick={() => receiveMutation.mutate(t)}>Receive</Button>}
                        {(t.status === "requested" || t.status === "approved") && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => cancelMutation.mutate(t.id)}>Cancel</Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function TransferDialog({ schoolId, items, stores }: { schoolId: string; items: any[]; stores: any[] }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [itemId, setItemId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [notes, setNotes] = useState("");

  const selectedItem = items.find(i => i.id === itemId);
  const fromStoreId = selectedItem?.store_id ?? null;

  const m = useMutation({
    mutationFn: async () => {
      if (!selectedItem) throw new Error("Select an item");
      if (fromStoreId === toStoreId) throw new Error("Pick a different destination store");
      const { error } = await supabase.from("inventory_transfers" as any).insert({
        school_id: schoolId, item_id: itemId,
        qty: selectedItem.is_individually_tracked ? null : selectedItem.current_qty,
        from_store_id: fromStoreId, to_store_id: toStoreId,
        requested_by: user?.id ?? null, notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-transfers", schoolId] });
      toast.success("Transfer requested");
      setOpen(false); setItemId(""); setToStoreId(""); setNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={!items.length}><Plus className="w-4 h-4 mr-1" />Transfer</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request Stock Transfer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Item *</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.current_qty} {i.unit})</SelectItem>)}</SelectContent>
            </Select>
            {selectedItem?.is_individually_tracked && (
              <p className="text-xs text-muted-foreground mt-1">This is an individually-tracked item — transfer a specific unit from the Assets tab instead for per-desk moves. This will move the item's catalog location only.</p>
            )}
          </div>
          <div>
            <Label>Current Store</Label>
            <Input disabled value={stores.find((s: any) => s.id === fromStoreId)?.name ?? "Unassigned"} />
          </div>
          <div>
            <Label>Transfer To *</Label>
            <Select value={toStoreId} onValueChange={setToStoreId}>
              <SelectTrigger><SelectValue placeholder="Destination store" /></SelectTrigger>
              <SelectContent>{stores.filter((s: any) => s.id !== fromStoreId).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!itemId || !toStoreId || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Request Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

// ─── Item dialog ──────────────────────────────────────────────────────────────
function ItemDialog({ schoolId, stores }: { schoolId: string; stores: any[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const empty = {
    // existing fields — untouched
    sku: "", name: "", category: "general", unit: "unit",
    current_qty: 0, reorder_level: 0, location: "", description: "",
    // new fields (section 2)
    subcategory: "", barcode: "", qr_code: "", asset_tag_prefix: "",
    serial_number: "", batch_number: "", manufacturer: "", brand: "", model: "",
    warranty_expiry: "", expiry_date: "", purchase_date: "",
    condition: "good", unit_cost: 0, photo_url: "",
    store_id: "", room: "", shelf: "", bin: "", rack: "", floor: "",
    is_individually_tracked: false,
  };
  const [form, setForm] = useState(empty);
  const f = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const subcats = SUBCATEGORIES[form.category];

  const generateSku = () => {
    const prefix = form.category.slice(0, 3).toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    setForm(p => ({ ...p, sku: `${prefix}-${suffix}` }));
  };
  const generateBarcode = () => {
    const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
    setForm(p => ({ ...p, barcode: digits }));
  };
  const generateQr = () => {
    setForm(p => ({ ...p, qr_code: `${schoolId.slice(0, 8)}:${p.sku || p.name.replace(/\s+/g, "-").toLowerCase()}:${Date.now()}` }));
  };

  const m = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        school_id: schoolId,
        sku: form.sku || null, name: form.name, category: form.category,
        subcategory: form.subcategory || null,
        unit: form.unit, current_qty: form.current_qty, reorder_level: form.reorder_level,
        location: form.location || null, description: form.description || null,
        barcode: form.barcode || null, qr_code: form.qr_code || null,
        asset_tag_prefix: form.asset_tag_prefix || null,
        serial_number: form.serial_number || null, batch_number: form.batch_number || null,
        manufacturer: form.manufacturer || null, brand: form.brand || null, model: form.model || null,
        warranty_expiry: form.warranty_expiry || null, expiry_date: form.expiry_date || null,
        purchase_date: form.purchase_date || null,
        condition: form.condition, unit_cost: form.unit_cost || null, photo_url: form.photo_url || null,
        store_id: form.store_id || null, room: form.room || null, shelf: form.shelf || null,
        bin: form.bin || null, rack: form.rack || null, floor: form.floor || null,
        is_individually_tracked: form.is_individually_tracked,
      };
      const { data, error } = await supabase.from("inventory_items" as any).insert(payload).select("id").single();
      if (error) throw error;

      // Section 4: auto-generate individual asset units (e.g. desks) if requested
      if (form.is_individually_tracked && form.asset_tag_prefix && form.current_qty > 0) {
        const { error: rpcErr } = await supabase.rpc("generate_asset_units" as any, {
          p_item_id: (data as any).id,
          p_school_id: schoolId,
          p_prefix: form.asset_tag_prefix,
          p_count: form.current_qty,
        });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", "inventory_items", schoolId] });
      qc.invalidateQueries({ queryKey: ["inventory-asset-units", schoolId] });
      toast.success(
        form.is_individually_tracked
          ? `Item added — ${form.current_qty} individually tracked units generated (${form.asset_tag_prefix}-0001…)`
          : "Item added"
      );
      setOpen(false); setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Item</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Inventory Item</DialogTitle></DialogHeader>
        <Tabs defaultValue="basic">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="id">Identification</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
          </TabsList>

          {/* ── Basic ── */}
          <TabsContent value="basic" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={f("name")} placeholder="e.g. Student Desk" />
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, subcategory: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subcategory</Label>
                {subcats ? (
                  <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {subcats.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.subcategory} onChange={f("subcategory")} placeholder="Optional" />
                )}
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={form.unit} onChange={f("unit")} placeholder="piece / box / litre" />
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                <Label>Unit Cost (KES)</Label>
                <Input type="number" min={0} value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={f("description")} placeholder="Optional notes about this item" rows={2} />
              </div>
              <div className="col-span-2">
                <Label>Photo URL</Label>
                <Input value={form.photo_url} onChange={f("photo_url")} placeholder="https://… (paste an image link)" />
              </div>
            </div>
          </TabsContent>

          {/* ── Identification ── */}
          <TabsContent value="id" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU</Label>
                <div className="flex gap-1">
                  <Input value={form.sku} onChange={f("sku")} placeholder="Auto or manual" />
                  <Button type="button" variant="outline" size="sm" onClick={generateSku}>Generate</Button>
                </div>
              </div>
              <div>
                <Label>Barcode</Label>
                <div className="flex gap-1">
                  <Input value={form.barcode} onChange={f("barcode")} placeholder="Auto or scan" />
                  <Button type="button" variant="outline" size="sm" onClick={generateBarcode}>Generate</Button>
                </div>
              </div>
              <div className="col-span-2">
                <Label>QR Code Value</Label>
                <div className="flex gap-1">
                  <Input value={form.qr_code} onChange={f("qr_code")} placeholder="Auto-generated identifier" />
                  <Button type="button" variant="outline" size="sm" onClick={generateQr}>Generate</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Printable QR labels use this value — wire up a QR renderer (e.g. qrcode.react) wherever labels are printed.</p>
              </div>
              <div>
                <Label>Serial Number</Label>
                <Input value={form.serial_number} onChange={f("serial_number")} />
              </div>
              <div>
                <Label>Batch Number</Label>
                <Input value={form.batch_number} onChange={f("batch_number")} />
              </div>

              <div className="col-span-2 border-t pt-3 mt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="individually-tracked"
                    checked={form.is_individually_tracked}
                    onChange={(e) => setForm({ ...form, is_individually_tracked: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="individually-tracked" className="mb-0 cursor-pointer">
                    Track as individual assets (desks, lockers, beds, chairs…)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Generates one numbered asset per unit — e.g. Opening Qty 300 with prefix "TBL" creates SCHOOLCODE-TBL-0001 … 0300, each independently assignable to a student. See the new "Assets" tab after saving.
                </p>
                {form.is_individually_tracked && (
                  <div className="mt-2">
                    <Label>Asset Tag Prefix *</Label>
                    <Input value={form.asset_tag_prefix} onChange={f("asset_tag_prefix")} placeholder="e.g. TBL, LKR, BED" className="max-w-[200px]" />
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Details ── */}
          <TabsContent value="details" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={f("manufacturer")} /></div>
              <div><Label>Brand</Label><Input value={form.brand} onChange={f("brand")} /></div>
              <div><Label>Model</Label><Input value={form.model} onChange={f("model")} /></div>
              <div><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={f("purchase_date")} /></div>
              <div><Label>Warranty Expiry</Label><Input type="date" value={form.warranty_expiry} onChange={f("warranty_expiry")} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={f("expiry_date")} /></div>
            </div>
          </TabsContent>

          {/* ── Location ── */}
          <TabsContent value="location" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Store</Label>
                <Select value={form.store_id} onValueChange={(v) => setForm({ ...form, store_id: v })}>
                  <SelectTrigger><SelectValue placeholder={stores.length ? "Select store" : "No stores set up yet"} /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Storage Location (legacy free text)</Label><Input value={form.location} onChange={f("location")} placeholder="e.g. Store Room B" /></div>
              <div><Label>Room</Label><Input value={form.room} onChange={f("room")} /></div>
              <div><Label>Shelf</Label><Input value={form.shelf} onChange={f("shelf")} /></div>
              <div><Label>Bin</Label><Input value={form.bin} onChange={f("bin")} /></div>
              <div><Label>Rack</Label><Input value={form.rack} onChange={f("rack")} /></div>
              <div><Label>Floor</Label><Input value={form.floor} onChange={f("floor")} /></div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!form.name || (form.is_individually_tracked && !form.asset_tag_prefix) || m.isPending}
            onClick={() => m.mutate()}
          >
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Supplier dialog ──────────────────────────────────────────────────────────
function SupplierDialog({ schoolId }: { schoolId: string }) {
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
function ReceiptDialog({ schoolId, items, suppliers }: { schoolId: string; items: any[]; suppliers: any[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", supplier_id: "", qty: 1, unit_cost: 0 });
  const qc = useQueryClient();
  const { user } = useAuth();

  const m = useMutation({
    mutationFn: async () => {
      if (!form.item_id) throw new Error("Pick an item");
      const { error: insErr } = await supabase.from("inventory_receipts").insert({
        school_id: schoolId, item_id: form.item_id,
        supplier_id: form.supplier_id || null,
        qty: form.qty, unit_cost: form.unit_cost || null,
        received_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      const item = items.find((i) => i.id === form.item_id);
      const { error: updErr } = await supabase.from("inventory_items")
        .update({ current_qty: (item?.current_qty ?? 0) + form.qty })
        .eq("id", form.item_id);
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
                Current stock: <strong>{selectedItem.current_qty}</strong> {selectedItem.unit} · {categoryLabel(selectedItem.category ?? "general")}
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

// ─── Issue dialog ─────────────────────────────────────────────────────────────
function IssueDialog({ schoolId, items, classes }: { schoolId: string; items: any[]; classes: any[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", qty: 1, destination: "", class_id: "", staff_name: "", notes: "" });
  const qc = useQueryClient();
  const { user } = useAuth();

  const destDef = ISSUE_DESTINATIONS.find(d => d.value === form.destination);

  // Canonical hook — checks BOTH status and lifecycle_status, uses the real
  // `admission_no` column, and matches the same active-student definition
  // used across library, attendance, clinic, discipline, marks, etc.
  const studentsQ = useActiveStudents({
    classId: form.destination === "class" && form.class_id ? form.class_id : null,
    enabled: form.destination === "class" && !!form.class_id,
  });

  const selectedClass = classes.find(c => c.id === form.class_id);
  const selectedItem = items.find(i => i.id === form.item_id);
  const studentCount = studentsQ.data?.length ?? 0;

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
        school_id: schoolId, item_id: form.item_id, qty: form.qty,
        issued_to: buildIssuedTo(), notes: form.notes || null, issued_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
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

          <div>
            <Label>Destination *</Label>
            <Select value={form.destination} onValueChange={handleDestChange}>
              <SelectTrigger><SelectValue placeholder="Where is this going?" /></SelectTrigger>
              <SelectContent>
                {ISSUE_DESTINATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destDef && <p className="text-xs text-muted-foreground mt-1">{destDef.hint}</p>}
          </div>

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
                        <span className="ml-2 text-xs text-muted-foreground">· {cls.students[0].count} students</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.class_id && (
                <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                  <p className="font-medium">{selectedClass?.name}</p>
                  {studentsQ.isLoading ? (
                    <p className="text-muted-foreground text-xs">Loading students…</p>
                  ) : studentsQ.error ? (
                    <p className="text-destructive text-xs">{(studentsQ.error as Error).message}</p>
                  ) : (
                    <>
                      <p className="text-muted-foreground text-xs">
                        <strong>{studentCount}</strong> active student{studentCount !== 1 ? "s" : ""}
                        {studentCount > 0 && ` — suggested qty: ${studentCount} (1 per student)`}
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
                        <Button type="button" size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => setForm(f => ({ ...f, qty: studentCount }))}>
                          Set qty to {studentCount} (1 per student)
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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
                          {i.name} <span className="text-xs text-muted-foreground ml-1">({i.current_qty} {i.unit})</span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {otherItems.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-b mt-1">Other items</div>
                      {otherItems.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name} <span className="text-xs text-muted-foreground ml-1">({i.current_qty} {i.unit})</span>
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

          {form.item_id && (
            <div>
              <Label>Quantity *</Label>
              <Input
                type="number" min={1} max={selectedItem?.current_qty ?? undefined}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value === "" ? 0 : Number(e.target.value) })}
              />
              {selectedItem && form.qty > selectedItem.current_qty && (
                <p className="text-xs text-destructive mt-1">Exceeds available stock ({selectedItem.current_qty})</p>
              )}
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional — purpose, reference number, etc." rows={2} />
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
