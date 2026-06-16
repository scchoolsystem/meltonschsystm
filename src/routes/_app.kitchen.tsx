import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Utensils, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format, startOfWeek, addDays } from "date-fns";

export const Route = createFileRoute("/_app/kitchen")({ component: () => (<FeatureGate feature="kitchen"><Page /></FeatureGate>) });

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("kitchen_admin") || hasRole("kitchen_user");
  const [addMeal, setAddMeal] = useState(false);
  const [addStock, setAddStock] = useState(false);
  const [plannerCell, setPlannerCell] = useState<{ date: string; type: string } | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));

  const { data: meals = [], isLoading: mLoading } = useQuery({
    queryKey: ["meal-plans"],
    queryFn: async () => (await supabase.from("meal_plans").select("*").order("meal_date", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: stock = [], isLoading: sLoading } = useQuery({
    queryKey: ["kitchen-stock"],
    queryFn: async () => (await supabase.from("kitchen_stock").select("*").order("item_name")).data ?? [],
  });
  const { data: boarderCount } = useQuery({
    queryKey: ["boarder-count"],
    queryFn: async () => {
      const { count } = await supabase.from("dorm_assignments").select("id", { count: "exact", head: true }).eq("active", true);
      return count ?? 0;
    },
  });

  const lowStock = useMemo(() => (stock as any[]).filter(s => s.quantity <= s.reorder_level), [stock]);
  const todayMeals = useMemo(() => (meals as any[]).filter(m => m.meal_date === today), [meals, today]);
  const totalServedToday = useMemo(() => todayMeals.reduce((sum: number, m: any) => sum + (m.served_count ?? 0), 0), [todayMeals]);
  const totalCostToday = useMemo(() => todayMeals.reduce((sum: number, m: any) => sum + ((m.cost_per_meal ?? 0) * (m.served_count ?? 0)), 0), [todayMeals]);

  const weeklyGrid = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};
    for (const d of weekDates) map[d] = {};
    for (const m of meals as any[]) {
      if (weekDates.includes(m.meal_date)) map[m.meal_date][m.meal_type] = m;
    }
    return map;
  }, [meals, weekDates]);

  const plannerMutation = useMutation({
    mutationFn: async ({ date, type, menu, cost_per_meal }: any) => {
      const existing = weeklyGrid[date]?.[type];
      if (existing) {
        const { error } = await supabase.from("meal_plans").update({ menu, cost_per_meal: cost_per_meal || null }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("meal_plans").insert({ meal_date: date, meal_type: type, menu, cost_per_meal: cost_per_meal || null, logged_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meal-plans"] }); toast.success("Meal saved"); setPlannerCell(null); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-3xl font-bold">Kitchen</h1><p className="text-sm text-muted-foreground mt-1">Meal plans & stock management</p></div>
        {can && (
          <div className="flex gap-2 flex-wrap">
            <Dialog open={addMeal} onOpenChange={setAddMeal}><DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Log Meal</Button></DialogTrigger>
              <MealDialog onDone={() => { setAddMeal(false); qc.invalidateQueries({ queryKey: ["meal-plans"] }); }} />
            </Dialog>
            <Dialog open={addStock} onOpenChange={setAddStock}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Stock Item</Button></DialogTrigger>
              <StockDialog onDone={() => { setAddStock(false); qc.invalidateQueries({ queryKey: ["kitchen-stock"] }); }} />
            </Dialog>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Boarders" value={String(boarderCount ?? "—")} hint="active dorm assignments" />
        <StatCard label="Served Today" value={String(totalServedToday)} hint="across all meals" />
        {totalCostToday > 0 && <StatCard label="Daily Food Cost" value={`KES ${totalCostToday.toLocaleString()}`} hint="based on cost × served" />}
        <StatCard label="Low Stock" value={String(lowStock.length)} hint="items at or below reorder level" warn={lowStock.length > 0} />
      </div>

      <Tabs defaultValue="planner">
        <TabsList>
          <TabsTrigger value="planner">Weekly Planner</TabsTrigger>
          <TabsTrigger value="log">Meal Log</TabsTrigger>
          <TabsTrigger value="stock">
            Stock
            {lowStock.length > 0 && <Badge variant="destructive" className="ml-2">{lowStock.length} low</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planner">
          <Card><CardContent className="pt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2 text-muted-foreground w-24">Meal</th>
                  {weekDates.map((d, i) => (
                    <th key={d} className="p-2 text-center font-medium">
                      <div>{DAYS[i]}</div>
                      <div className={`text-xs ${d === today ? "text-primary font-bold" : "text-muted-foreground"}`}>{d.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEAL_TYPES.map(type => (
                  <tr key={type} className="border-t">
                    <td className="p-2 font-medium capitalize">{type}</td>
                    {weekDates.map(date => {
                      const entry = weeklyGrid[date]?.[type];
                      return (
                        <td key={date} className="p-2 text-center">
                          {can ? (
                            <button
                              className={`w-full min-h-[48px] rounded border text-xs p-1 transition-colors ${entry ? "bg-primary/5 border-primary/30 hover:bg-primary/10" : "border-dashed border-muted-foreground/30 hover:border-primary/50 text-muted-foreground"}`}
                              onClick={() => setPlannerCell({ date, type })}
                            >
                              {entry?.menu ?? <Plus className="w-3 h-3 mx-auto opacity-40" />}
                            </button>
                          ) : (
                            <div className="min-h-[48px] text-xs p-1">{entry?.menu ?? ""}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>

          <Dialog open={!!plannerCell} onOpenChange={o => !o && setPlannerCell(null)}>
            {plannerCell && (
              <PlannerCellDialog
                date={plannerCell.date}
                type={plannerCell.type}
                existing={weeklyGrid[plannerCell.date]?.[plannerCell.type]}
                onSave={(menu, cost) => plannerMutation.mutate({ date: plannerCell.date, type: plannerCell.type, menu, cost_per_meal: cost })}
              />
            )}
          </Dialog>
        </TabsContent>

        <TabsContent value="log">
          <Card><CardHeader /><CardContent>
            {mLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Meal</TableHead><TableHead>Menu</TableHead><TableHead>Served</TableHead><TableHead>Cost/Meal</TableHead><TableHead>Total Cost</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(meals as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No meal plans logged yet.</TableCell></TableRow>}
                  {(meals as any[]).map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.meal_date}</TableCell>
                      <TableCell className="capitalize">{m.meal_type}</TableCell>
                      <TableCell>{m.menu}</TableCell>
                      <TableCell>{m.served_count ?? "—"}</TableCell>
                      <TableCell>{m.cost_per_meal != null ? `KES ${m.cost_per_meal}` : "—"}</TableCell>
                      <TableCell>{m.cost_per_meal != null && m.served_count != null ? `KES ${(m.cost_per_meal * m.served_count).toLocaleString()}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="stock">
          {lowStock.length > 0 && (
            <div className="mb-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {lowStock.length} item(s) at or below reorder level: {lowStock.map((s: any) => s.item_name).join(", ")}
            </div>
          )}
          <Card><CardHeader /><CardContent>
            {sLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Unit</TableHead><TableHead>Reorder Level</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(stock as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No stock items.</TableCell></TableRow>}
                  {(stock as any[]).map((s: any) => {
                    const isLow = s.quantity <= s.reorder_level;
                    return (
                      <TableRow key={s.id} className={isLow ? "bg-red-50" : ""}>
                        <TableCell className="font-medium">{s.item_name}</TableCell>
                        <TableCell className={isLow ? "text-red-700 font-bold" : ""}>{s.quantity}</TableCell>
                        <TableCell>{s.unit ?? "—"}</TableCell>
                        <TableCell>{s.reorder_level ?? "—"}</TableCell>
                        <TableCell>{isLow ? <Badge variant="destructive" className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Low Stock</Badge> : <Badge variant="secondary">OK</Badge>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, hint, warn = false }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <Card className={warn ? "border-red-300" : ""}>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${warn ? "text-red-600" : ""}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function PlannerCellDialog({ date, type, existing, onSave }: { date: string; type: string; existing?: any; onSave: (menu: string, cost: string) => void }) {
  const [menu, setMenu] = useState(existing?.menu ?? "");
  const [cost, setCost] = useState(existing?.cost_per_meal ?? "");
  return (
    <DialogContent><DialogHeader><DialogTitle className="capitalize">{type} — {date}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Menu</Label><Input value={menu} onChange={e => setMenu(e.target.value)} placeholder="e.g. Rice, beans, cabbage" /></div>
        <div><Label>Cost per meal (KES)</Label><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></div>
      </div>
      <DialogFooter><Button onClick={() => onSave(menu, cost)} disabled={!menu}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

function MealDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ meal_date: format(new Date(), "yyyy-MM-dd"), meal_type: "lunch", menu: "", served_count: "", cost_per_meal: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("meal_plans").insert({ ...f, served_count: f.served_count ? Number(f.served_count) : null, cost_per_meal: f.cost_per_meal ? Number(f.cost_per_meal) : null, logged_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Meal logged"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Log Meal</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Date</Label><Input type="date" value={f.meal_date} onChange={e => setF(p => ({ ...p, meal_date: e.target.value }))} /></div>
        <div><Label>Meal Type</Label>
          <Select value={f.meal_type} onValueChange={v => setF(p => ({ ...p, meal_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MEAL_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Menu *</Label><Input required value={f.menu} onChange={e => setF(p => ({ ...p, menu: e.target.value }))} /></div>
        <div><Label>Served Count</Label><Input type="number" value={f.served_count} onChange={e => setF(p => ({ ...p, served_count: e.target.value }))} /></div>
        <div><Label>Cost per Meal (KES)</Label><Input type="number" value={f.cost_per_meal} onChange={e => setF(p => ({ ...p, cost_per_meal: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function StockDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ item_name: "", quantity: "", unit: "", reorder_level: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("kitchen_stock").insert({ ...f, quantity: Number(f.quantity), reorder_level: f.reorder_level ? Number(f.reorder_level) : null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Stock item added"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Add Stock Item</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Item Name *</Label><Input required value={f.item_name} onChange={e => setF(p => ({ ...p, item_name: e.target.value }))} /></div>
        <div><Label>Quantity *</Label><Input required type="number" value={f.quantity} onChange={e => setF(p => ({ ...p, quantity: e.target.value }))} /></div>
        <div><Label>Unit</Label><Input placeholder="kg, litres, bags…" value={f.unit} onChange={e => setF(p => ({ ...p, unit: e.target.value }))} /></div>
        <div><Label>Reorder Level</Label><Input type="number" value={f.reorder_level} onChange={e => setF(p => ({ ...p, reorder_level: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
