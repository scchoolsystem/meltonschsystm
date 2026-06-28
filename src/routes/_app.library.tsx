import { createFileRoute, Link } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStudents } from "@/lib/students.functions";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { format, differenceInDays } from "date-fns";

export const Route = createFileRoute("/_app/library")({ component: () => (<FeatureGate feature="library"><Page /></FeatureGate>) });

const FINE_PER_DAY = 5; // KES — ideally from school settings

function BorrowerCell({ loan }: { loan: any }) {
  if (loan.staff) {
    return (
      <div>
        <Link to="/staff/$id" params={{ id: loan.staff.id }} className="font-medium hover:underline">
          {loan.staff.first_name} {loan.staff.last_name}
        </Link>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] px-1 py-0">Staff</Badge>
          {loan.staff.employee_no}{loan.staff.position_title ? ` · ${loan.staff.position_title}` : ""}
        </div>
      </div>
    );
  }
  if (loan.students) {
    return (
      <div>
        <Link to="/students/$id" params={{ id: loan.students.id }} className="font-medium hover:underline">
          {loan.students.first_name} {loan.students.last_name}
        </Link>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] px-1 py-0">Student</Badge>
          {loan.students.admission_no}
        </div>
      </div>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { school } = useTenant();
  const schoolId = school?.id;
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
    queryFn: async () => (await supabase.from("book_loans").select("*, books(title,author), students(id,first_name,last_name,admission_no), staff(id,first_name,last_name,employee_no,position_title)").order("borrowed_on", { ascending: false }).limit(200)).data ?? [],
  });

  const today = format(new Date(), "yyyy-MM-dd");

  // Compute active loan set for availability
  const activeLoansSet = useMemo(() => new Set((loans as any[]).filter(l => l.status === "active").map(l => l.book_id)), [loans]);

  const filteredBooks = useMemo(() => {
    if (!bookSearch.trim()) return books as any[];
    const q = bookSearch.toLowerCase();
    return (books as any[]).filter(b => b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q) || b.isbn?.toLowerCase().includes(q));
  }, [books, bookSearch]);

  const filteredLoans = useMemo(() => {
    if (!loanSearch.trim()) return loans as any[];
    const q = loanSearch.toLowerCase();
    return (loans as any[]).filter(l => {
      const studentName = `${l.students?.first_name ?? ""} ${l.students?.last_name ?? ""}`.toLowerCase();
      const staffName = `${l.staff?.first_name ?? ""} ${l.staff?.last_name ?? ""}`.toLowerCase();
      const adm = (l.students?.admission_no ?? "").toLowerCase();
      const emp = (l.staff?.employee_no ?? "").toLowerCase();
      return studentName.includes(q) || staffName.includes(q) || adm.includes(q) || emp.includes(q);
    });
  }, [loans, loanSearch]);

  const overdueLoans = useMemo(() => (loans as any[]).filter(l => l.status === "active" && l.due_on < today), [loans, today]);

  const returnMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("book_loans").update({ status: "returned", returned_on: today }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library-loans"] }); toast.success("Book returned"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-3xl font-bold">Library</h1><p className="text-sm text-muted-foreground mt-1">{(books as any[]).length} books · {overdueLoans.length} overdue</p></div>
        {can && (
          <div className="flex gap-2">
            <Dialog open={addBook} onOpenChange={setAddBook}><DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Add Book</Button></DialogTrigger>
              <BookDialog schoolId={schoolId} onDone={() => { setAddBook(false); qc.invalidateQueries({ queryKey: ["library-books"] }); }} />
            </Dialog>
            <Dialog open={issueLoan} onOpenChange={setIssueLoan}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Issue Loan</Button></DialogTrigger>
              <LoanDialog schoolId={schoolId} books={books as any[]} onDone={() => { setIssueLoan(false); qc.invalidateQueries({ queryKey: ["library-loans"] }); }} />
            </Dialog>
          </div>
        )}
      </div>

      <Tabs defaultValue="books">
        <TabsList>
          <TabsTrigger value="books">Books</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="overdue">Overdue <Badge variant="destructive" className="ml-2">{overdueLoans.length}</Badge></TabsTrigger>
        </TabsList>

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

        <TabsContent value="loans">
          <div className="relative max-w-sm mb-4"><Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by student name…" className="pl-8" value={loanSearch} onChange={e => setLoanSearch(e.target.value)} />
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

        <TabsContent value="overdue">
          {overdueLoans.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No overdue loans. Great!</p>}
          {overdueLoans.length > 0 && (
            <Card><CardHeader /><CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Borrower</TableHead><TableHead>Book</TableHead><TableHead>Due Date</TableHead><TableHead>Days Overdue</TableHead><TableHead>Fine (KES)</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overdueLoans.map((l: any) => {
                    const days = differenceInDays(new Date(), new Date(l.due_on));
                    const fine = days * FINE_PER_DAY;
                    return (
                      <TableRow key={l.id} className="bg-red-50">
                        <TableCell><BorrowerCell loan={l} /></TableCell>
                        <TableCell>{l.books?.title}</TableCell>
                        <TableCell className="text-xs text-red-700">{l.due_on}</TableCell>
                        <TableCell><Badge variant="destructive">{days} day{days !== 1 ? "s" : ""}</Badge></TableCell>
                        <TableCell className="font-medium text-red-700">KES {fine.toLocaleString()}</TableCell>
                        <TableCell>{can && <Button size="sm" variant="outline" className="h-8" onClick={() => returnMutation.mutate(l.id)}>Return</Button>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BookDialog({ onDone, schoolId }: { onDone: () => void; schoolId?: string }) {
  const [f, setF] = useState({ title: "", author: "", isbn: "", category: "", copies_total: "1" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("books").insert({ ...f, copies_total: Number(f.copies_total), school_id: schoolId });
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

function LoanDialog({ books, onDone, schoolId }: { books: any[]; onDone: () => void; schoolId?: string }) {
  const [borrowerType, setBorrowerType] = useState<"student" | "staff">("student");
  const [f, setF] = useState({ student_id: "", staff_id: "", book_id: "", borrowed_on: format(new Date(), "yyyy-MM-dd"), due_on: "" });
  const { data: students = [] } = useActiveStudents();
  const { data: staffList = [] } = useQuery({ queryKey: ["staff-min-library"], queryFn: async () => (await supabase.from("staff").select("id,employee_no,first_name,last_name,position_title").order("first_name")).data ?? [] });
  const m = useMutation({
    mutationFn: async () => {
      const payload: any = {
        book_id: f.book_id,
        borrowed_on: f.borrowed_on,
        due_on: f.due_on,
        status: "active",
        student_id: borrowerType === "student" ? f.student_id : null,
        staff_id: borrowerType === "staff" ? f.staff_id : null,
        school_id: schoolId,
      };
      const { error } = await supabase.from("book_loans").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Loan issued"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  const borrowerChosen = borrowerType === "student" ? !!f.student_id : !!f.staff_id;
  return (
    <DialogContent><DialogHeader><DialogTitle>Issue Loan</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div>
          <Label>Borrower Type</Label>
          <Select value={borrowerType} onValueChange={(v: "student" | "staff") => { setBorrowerType(v); setF(p => ({ ...p, student_id: "", staff_id: "" })); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="staff">Staff / Teacher</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {borrowerType === "student" ? (
          <div><Label>Student</Label>
            <Select value={f.student_id} onValueChange={v => setF(p => ({ ...p, student_id: v }))}><SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
              <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div><Label>Staff / Teacher</Label>
            <Select value={f.staff_id} onValueChange={v => setF(p => ({ ...p, staff_id: v }))}><SelectTrigger><SelectValue placeholder="Choose staff member" /></SelectTrigger>
              <SelectContent>{(staffList as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.employee_no} – {s.first_name} {s.last_name}{s.position_title ? ` (${s.position_title})` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div><Label>Book</Label>
          <Select value={f.book_id} onValueChange={v => setF(p => ({ ...p, book_id: v }))}><SelectTrigger><SelectValue placeholder="Choose book" /></SelectTrigger>
            <SelectContent>{books.map(b => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Borrowed Date</Label><Input type="date" value={f.borrowed_on} onChange={e => setF(p => ({ ...p, borrowed_on: e.target.value }))} /></div>
        <div><Label>Due Date *</Label><Input required type="date" value={f.due_on} onChange={e => setF(p => ({ ...p, due_on: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !borrowerChosen || !f.book_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Issue</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
