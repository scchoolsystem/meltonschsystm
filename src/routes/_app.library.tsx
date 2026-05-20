import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/library")({ component: () => (<FeatureGate feature="library"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("librarian");
  const [openBook, setOpenBook] = useState(false);
  const [openLoan, setOpenLoan] = useState(false);
  const { data: books = [], isLoading: l1 } = useQuery({ queryKey: ["books"], queryFn: async () => (await supabase.from("books").select("*").order("title")).data ?? [] });
  const { data: loans = [], isLoading: l2 } = useQuery({ queryKey: ["loans"], queryFn: async () => (await supabase.from("book_loans").select("*, books(title), students(first_name,last_name,admission_no)").order("borrowed_on", { ascending: false }).limit(200)).data ?? [] });

  const ret = useMutation({
    mutationFn: async (loan: any) => {
      const { error } = await supabase.from("book_loans").update({ status: "returned", returned_on: new Date().toISOString().slice(0, 10) }).eq("id", loan.id);
      if (error) throw error;
      await supabase.from("books").update({ copies_available: (loan.books?.copies_available ?? 0) + 1 }).eq("id", loan.book_id);
    },
    onSuccess: () => { toast.success("Returned"); qc.invalidateQueries({ queryKey: ["loans"] }); qc.invalidateQueries({ queryKey: ["books"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div><h1 className="text-3xl font-bold">Library</h1><p className="text-sm text-muted-foreground mt-1">Books & loans</p></div>
      <Tabs defaultValue="books">
        <TabsList><TabsTrigger value="books">Catalogue ({books.length})</TabsTrigger><TabsTrigger value="loans">Loans ({loans.length})</TabsTrigger></TabsList>
        <TabsContent value="books">
          <Card><CardHeader>
            {can && <Dialog open={openBook} onOpenChange={setOpenBook}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Book</Button></DialogTrigger><AddBook onDone={() => { setOpenBook(false); qc.invalidateQueries({ queryKey: ["books"] }); }} /></Dialog>}
          </CardHeader><CardContent>
            {l1 ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Author</TableHead><TableHead>ISBN</TableHead><TableHead>Category</TableHead><TableHead>Shelf</TableHead><TableHead className="text-right">Available / Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {books.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No books.</TableCell></TableRow>}
                  {(books as any[]).map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.title}</TableCell>
                      <TableCell>{b.author ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{b.isbn ?? "—"}</TableCell>
                      <TableCell>{b.category ?? "—"}</TableCell>
                      <TableCell>{b.shelf ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{b.copies_available} / {b.copies_total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="loans">
          <Card><CardHeader>
            {can && <Dialog open={openLoan} onOpenChange={setOpenLoan}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Issue Loan</Button></DialogTrigger><IssueLoan books={books as any[]} onDone={() => { setOpenLoan(false); qc.invalidateQueries({ queryKey: ["loans"] }); qc.invalidateQueries({ queryKey: ["books"] }); }} /></Dialog>}
          </CardHeader><CardContent>
            {l2 ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Book</TableHead><TableHead>Student</TableHead><TableHead>Borrowed</TableHead><TableHead>Due</TableHead><TableHead>Returned</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {loans.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No loans.</TableCell></TableRow>}
                  {(loans as any[]).map(l => {
                    const overdue = l.status === 'active' && l.due_on && new Date(l.due_on) < new Date();
                    return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.books?.title}</TableCell>
                      <TableCell>{l.students?.first_name} {l.students?.last_name}</TableCell>
                      <TableCell className="text-xs">{l.borrowed_on}</TableCell>
                      <TableCell className={`text-xs ${overdue ? 'text-destructive font-semibold' : ''}`}>{l.due_on}</TableCell>
                      <TableCell className="text-xs">{l.returned_on ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline" className={l.status === 'returned' ? 'bg-success/15 text-success border-success/30' : overdue ? 'bg-destructive/15 text-destructive border-destructive/30' : ''}>{overdue ? 'overdue' : l.status}</Badge></TableCell>
                      <TableCell>{can && l.status === 'active' && <Button size="sm" variant="outline" onClick={() => ret.mutate(l)}>Return</Button>}</TableCell>
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

function AddBook({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ title: "", author: "", isbn: "", category: "", shelf: "", copies_total: 1, copies_available: 1 });
  const m = useMutation({ mutationFn: async () => { const { error } = await supabase.from("books").insert(f); if (error) throw error; }, onSuccess: () => { toast.success("Book added"); onDone(); }, onError: (e: any) => toast.error(e.message) });
  return (
    <DialogContent><DialogHeader><DialogTitle>Add Book</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Title</Label><Input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Author</Label><Input value={f.author} onChange={e => setF({ ...f, author: e.target.value })} /></div>
          <div><Label>ISBN</Label><Input value={f.isbn} onChange={e => setF({ ...f, isbn: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Category</Label><Input value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></div>
          <div><Label>Shelf</Label><Input value={f.shelf} onChange={e => setF({ ...f, shelf: e.target.value })} /></div>
        </div>
        <div><Label>Copies</Label><Input type="number" min={1} value={f.copies_total} onChange={e => setF({ ...f, copies_total: +e.target.value, copies_available: +e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function IssueLoan({ books, onDone }: { books: any[]; onDone: () => void }) {
  const [f, setF] = useState({ book_id: "", student_id: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min4"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").limit(500)).data ?? [] });
  const m = useMutation({
    mutationFn: async () => {
      const book = books.find((b: any) => b.id === f.book_id);
      if (!book || book.copies_available < 1) throw new Error("No copies available");
      const { error } = await supabase.from("book_loans").insert(f); if (error) throw error;
      await supabase.from("books").update({ copies_available: book.copies_available - 1 }).eq("id", f.book_id);
    },
    onSuccess: () => { toast.success("Loan issued"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Issue Book Loan</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Book</Label>
          <Select value={f.book_id} onValueChange={v => setF({ ...f, book_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose book" /></SelectTrigger>
            <SelectContent>{books.filter((b: any) => b.copies_available > 0).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title} ({b.copies_available} avail)</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.book_id || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Issue</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
