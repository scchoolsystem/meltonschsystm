import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/kitchen")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canManageStock = isAdmin || hasRole("kitchen_admin");
  const canPostMeal = canManageStock || hasRole("kitchen_user");
  const [stockOpen, setStockOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);

  const { data: stock = [] } = useQuery({
    queryKey: ["kitchen-stock"],
    queryFn: async () => (await supabase.from("kitchen_stock").select("*").order("item")).data ?? [],
  });
  const { data: meals = [] } = useQuery({
    queryKey: ["meal-plans"],
    queryFn: async () => (await supabase.from("meal_plans").select("*").order("meal_date", { ascending: false }).limit(50)).data ?? [],
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Kitchen</h1>
        <p className="text-sm text-muted-foreground mt-1">Meal plans and pantry stock.</p>
      </div>

      <Tabs defaultValue="meals">
        <TabsList>
          <TabsTrigger value="meals">Meal Plans</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="meals">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="text-base">Recent meals</CardTitle>
              {canPostMeal && (
                <Dialog open={mealOpen} onOpenChange={setMealOpen}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Log meal</Button></DialogTrigger>
                  <AddMeal onDone={() => { setMealOpen(false); qc.invalidateQueries({ queryKey: ["meal-plans"] }); }} />
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Meal</TableHead><TableHead>Menu</TableHead><TableHead className="text-right">Served</TableHead></TableRow></TableHeader>
                <TableBody>
                  {meals.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No meals logged.</TableCell></TableRow>}
                  {(meals as any[]).map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{m.meal_date}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{m.meal}</Badge></TableCell>
                      <TableCell>{m.menu}</TableCell>
                      <TableCell className="text-right">{m.served_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="text-base">Pantry stock</CardTitle>
              {canManageStock && (
                <Dialog open={stockOpen} onOpenChange={setStockOpen}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add item</Button></DialogTrigger>
                  <AddStock onDone={() => { setStockOpen(false); qc.invalidateQueries({ queryKey: ["kitchen-stock"] }); }} />
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Threshold</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {stock.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No stock items.</TableCell></TableRow>}
                  {(stock as any[]).map(s => {
                    const low = Number(s.quantity) <= Number(s.low_threshold);
                    return (
                      <TableRow key={s.id} className={low ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">{s.item}</TableCell>
                        <TableCell className="font-mono">{s.quantity}</TableCell>
                        <TableCell>{s.unit}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.low_threshold}</TableCell>
                        <TableCell>{low && <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />Low</Badge>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddMeal({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ meal_date: new Date().toISOString().slice(0, 10), meal: "lunch", menu: "", served_count: 0 });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("meal_plans").insert({ ...f, posted_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Meal logged"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Log meal</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={f.meal_date} onChange={e => setF({ ...f, meal_date: e.target.value })} /></div>
          <div><Label>Meal</Label>
            <Select value={f.meal} onValueChange={v => setF({ ...f, meal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="breakfast">Breakfast</SelectItem>
                <SelectItem value="lunch">Lunch</SelectItem>
                <SelectItem value="snack">Snack</SelectItem>
                <SelectItem value="supper">Supper</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Menu</Label><Input value={f.menu} onChange={e => setF({ ...f, menu: e.target.value })} placeholder="Ugali, beef stew, sukuma" required /></div>
        <div><Label>Served count</Label><Input type="number" min={0} value={f.served_count} onChange={e => setF({ ...f, served_count: +e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.menu}>{m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function AddStock({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ item: "", quantity: 0, unit: "kg", low_threshold: 0 });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("kitchen_stock").insert(f); if (error) throw error;
    },
    onSuccess: () => { toast.success("Stock added"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add stock item</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Item</Label><Input value={f.item} onChange={e => setF({ ...f, item: e.target.value })} required /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Qty</Label><Input type="number" step="0.01" value={f.quantity} onChange={e => setF({ ...f, quantity: +e.target.value })} /></div>
          <div><Label>Unit</Label><Input value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} /></div>
          <div><Label>Low @</Label><Input type="number" step="0.01" value={f.low_threshold} onChange={e => setF({ ...f, low_threshold: +e.target.value })} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.item}>{m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
