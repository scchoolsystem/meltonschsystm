import { createFileRoute, Link } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStudents } from "@/lib/students.functions";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Search, AlertTriangle, BarChart3, Bell, BookOpen, TrendingUp, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format, differenceInDays, subMonths } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

export const Route = createFileRoute("/_app/library")({ component: () => (<FeatureGate feature="library"><Page /></FeatureGate>) });

const FINE_PER_DAY = 5;
const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

function BorrowerCell({ loan }: { loan: any }) {
  if (loan.staff) return (
    <div>
      <Link to="/staff/$id" params={{ id: loan.staff.id }} className="font-medium hover:underline">{loan.staff.first_name} {loan.staff.last_name}</Link>
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Badge variant="outline" className="text-[10px] px-1 py-0">Staff</Badge>{loan.staff.employee_no}{loan.staff.position_title ? ` · ${loan.staff.position_title}` : ""}</div>
    </div>
  );
  if (loan.students) return (
    <div>
      <Link to="/students/$id" params={{ id: loan.students.id }} className="font-medium hover:underline">{loan.students.first_name} {loan.students.last_name}</Link>
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Badge variant="outline" className="text-[10px] px-1 py-0">Student</Badge>{loan.students.admission_no}</div>
    </div>
  );
  return <span className="text-muted-foreground">—</span>;
}

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("librarian") || hasRole("library_admin") || hasRole("library_user");

  const [bookSearch, setBookSearch] = useState("");
  const [loanSearch, setLoanSearch] = useState("");
  const [addBook, setAddBook] = useState(false);
  const [issueLoan, setIssueLoan] = useState(false);

  const { data: books = [], isLoading: bLoading } = useQuery({
    queryKey: ["library-books"],
    queryFn: async () => (await supabase.from("books").select("*").order("title")).data ?? [],
  });
  const { data: loans = [], isLoading: lLoading } = useQuery({
    queryKey: ["library-loans"],
    queryFn: async () => (await supabase.from("book_loans").select("*, books(id,title,author,category), students(id,first_name,last_name,admission_no), staff(id,first_name,last_name,employee_no,position_title)").order("borrowed_on", { ascending: false }).limit(500)).data ?? [],
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const activeLoansSet = useMemo(() => new Set((loans as any[]).filter(l => l.status === "active").map(l => l.book_id)), [loans]);
  const overdueLoans = useMemo(() => (loans as any[]).filter(l => l.status === "active" && l.due_on < today), [loans, today]);

  const filteredBooks = useMemo(() => {
    if (!bookSearch.trim()) return books as any[];
    const q = bookSearch.toLowerCase();
    return (books as any[]).filter(b => b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q) || b.isbn?.toLowerCase().includes(q));
  }, [books, bookSearch]);

  const filteredLoans = useMemo(() => {
    if (!loanSearch.trim()) return loans as any[];
    const q = loanSearch.toLowerCase();
    return (loans as any[]).filter(l => {
      const sn = `${l.students?.first_name ?? ""} ${l.students?.last_name ?? ""}`.toLowerCase();
      const stf = `${l.staff?.first_name ?? ""} ${l.staff?.last_name ?? ""}`.toLowerCase();
      return sn.includes(q) || stf.includes(q) || (l.students?.admission_no ?? "").toLowerCase().includes(q) || (l.staff?.employee_no ?? "").toLowerCase().includes(q);
    });
  }, [loans, loanSearch]);

  // ── Notification: mark overdue reminder sent ────────────────────────────
  const notifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("book_loans").update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library-loans"] }); toast.success("Reminder marked as sent"); },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkNotifyMutation = useMutation({
    mutationFn: async () => {
      const ids = overdueLoans.filter((l: any) => !l.reminder_sent).map((l: any) => l.id);
      if (!ids.length) throw new Error("All overdue borrowers already reminded");
      const { error } = await supabase.from("book_loans").update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => { qc.invalidateQueries({ queryKey: ["library-loans"] }); toast.success(`${count} overdue reminders marked as sent`); },
    onError: (e: any) => toast.error(e.message),
  });

  const returnMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("book_loans").update({ status: "returned", returned_on: today }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library-loans"] }); toast.success("Book returned"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Analytics data ─────────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of books as any[]) {
      const cat = b.category || "Uncategorised";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [books]);

  const monthlyLoans = useMemo(() => {
    const months: Record<string, { month: string; loans: number; returned: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      months[key] = { month: format(d, "MMM"), loans: 0, returned: 0 };
    }
    for (const l of loans as any[]) {
      const key = l.borrowed_on?.slice(0, 7);
      if (months[key]) {
        months[key].loans++;
        if (l.status === "returned") months[key].returned++;
      }
    }
    return Object.values(months);
  }, [loans]);

  const totalFines = overdueLoans.reduce((sum, l: any) => sum + differenceInDays(new Date(), new Date(l.due_on)) * FINE_PER_DAY, 0);
  const pendingReminders = overdueLoans.filter((l: any) => !l.reminder_sent).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">Library</h1>
          <p className="text-sm text-muted-foreground mt-1">{(books as any[]).length} books · {overdueLoans.length} overdue · KES {totalFines.toLocaleString()} in fines</p>
        </div>
        {can && (
          <div className="flex gap-2 flex-wrap">
            {pendingReminders > 0 && (
              <Button variant="outline" onClick={() => bulkNotifyMutation.mutate()} disabled={bulkNotifyMutation.isPending}>
                {bulkNotifyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                Send Reminders ({pendingReminders})
              </Button>
            )}
            <Dialog open={addBook} onOpenChange={setAddBook}>
              <DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Add Book</Button></DialogTrigger>
              <BookDialog onDone={() => { setAddBook(false); qc.invalidateQueries({ queryKey: ["library-books"] }); }} />
            </Dialog>
            <Dialog open={issueLoan} onOpenChange={setIssueLoan}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Issue Loan</Button></DialogTrigger>
              <LoanDialog books={books as any[]} onDone={() => { setIssueLoan(false); qc.invalidateQueries({ queryKey: ["library-loans"] }); }} />
            </Dialog>
          </div>
        )}
      </div>

      <Tabs defaultValue="books">
        <TabsList>
          <TabsTrigger value="books">Books</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue <Badge variant="destructive" className="ml-2">{overdueLoans.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="w-3.5 h-3.5" /> Notifications
            {pendingReminders > 0 && <Badge variant="destructive" className="ml-1">{pendingReminders}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Analytics</TabsTrigger>
        </TabsList>

        {/* ── Books ── */}
        <TabsContent value="books">
          <div className="relative max-w-sm mb-4"><Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search title, author, ISBN…" className="pl-8" value={bookSearch} onChange={e => setBookSearch(e.target.value)} />
          </div>
          <Card><CardHeader /><CardContent>
            {bLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Author</TableHead><TableHead>ISBN</TableHead><TableHead>Category</TableHead><TableHead>Availability</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredBooks.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No books found.</TableCell></TableRow>}
                  {filteredBooks.map((b: any) => {
                    const onLoan = activeLoansSet.has(b.id);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.title}</TableCell>
                        <TableCell>{b.author ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.isbn ?? "—"}</TableCell>
                        <TableCell>{b.category ?? "—"}</TableCell>
                        <TableCell><Badge variant={onLoan ? "secondary" : "default"}>{onLoan ? "On Loan" : "Available"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* ── Loans ── */}
        <TabsContent value="loans">
          <div className="relative max-w-sm mb-4"><Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name, admission no…" className="pl-8" value={loanSearch} onChange={e => setLoanSearch(e.target.value)} />
          </div>
          <Card><CardHeader /><CardContent>
            {lLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Borrower</TableHead><TableHead>Book</TableHead><TableHead>Borrowed</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredLoans.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No loans.</TableCell></TableRow>}
                  {filteredLoans.map((l: any) => {
                    const isOverdue = l.status === "active" && l.due_on < today;
                    return (
                      <TableRow key={l.id} className={isOverdue ? "bg-red-50" : ""}>
                        <TableCell><BorrowerCell loan={l} /></TableCell>
                        <TableCell>{l.books?.title}</TableCell>
                        <TableCell className="text-xs">{l.borrowed_on}</TableCell>
                        <TableCell className={`text-xs ${isOverdue ? "text-red-600 font-medium" : ""}`}>{l.due_on}</TableCell>
                        <TableCell><Badge variant={l.status === "returned" ? "secondary" : isOverdue ? "destructive" : "default"}>{l.status}</Badge></TableCell>
                        <TableCell>{can && l.status === "active" && <Button size="sm" variant="outline" className="h-8" onClick={() => returnMutation.mutate(l.id)}>Return</Button>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* ── Overdue ── */}
        <TabsContent value="overdue">
          {overdueLoans.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No overdue loans. Great!</p> : (
            <Card><CardHeader /><CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Borrower</TableHead><TableHead>Book</TableHead><TableHead>Due Date</TableHead><TableHead>Days Overdue</TableHead><TableHead>Fine (KES)</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overdueLoans.map((l: any) => {
                    const days = differenceInDays(new Date(), new Date(l.due_on));
                    return (
                      <TableRow key={l.id} className="bg-red-50">
                        <TableCell><BorrowerCell loan={l} /></TableCell>
                        <TableCell>{l.books?.title}</TableCell>
                        <TableCell className="text-xs text-red-700">{l.due_on}</TableCell>
                        <TableCell><Badge variant="destructive">{days} day{days !== 1 ? "s" : ""}</Badge></TableCell>
                        <TableCell className="font-medium text-red-700">KES {(days * FINE_PER_DAY).toLocaleString()}</TableCell>
                        <TableCell>{can && <Button size="sm" variant="outline" className="h-8" onClick={() => returnMutation.mutate(l.id)}>Return</Button>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ── Notifications ── */}
        <TabsContent value="notifications" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                <div><p className="text-2xl font-bold">{overdueLoans.length}</p><p className="text-xs text-muted-foreground">Overdue Loans</p></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center"><Bell className="w-5 h-5 text-orange-600" /></div>
                <div><p className="text-2xl font-bold">{pendingReminders}</p><p className="text-xs text-muted-foreground">Reminders Pending</p></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center"><BookOpen className="w-5 h-5 text-red-600" /></div>
                <div><p className="text-2xl font-bold">KES {totalFines.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Fines Accrued</p></div>
              </div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Overdue Reminders</CardTitle></CardHeader>
            <CardContent>
              {overdueLoans.length === 0 ? (
                <div className="text-center py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-8 h-8 text-green-500" /> No overdue loans to notify.
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Borrower</TableHead><TableHead>Book</TableHead><TableHead>Days Overdue</TableHead><TableHead>Fine</TableHead><TableHead>Reminder</TableHead><TableHead>Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {overdueLoans.map((l: any) => {
                      const days = differenceInDays(new Date(), new Date(l.due_on));
                      return (
                        <TableRow key={l.id} className={!l.reminder_sent ? "bg-orange-50" : ""}>
                          <TableCell><BorrowerCell loan={l} /></TableCell>
                          <TableCell>{l.books?.title}</TableCell>
                          <TableCell><Badge variant="destructive">{days}d</Badge></TableCell>
                          <TableCell className="text-red-700 font-medium text-sm">KES {(days * FINE_PER_DAY).toLocaleString()}</TableCell>
                          <TableCell>
                            {l.reminder_sent ? (
                              <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />{l.reminder_sent_at?.slice(0, 10)}</span>
                            ) : (
                              <Badge variant="outline" className="text-orange-600 border-orange-300">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {can && !l.reminder_sent && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => notifyMutation.mutate(l.id)} disabled={notifyMutation.isPending}>
                                <Bell className="w-3 h-3" /> Mark Sent
                              </Button>
                            )}
                            {can && l.status === "active" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs ml-1" onClick={() => returnMutation.mutate(l.id)}>Return</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics ── */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Books", value: (books as any[]).length, color: "text-blue-500", bg: "bg-blue-50", icon: BookOpen },
              { label: "Active Loans", value: (loans as any[]).filter(l => (l as any).status === "active").length, color: "text-green-500", bg: "bg-green-50", icon: TrendingUp },
              { label: "Overdue", value: overdueLoans.length, color: "text-red-500", bg: "bg-red-50", icon: AlertTriangle },
              { label: "Total Fines", value: `KES ${totalFines.toLocaleString()}`, color: "text-orange-500", bg: "bg-orange-50", icon: Bell },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <Card key={label}><CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full ${bg} flex items-center justify-center`}><Icon className={`w-5 h-5 ${color}`} /></div>
                  <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
                </div>
              </CardContent></Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" />Monthly Loans vs Returns</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyLoans}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="loans" stroke="#6366f1" strokeWidth={2} name="Issued" dot={false} />
                    <Line type="monotone" dataKey="returned" stroke="#22c55e" strokeWidth={2} name="Returned" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" />Books by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                      {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Most Borrowed Books</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const counts: Record<string, { title: string; count: number }> = {};
                  for (const l of loans as any[]) {
                    const bid = l.book_id;
                    if (!bid) continue;
                    if (!counts[bid]) counts[bid] = { title: l.books?.title ?? "Unknown", count: 0 };
                    counts[bid].count++;
                  }
                  const topBooks = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
                  return topBooks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No loan data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={topBooks}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="title" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Times Borrowed" />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BookDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ title: "", author: "", isbn: "", category: "", copies_total: "1" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("books").insert({ ...f, copies_total: Number(f.copies_total) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Book added"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Add Book</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Title *</Label><Input required value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} /></div>
        <div><Label>Author</Label><Input value={f.author} onChange={e => setF(p => ({ ...p, author: e.target.value }))} /></div>
        <div><Label>ISBN</Label><Input value={f.isbn} onChange={e => setF(p => ({ ...p, isbn: e.target.value }))} /></div>
        <div><Label>Category</Label><Input value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))} /></div>
        <div><Label>Copies</Label><Input type="number" min={1} value={f.copies_total} onChange={e => setF(p => ({ ...p, copies_total: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function LoanDialog({ books, onDone }: { books: any[]; onDone: () => void }) {
  const [borrowerType, setBorrowerType] = useState<"student" | "staff">("student");
  const [classFilter, setClassFilter] = useState("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [bookCategoryFilter, setBookCategoryFilter] = useState("all");
  const [bookSearch, setBookSearch] = useState("");
  const [f, setF] = useState({ student_id: "", staff_id: "", book_id: "", borrowed_on: format(new Date(), "yyyy-MM-dd"), due_on: "" });

  // Full active roster (unfiltered) just to build the class dropdown options.
  const { data: allStudents = [] } = useActiveStudents();
  // Server-side filtered roster for the picker itself — only refetches when classFilter changes.
  const { data: students = [] } = useActiveStudents({ classId: classFilter === "all" ? null : classFilter });

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-min-library"], queryFn: async () => (await supabase.from("staff").select("id,employee_no,first_name,last_name,position_title").order("first_name")).data ?? [] });

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allStudents as any[]) {
      if (s.class_id && s.classes?.name) map.set(s.class_id, s.classes.name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1])); // [classId, className][]
  }, [allStudents]);

  const bookCategoryOptions = useMemo(() => {
    const set = new Set((books as any[]).map(b => b.category || "Uncategorised"));
    return Array.from(set).sort();
  }, [books]);

  const filteredBooksForLoan = useMemo(() => {
    let list = books as any[];
    if (bookCategoryFilter !== "all") list = list.filter(b => (b.category || "Uncategorised") === bookCategoryFilter);
    if (bookSearch.trim()) {
      const q = bookSearch.toLowerCase();
      list = list.filter(b => b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q) || b.isbn?.toLowerCase().includes(q));
    }
    return list;
  }, [books, bookCategoryFilter, bookSearch]);

  const filteredStaff = useMemo(() => {
    if (!staffSearch.trim()) return staffList as any[];
    const q = staffSearch.toLowerCase();
    return (staffList as any[]).filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.position_title ?? "").toLowerCase().includes(q) ||
      (s.employee_no ?? "").toLowerCase().includes(q)
    );
  }, [staffList, staffSearch]);

  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { book_id: f.book_id, borrowed_on: f.borrowed_on, due_on: f.due_on, status: "active", student_id: borrowerType === "student" ? f.student_id : null, staff_id: borrowerType === "staff" ? f.staff_id : null };
      const { error } = await supabase.from("book_loans").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Loan issued"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  const borrowerChosen = borrowerType === "student" ? !!f.student_id : !!f.staff_id;

  return (
    <DialogContent><DialogHeader><DialogTitle>Issue Loan</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Borrower Type</Label>
          <Select value={borrowerType} onValueChange={(v: "student" | "staff") => { setBorrowerType(v); setF(p => ({ ...p, student_id: "", staff_id: "" })); setClassFilter("all"); setStaffSearch(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="student">Student</SelectItem><SelectItem value="staff">Staff / Teacher</SelectItem></SelectContent>
          </Select>
        </div>

        {borrowerType === "student" ? (
          <>
            <div><Label>Class</Label>
              <Select value={classFilter} onValueChange={v => { setClassFilter(v); setF(p => ({ ...p, student_id: "" })); }}>
                <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Student ({(students as any[]).length})</Label>
              <Select value={f.student_id} onValueChange={v => setF(p => ({ ...p, student_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
                <SelectContent>
                  {(students as any[]).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No students in this class.</div>}
                  {(students as any[]).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <>
            <div><Label>Search Staff</Label>
              <Input placeholder="Name, position, or staff no…" value={staffSearch} onChange={e => setStaffSearch(e.target.value)} />
            </div>
            <div><Label>Staff / Teacher ({filteredStaff.length})</Label>
              <Select value={f.staff_id} onValueChange={v => setF(p => ({ ...p, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose staff member" /></SelectTrigger>
                <SelectContent>{filteredStaff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.employee_no} – {s.first_name} {s.last_name}{s.position_title ? ` (${s.position_title})` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </>
        )}

        <div><Label>Book Category</Label>
          <Select value={bookCategoryFilter} onValueChange={v => { setBookCategoryFilter(v); setF(p => ({ ...p, book_id: "" })); }}>
            <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {bookCategoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Search Book</Label>
          <Input placeholder="Title, author, or ISBN…" value={bookSearch} onChange={e => setBookSearch(e.target.value)} />
        </div>
        <div><Label>Book ({filteredBooksForLoan.length})</Label>
          <Select value={f.book_id} onValueChange={v => setF(p => ({ ...p, book_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Choose book" /></SelectTrigger>
            <SelectContent>
              {filteredBooksForLoan.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No books match.</div>}
              {filteredBooksForLoan.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}{b.author ? ` — ${b.author}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Borrowed Date</Label><Input type="date" value={f.borrowed_on} onChange={e => setF(p => ({ ...p, borrowed_on: e.target.value }))} /></div>
        <div><Label>Due Date *</Label><Input required type="date" value={f.due_on} onChange={e => setF(p => ({ ...p, due_on: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !borrowerChosen || !f.book_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Issue</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
