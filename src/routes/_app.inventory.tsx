import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

// Wave 2/3: Inventory module landing page. Tabs over the four inventory
// tables created in 20260614130000_wave3_db_hardening.sql. Read-only for now;
// CRUD lands with the per-tenant scoping policies in a follow-up.
export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

function useInv<T = any>(table: string) {
  return useQuery({
    queryKey: ["inventory", table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

function InventoryPage() {
  const [tab, setTab] = useState("items");
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
        <TabsContent value="items"><InvList table="inventory_items" cols={["sku","name","unit","current_qty","reorder_level"]} /></TabsContent>
        <TabsContent value="receipts"><InvList table="inventory_receipts" cols={["received_at","item_id","qty","unit_cost"]} /></TabsContent>
        <TabsContent value="issues"><InvList table="inventory_issues" cols={["issued_at","item_id","qty","issued_to"]} /></TabsContent>
        <TabsContent value="suppliers"><InvList table="inventory_suppliers" cols={["name","contact","notes"]} /></TabsContent>
      </Tabs>
    </div>
  );
}

function InvList({ table, cols }: { table: string; cols: string[] }) {
  const q = useInv(table);
  return (
    <Card>
      <CardHeader className="flex items-center justify-between flex-row">
        <CardTitle className="capitalize">{table.replace("inventory_", "")}</CardTitle>
        {q.data && <Badge variant="secondary">{q.data.length} rows</Badge>}
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
                <TableRow key={row.id}>{cols.map((c) => <TableCell key={c} className="text-sm">{formatCell(row[c])}</TableCell>)}</TableRow>
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
