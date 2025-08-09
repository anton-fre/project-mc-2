import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { ChevronUp, ChevronDown } from "lucide-react";
import { usePatient } from "@/context/PatientContext";

interface Patient { id: string; name: string; }

const Patients = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  const [addOpen, setAddOpen] = useState(false);
const [newName, setNewName] = useState("");
const { refresh: refreshPatients } = usePatient();

  // SEO
  useEffect(() => {
    document.title = "Patients | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Manage patients: add or delete patient profiles in Project MC.");
  }, []);

  // Auth
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) navigate("/auth", { replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) navigate("/auth", { replace: true });
    });
    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  // Load patients
  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("patients")
          .select("id,name")
          .order("name", { ascending: true });
        if (error) throw error;
        setPatients((data as Patient[]) || []);
      } catch (e: any) {
        toast({ title: "Error", description: e.message || "Failed to load patients" });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const createPatient = async () => {
    if (!userId) return;
    const name = newName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Please enter a patient name" });
      return;
    }
    try {
      const { data, error } = await supabase
        .from("patients")
        .insert({ user_id: userId, name })
        .select("id,name")
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setPatients((prev) => [...prev, data as Patient].sort((a, b) => a.name.localeCompare(b.name)));
        toast({ title: "Patient added", description: name });
        setAddOpen(false);
        setNewName("");
        await refreshPatients();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to add patient" });
    }
  };

  const canDeletePatient = async (patient: Patient) => {
    if (!userId) return false;
    // Do not allow deleting if this is the last remaining patient
    if (patients.length <= 1) {
      toast({ title: "Not allowed", description: "Cannot delete the last remaining patient" });
      return false;
    }
    // Ensure patient has no content
    const { count, error: cntErr } = await supabase
      .from("folders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("patient_id", patient.id);
    if (cntErr) throw cntErr;
    const rootPrefix = `${userId}/${patient.id}`;
    const { data: rootList, error: listErr } = await supabase.storage.from("drive").list(rootPrefix, { limit: 1 });
    if (listErr) throw listErr;
    if ((count ?? 0) > 0 || (rootList?.length ?? 0) > 0) {
      toast({ title: "Patient not empty", description: "Delete files and folders first" });
      return false;
    }
    return true;
  };

  const deletePatient = async (patient: Patient) => {
    if (!userId) return;
    try {
      if (!(await canDeletePatient(patient))) return;
      const { error } = await supabase.from("patients").delete().eq("id", patient.id);
      if (error) throw error;
      setPatients((prev) => prev.filter((p) => p.id !== patient.id));
      await refreshPatients();
      toast({ title: "Patient deleted", description: patient.name });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete patient" });
    }
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[100rem] px-4 py-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Patients</h1>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/files')}>Back to Files</Button>
            <Button onClick={() => setAddOpen(true)}>Add patient</Button>
          </div>
        </header>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : patients.length === 0 ? (
          <p className="text-muted-foreground">No patients yet. Add your first patient.</p>
        ) : (
          <section className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">
                    <button className="inline-flex items-center gap-1" onClick={() => setSortDir((d)=> d==='asc'?'desc':'asc')}>
                      <span>Name</span>
                      {sortDir==='asc'?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>}
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients
                  .slice()
                  .sort((a,b)=> sortDir==='asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
                  .map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-foreground">{p.name}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        onClick={() => setConfirmDelete({ open: true, id: p.id })}
                        disabled={patients.length <= 1}
                        title={patients.length <= 1 ? 'Cannot delete the last remaining patient' : undefined}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add patient</DialogTitle>
              <DialogDescription>Create a new patient profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="patient-name">Name</Label>
              <Input id="patient-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., John Doe" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={createPatient}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmDelete.open} onOpenChange={(o) => setConfirmDelete((s) => ({ ...s, open: o }))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete patient?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const pat = patients.find((x) => x.id === confirmDelete.id);
                  if (pat) await deletePatient(pat);
                  setConfirmDelete({ open: false, id: null });
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default Patients;
