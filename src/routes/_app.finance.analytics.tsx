import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getFinanceKpis,
  getMonthlyCollections,
  getClassCollectionRates,
  getTermSummary,
  getFeeDefaulters,
  getPaymentMethodBreakdown,
} from "@/lib/finance-extended.functions";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/_app/finance/analytics")({
  component: () => (
    <FeatureGate feature="finance">
      <Page />
    </FeatureGate>
  ),
});

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];
const TERM_COLORS: Record<string, string> = {
  "Term 1": "#6366f1",
  "Term 2": "#22c55e",
  "Term 3": "#f59e0b",
  Unspecified: "#94a3b8",
};

const CUR = (n: number) =>
  "KES " + Number(n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 0 });

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "text-primary",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-muted ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CollectionRing({ pct }: { pct: number }) {
  const data = [{ value: pct }, { value: 100 - pct }];
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-32 h-32 mx-auto">
      <PieChart width={128} height={128}>
        <Pie data={data} cx={60} cy={60} innerRadius={44} outerRadius={60} startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
          <Cell fill={color} />
          <Cell fill="#1e293b" />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <span className="text-2xl font-bold">{pct}%</span>
        <span className="text-xs text-muted-foreground">collected</span>
      </div>
    </div>
  );
}

function Page() {
  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(year);

  const kpiFn = useServerFn(getFinanceKpis);
  const monthlyFn = useServerFn(getMonthlyCollections);
  const classFn = useServerFn(getClassCollectionRates);
  const termFn = useServerFn(getTermSummary);
  const defaulterFn = useServerFn(getFeeDefaulters);
  const methodFn = useServerFn(getPaymentMethodBreakdown);

  const { data: kpis, isLoading: kLoading } = useQuery({
    queryKey: ["finance-kpis", selectedYear],
    queryFn: () => kpiFn({ data: { year: selectedYear } }),
  });
  const { data: monthly = [], isLoading: mLoading } = useQuery({
    queryKey: ["finance-monthly", selectedYear],
    queryFn: () => monthlyFn({ data: { year: selectedYear } }),
  });
  const { data: classes = [], isLoading: cLoading } = useQuery({
    queryKey: ["finance-classes"],
    queryFn: () => classFn({}),
  });
  const { data: termRows = [], isLoading: tLoading } = useQuery({
    queryKey: ["finance-term", selectedYear],
    queryFn: () => termFn({ data: { year: selectedYear } }),
  });
  const { data: defaulters = [], isLoading: dLoading } = useQuery({
    queryKey: ["finance-defaulters"],
    queryFn: () => defaulterFn({}),
  });
  const { data: methods = [] } = useQuery({
    queryKey: ["finance-methods", selectedYear],
    queryFn: () => methodFn({ data: { year: selectedYear } }),
  });

  // Aggregate monthly for area chart (all methods combined)
  const monthlyAgg = Object.values(
    (monthly as any[]).reduce<Record<string, any>>((acc, r) => {
      const k = r.month_label;
      if (!acc[k]) acc[k] = { month_label: k, total: 0, month: r.month };
      acc[k].total += Number(r.total_collected);
      return acc;
    }, {})
  ).sort((a: any, b: any) => a.month.localeCompare(b.month));

  // Payment method pie
  const methodPie = Object.values(
    (methods as any[]).reduce<Record<string, any>>((acc, r) => {
      const k = r.method;
      if (!acc[k]) acc[k] = { method: k, total: 0 };
      acc[k].total += Number(r.total);
      return acc;
    }, {})
  );

  // Term bar chart (income vs expenses)
  const termChart = (termRows as any[]).map((r) => ({
    term: r.term,
    "Collected": Number(r.total_collected),
    "Expenses": Number(r.total_expenses),
    "Outstanding": Number(r.outstanding),
  }));

  // Class radar (top 8 by outstanding)
  const classRadar = (classes as any[]).slice(0, 8).map((c) => ({
    class: c.class_name,
    "Collection %": Number(c.collection_pct),
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Finance Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">School money — full picture</p>
        </div>
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[year - 1, year, year + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      {kLoading ? (
        <div className="h-24 grid place-items-center"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Total Billed" value={CUR(kpis?.total_billed ?? 0)} icon={DollarSign} />
          <KpiCard label="Collected" value={CUR(kpis?.total_collected ?? 0)} color="text-green-500" icon={TrendingUp} />
          <KpiCard label="Outstanding" value={CUR(kpis?.total_outstanding ?? 0)} color="text-red-500" icon={AlertTriangle} />
          <KpiCard label="Invoices" value={String(kpis?.invoice_count ?? 0)} sub={`${kpis?.paid_count ?? 0} paid`} icon={CheckCircle} />
          <KpiCard label="Partial" value={String(kpis?.partial_count ?? 0)} color="text-yellow-500" icon={Clock} />
          <KpiCard label="Defaulters" value={String(defaulters.length)} color="text-red-500" icon={AlertTriangle} />
        </div>
      )}

      <Tabs defaultValue="collections">
        <TabsList className="flex-wrap gap-1 h-auto">
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="terms">Term P&L</TabsTrigger>
          <TabsTrigger value="classes">By Class</TabsTrigger>
          <TabsTrigger value="methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
        </TabsList>

        {/* ── Monthly collections area chart ── */}
        <TabsContent value="collections" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Monthly Fee Collections — {selectedYear}</CardTitle></CardHeader>
            <CardContent>
              {mLoading ? <div className="h-64 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyAgg} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="col-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month_label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => CUR(v)} />
                    <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#col-grad)" name="Collected" strokeWidth={2} dot />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Collection ring + term summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Collection Rate</CardTitle></CardHeader>
              <CardContent>
                <CollectionRing pct={Number(kpis?.collection_rate ?? 0)} />
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="font-bold text-green-500">{kpis?.paid_count ?? 0}</div>
                    <div className="text-muted-foreground">Paid</div>
                  </div>
                  <div>
                    <div className="font-bold text-yellow-500">{kpis?.partial_count ?? 0}</div>
                    <div className="text-muted-foreground">Partial</div>
                  </div>
                  <div>
                    <div className="font-bold text-red-500">{kpis?.unpaid_count ?? 0}</div>
                    <div className="text-muted-foreground">Unpaid</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Term Snapshot — {selectedYear}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {tLoading ? <Loader2 className="animate-spin mx-auto" /> : (
                  (termRows as any[]).map((r) => (
                    <div key={r.term} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{r.term}</span>
                        <span className="text-muted-foreground text-xs">{Number(r.collection_pct ?? ((r.total_collected/r.total_billed)*100||0)).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, r.total_billed ? (r.total_collected / r.total_billed) * 100 : 0)}%`,
                            background: TERM_COLORS[r.term] ?? "#6366f1",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{CUR(r.total_collected)} collected</span>
                        <span>{CUR(r.outstanding)} outstanding</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Term P&L bar chart ── */}
        <TabsContent value="terms" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Income vs Expenses by Term — {selectedYear}</CardTitle></CardHeader>
            <CardContent>
              {tLoading ? <div className="h-64 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
                <>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={termChart} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="term" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => CUR(v)} />
                      <Legend />
                      <Bar dataKey="Collected" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table className="mt-4">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Term</TableHead>
                        <TableHead className="text-right">Billed</TableHead>
                        <TableHead className="text-right">Collected</TableHead>
                        <TableHead className="text-right">Expenses</TableHead>
                        <TableHead className="text-right">Net Surplus</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(termRows as any[]).map((r) => (
                        <TableRow key={r.term}>
                          <TableCell className="font-medium">{r.term}</TableCell>
                          <TableCell className="text-right font-mono">{CUR(r.total_billed)}</TableCell>
                          <TableCell className="text-right font-mono text-green-500">{CUR(r.total_collected)}</TableCell>
                          <TableCell className="text-right font-mono text-red-500">{CUR(r.total_expenses)}</TableCell>
                          <TableCell className={`text-right font-mono font-bold ${r.net_surplus >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {CUR(r.net_surplus)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Class collection rates ── */}
        <TabsContent value="classes" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Collection Rate by Class</CardTitle></CardHeader>
              <CardContent>
                {cLoading ? <div className="h-64 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={classRadar}>
                      <PolarGrid stroke="#1e293b" />
                      <PolarAngleAxis dataKey="class" tick={{ fontSize: 10 }} />
                      <Radar dataKey="Collection %" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                      <Tooltip formatter={(v: any) => `${v}%`} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Outstanding by Class</CardTitle></CardHeader>
              <CardContent>
                {cLoading ? <div className="h-64 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={(classes as any[]).slice(0, 10)} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="class_name" width={90} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => CUR(v)} />
                      <Bar dataKey="outstanding" fill="#ef4444" radius={[0, 4, 4, 0]} name="Outstanding" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Class Fee Summary</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(classes as any[]).map((c) => (
                    <TableRow key={c.class_id}>
                      <TableCell className="font-medium">{c.class_name}</TableCell>
                      <TableCell className="text-right">{c.students_invoiced}</TableCell>
                      <TableCell className="text-right font-mono">{CUR(c.total_billed)}</TableCell>
                      <TableCell className="text-right font-mono text-green-500">{CUR(c.total_paid)}</TableCell>
                      <TableCell className="text-right font-mono text-red-500">{CUR(c.outstanding)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            Number(c.collection_pct) >= 80
                              ? "border-green-500 text-green-500"
                              : Number(c.collection_pct) >= 50
                              ? "border-yellow-500 text-yellow-500"
                              : "border-red-500 text-red-500"
                          }
                        >
                          {c.collection_pct}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payment methods ── */}
        <TabsContent value="methods" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Payment Method Mix</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={methodPie} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={100} label={({ method, percent }: any) => `${method} ${(percent * 100).toFixed(0)}%`}>
                      {methodPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => CUR(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {methodPie.map((m: any, i: number) => (
                    <div key={m.method} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="capitalize">{m.method}</span>
                      <span className="ml-auto font-mono text-xs">{CUR(m.total)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Monthly Method Breakdown</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={
                      Object.values(
                        (methods as any[]).reduce<Record<string, any>>((acc, r) => {
                          const k = r.month_short + " " + r.year;
                          if (!acc[k]) acc[k] = { label: r.month_short, sort: r.month_sort };
                          acc[k][r.method] = (acc[k][r.method] ?? 0) + Number(r.total);
                          return acc;
                        }, {})
                      ).sort((a: any, b: any) => a.sort?.localeCompare?.(b.sort))
                    }
                    margin={{ left: 8, right: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => CUR(v)} />
                    <Legend />
                    {["cash", "mpesa", "bank_transfer", "cheque", "card"].map((m, i) => (
                      <Bar key={m} dataKey={m} stackId="a" fill={COLORS[i]} name={m} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Defaulters ── */}
        <TabsContent value="defaulters" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Fee Defaulters (Past Due)</CardTitle>
                <Badge variant="destructive">{defaulters.length} students</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {dLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Adm No</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Days Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(defaulters as any[]).slice(0, 100).map((d) => (
                      <TableRow key={d.invoice_no} className={d.days_overdue > 90 ? "bg-red-500/5" : ""}>
                        <TableCell className="font-medium">{d.student_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.admission_no}</TableCell>
                        <TableCell>{d.class_name}</TableCell>
                        <TableCell className="font-mono text-xs">{d.invoice_no}</TableCell>
                        <TableCell className="text-right font-mono text-red-500">{CUR(d.balance)}</TableCell>
                        <TableCell className="text-xs">{d.due_date}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={d.days_overdue > 90 ? "destructive" : "outline"}>
                            {d.days_overdue}d
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {defaulters.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          🎉 No defaulters — all invoices are within due date
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
