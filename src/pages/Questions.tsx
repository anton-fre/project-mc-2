import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, MoreVertical, Link2Off, ChevronUp, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { format, subDays, addDays } from "date-fns";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { usePatient } from "@/context/PatientContext";

interface Question {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: "open" | "closed" | string;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface QA {
  id: string;
  question_id: string;
  appointment_id: string;
}

interface QF {
  id: string;
  question_id: string;
  storage_object_path: string;
  file_name: string;
}

interface AppointmentMini {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
}

interface Patient { id: string; name: string }
interface FolderOpt { id: string; full_path: string; patient_id: string | null }
interface FileEntry { name: string }

const Questions = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const { patients: ctxPatients, selectedPatientId, setSelectedPatientId } = usePatient();
  const patientSelectValue = selectedPatientId ?? "__general__";

  // SEO
  useEffect(() => {
    document.title = "Open Questions | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "List of questions linkable to files and appointments.");
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);
  }, []);

  // Auth
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);

  // Links data
  const [qAppts, setQAppts] = useState<QA[]>([]);
  const [qFiles, setQFiles] = useState<QF[]>([]);
const [apptLookup, setApptLookup] = useState<Record<string, AppointmentMini>>({});
  const [filterTitle, setFilterTitle] = useState("");
  const [filterApptId, setFilterApptId] = useState<string>("");
  const [filterFilePath, setFilterFilePath] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "priority_desc" | "priority_asc" | "created_desc" | "created_asc">("name_asc");

  // Pre-filter by file from query string if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const file = params.get("file");
    if (file) setFilterFilePath(file);
  }, []);


  const loadAll = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const qBase = supabase.from("questions").select("id,user_id,title,description,status,priority,created_at,updated_at,patient_id").order("created_at", { ascending: false });
      const qPromise = selectedPatientId ? qBase.eq("patient_id", selectedPatientId) : qBase.is("patient_id", null);
      const [{ data: qs, error: qErr }, { data: qa, error: qaErr }, { data: qf, error: qfErr }] = await Promise.all([
        qPromise,
        supabase.from("question_appointments").select("id,question_id,appointment_id"),
        supabase.from("question_files").select("id,question_id,storage_object_path,file_name"),
      ]);
      if (qErr) throw qErr;
      if (qaErr) throw qaErr;
      if (qfErr) throw qfErr;
      setQuestions((qs as Question[]) ?? []);
      setQAppts((qa as QA[]) ?? []);
      setQFiles((qf as QF[]) ?? []);

      // Load appointment details for those referenced
      const apptIds = Array.from(new Set(((qa as QA[]) ?? []).map((r) => r.appointment_id)));
      if (apptIds.length) {
        const { data: appts, error: aErr } = await supabase
          .from("appointments")
          .select("id,title,start_at,end_at")
          .in("id", apptIds);
        if (!aErr) {
          const map: Record<string, AppointmentMini> = {};
          (appts as AppointmentMini[])?.forEach((a) => (map[a.id] = a));
          setApptLookup(map);
        }
      } else {
        setApptLookup({});
      }
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [userId, selectedPatientId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('questions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'question_files' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'question_appointments' }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Create question dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteQuestion(deleteTarget);
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createQuestion = async () => {
    if (!userId) return;
    if (!title.trim()) return toast({ title: "Title required", description: "Please add a title" });
    try {
      const { error } = await supabase
        .from("questions")
        .insert({ user_id: userId, title, description: description || null, status: "open" });
      if (error) throw error;
      toast({ title: "Created", description: "Question added" });
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      await loadAll();
    } catch (e: any) {
      toast({ title: "Create failed", description: e.message });
    }
  };

  const updateStatus = async (q: Question, newStatus: string) => {
    try {
      const { error } = await supabase.from("questions").update({ status: newStatus }).eq("id", q.id).eq("user_id", userId);
      if (error) throw error;
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: newStatus } : x)));
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message });
    }
  };

  const updatePriority = async (q: Question, priority: number) => {
    try {
      const { error } = await supabase.from("questions").update({ priority }).eq("id", q.id).eq("user_id", userId);
      if (error) throw error;
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, priority } : x)));
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message });
    }
  };

  const deleteQuestion = async (q: Question) => {
    if (!userId) return;
    try {
      await supabase.from("question_files").delete().eq("question_id", q.id).eq("user_id", userId);
      await supabase.from("question_appointments").delete().eq("question_id", q.id).eq("user_id", userId);
      const { error } = await supabase.from("questions").delete().eq("id", q.id).eq("user_id", userId);
      if (error) throw error;
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
      toast({ title: "Deleted", description: "Question removed" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message });
    }
  };

  const [linkApptOpen, setLinkApptOpen] = useState(false);
  const [activeQ, setActiveQ] = useState<Question | null>(null);
  const [apptList, setApptList] = useState<AppointmentMini[]>([]);
  const [chosenApptId, setChosenApptId] = useState<string>("");

  const openLinkAppt = async (q: Question) => {
    setActiveQ(q);
    setChosenApptId("");
    setLinkApptOpen(true);
    if (!userId) return;
    try {
      const start = subDays(new Date(), 180).toISOString();
      const end = addDays(new Date(), 180).toISOString();
      let q = supabase
        .from("appointments")
        .select("id,title,start_at,end_at")
        .gt("end_at", start)
        .lt("start_at", end);
      q = selectedPatientId ? q.eq("patient_id", selectedPatientId) : q.is("patient_id", null);
      const { data, error } = await q.order("start_at", { ascending: true });
      if (error) throw error;
      setApptList((data as AppointmentMini[]) ?? []);
    } catch (e: any) {
      toast({ title: "Load appointments failed", description: e.message });
    }
  };

  const linkAppt = async () => {
    if (!userId || !activeQ || !chosenApptId) return;
    try {
      const { error } = await supabase.from("question_appointments").insert({
        user_id: userId,
        question_id: activeQ.id,
        appointment_id: chosenApptId,
      });
      if (error) throw error;
      toast({ title: "Linked", description: "Appointment linked" });
      setLinkApptOpen(false);
      await loadAll();
    } catch (e: any) {
      toast({ title: "Link failed", description: e.message });
    }
  };

  const unlinkAppt = async (qaId: string) => {
    try {
      const { error } = await supabase.from("question_appointments").delete().eq("id", qaId).eq("user_id", userId!);
      if (error) throw error;
      setQAppts((prev) => prev.filter((r) => r.id !== qaId));
    } catch (e: any) {
      toast({ title: "Unlink failed", description: e.message });
    }
  };

  // Link files dialog (browse Drive)
  const [linkFileOpen, setLinkFileOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filePatientId, setFilePatientId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("__root__");
  const [folderFiles, setFolderFiles] = useState<FileEntry[]>([]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data, error } = await supabase.from("patients").select("id,name").order("name", { ascending: true });
        if (error) throw error;
        setPatients(((data as Patient[]) ?? []).sort((a, b) => a.name.localeCompare(b.name)));
      } catch {}
    })();
  }, [userId]);

  const openLinkFile = async (q: Question) => {
    setActiveQ(q);
    setLinkFileOpen(true);
    setFilePatientId(null);
    setSelectedFolderId("__root__");
    await reloadFolders(null);
    await reloadFiles(null, "__root__");
  };

  const reloadFolders = async (pid: string | null) => {
    if (!userId) return;
    let q = supabase.from("folders").select("id,full_path,patient_id").eq("user_id", userId);
    q = pid ? q.eq("patient_id", pid) : q.is("patient_id", null);
    const { data } = await q.order("full_path", { ascending: true });
    setFolders([{ id: "__root__", full_path: "", patient_id: pid }, ...(((data as any[]) ?? []) as FolderOpt[])]);
  };

  const reloadFiles = async (pid: string | null, folderId: string) => {
    if (!userId) return;
    const base = pid ? `${userId}/${pid}` : `${userId}`;
    const chosen = folders.find((f) => f.id === folderId);
    const prefix = chosen?.full_path ? `${base}/${chosen.full_path}` : base;
    const { data } = await supabase.storage.from("drive").list(prefix, { limit: 1000 });
    const rows = (data as any[]) ?? [];
    setFolderFiles(rows.filter((f: any) => f.name !== ".keep" && !f.name?.startsWith?.(".")) as FileEntry[]);
  };

  const onPatientChange = async (pid: string | null) => {
    setFilePatientId(pid);
    setSelectedFolderId("__root__");
    await reloadFolders(pid);
    await reloadFiles(pid, "__root__");
  };

  const onFolderChange = async (fid: string) => {
    setSelectedFolderId(fid);
    await reloadFiles(filePatientId, fid);
  };

  const linkFile = async (fileName: string) => {
    if (!userId || !activeQ) return;
    const base = filePatientId ? `${userId}/${filePatientId}` : `${userId}`;
    const chosen = folders.find((f) => f.id === selectedFolderId);
    const storagePath = chosen?.full_path ? `${base}/${chosen.full_path}/${fileName}` : `${base}/${fileName}`;
    try {
      const { error } = await supabase.from("question_files").insert({
        user_id: userId,
        question_id: activeQ.id,
        storage_object_path: storagePath,
        file_name: fileName,
      });
      if (error) throw error;
      toast({ title: "Linked", description: "File linked" });
      await loadAll();
    } catch (e: any) {
      toast({ title: "Link failed", description: e.message });
    }
  };

  const unlinkFile = async (id: string) => {
    try {
      const { error } = await supabase.from("question_files").delete().eq("id", id).eq("user_id", userId!);
      if (error) throw error;
      setQFiles((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      toast({ title: "Unlink failed", description: e.message });
    }
  };

  const openFile = async (path: string) => {
    try {
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 5);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Open failed", description: e.message });
    }
  };

  const groupedAppts = useMemo(() => {
    const map: Record<string, { qaId: string; appt: AppointmentMini | undefined }[]> = {};
    qAppts.forEach((r) => {
      (map[r.question_id] ||= []).push({ qaId: r.id, appt: apptLookup[r.appointment_id] });
    });
    return map;
  }, [qAppts, apptLookup]);

  const groupedFiles = useMemo(() => {
    const map: Record<string, QF[]> = {};
    qFiles.forEach((r) => { (map[r.question_id] ||= []).push(r); });
    return map;
  }, [qFiles]);

  const apptOptions = useMemo(() => {
    return Object.values(apptLookup).sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [apptLookup]);

  const fileOptions = useMemo(() => {
    const map = new Map<string, { path: string; name: string }>();
    qFiles.forEach((f) => {
      if (!map.has(f.storage_object_path)) {
        map.set(f.storage_object_path, { path: f.storage_object_path, name: f.file_name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [qFiles]);

  const filteredQuestions = useMemo(() => {
    let arr = questions as Question[];
    if (filterTitle.trim()) {
      const q = filterTitle.trim().toLowerCase();
      arr = arr.filter((x) => x.title.toLowerCase().includes(q));
    }
    if (filterApptId) {
      const qIds = new Set(qAppts.filter((r) => r.appointment_id === filterApptId).map((r) => r.question_id));
      arr = arr.filter((x) => qIds.has(x.id));
    }
    if (filterFilePath) {
      const qIds2 = new Set(qFiles.filter((r) => r.storage_object_path === filterFilePath).map((r) => r.question_id));
      arr = arr.filter((x) => qIds2.has(x.id));
    }
    return arr;
  }, [questions, filterTitle, filterApptId, filterFilePath, qAppts, qFiles]);

  const sortedQuestions = useMemo(() => {
    const arr = [...filteredQuestions];
    switch (sortBy) {
      case "name_desc":
        arr.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "priority_desc":
        arr.sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5));
        break;
      case "priority_asc":
        arr.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
        break;
      case "created_desc":
        arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "created_asc":
        arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case "name_asc":
      default:
        arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return arr;
  }, [filteredQuestions, sortBy]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[100rem] px-4 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Open Questions</h1>
          <p className="mt-2 text-muted-foreground">Create questions and link them to files and appointments.</p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2 justify-end">
          <div className="flex-1 min-w-[200px]">
            <Input placeholder="Filter by name" value={filterTitle} onChange={(e) => setFilterTitle(e.target.value)} />
          </div>
          <Select value={filterApptId || "__all__"} onValueChange={(v) => setFilterApptId(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filter by appointment" /></SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__all__">All appointments</SelectItem>
              {apptOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {format(new Date(a.start_at), "PPp")} – {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterFilePath || "__all__"} onValueChange={(v) => setFilterFilePath(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filter by file" /></SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__all__">All files</SelectItem>
              {fileOptions.map((f) => (
                <SelectItem key={f.path} value={f.path}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="name_asc">Name A–Z</SelectItem>
              <SelectItem value="name_desc">Name Z–A</SelectItem>
              <SelectItem value="priority_desc">Priority High→Low</SelectItem>
              <SelectItem value="priority_asc">Priority Low→High</SelectItem>
              <SelectItem value="created_desc">Newest first</SelectItem>
              <SelectItem value="created_asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={() => { setFilterTitle(""); setFilterApptId(""); setFilterFilePath(""); }}>Clear</Button>
          <Button size="icon" onClick={() => setCreateOpen(true)} aria-label="New question">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {sortedQuestions.length === 0 ? (
          <p className="text-muted-foreground">No questions found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button className="inline-flex items-center gap-1" onClick={() => setSortBy((prev) => prev === 'name_asc' ? 'name_desc' : 'name_asc')}>
                    <span>Title</span>
                    {sortBy.startsWith('name_') ? (sortBy === 'name_asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronUp className="h-3.5 w-3.5 opacity-30" />}
                  </button>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1" onClick={() => setSortBy((prev) => prev === 'priority_asc' ? 'priority_desc' : 'priority_asc')}>
                    <span>Priority</span>
                    {sortBy.startsWith('priority_') ? (sortBy === 'priority_asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronUp className="h-3.5 w-3.5 opacity-30" />}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button className="inline-flex items-center gap-1" onClick={() => setSortBy((prev) => prev === 'created_desc' ? 'created_asc' : 'created_desc')}>
                    <span>Created</span>
                    {sortBy.startsWith('created_') ? (sortBy === 'created_asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronUp className="h-3.5 w-3.5 opacity-30" />}
                  </button>
                </TableHead>
                <TableHead className="text-right w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedQuestions.map((q) => (
                <>
                  <TableRow key={q.id} className="align-top">
                    <TableCell>
                      <div className="font-medium">{q.title}</div>
                      {q.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{q.description}</p>}
                    </TableCell>
                    <TableCell>
                      <select
                        className="border rounded-md h-8 px-2 text-sm"
                        value={q.status}
                        onChange={(e) => updateStatus(q, e.target.value)}
                        aria-label="Change status"
                      >
                        <option value="open">open</option>
                        <option value="closed">closed</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Priority</span>
                        <select
                          className="border rounded-md h-8 px-2 text-sm"
                          value={q.priority ?? 5}
                          onChange={(e) => updatePriority(q, Number(e.target.value))}
                          aria-label="Change priority"
                        >
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{format(new Date(q.created_at), "PPp")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => toggleExpanded(q.id)}>
                          {expandedIds.has(q.id) ? "Hide links" : "Show linked items"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label="Open actions menu">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-50 bg-popover">
                            <DropdownMenuItem onClick={() => openLinkAppt(q)}>Link appointment</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openLinkFile(q)}>Link file</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setDeleteTarget(q); setDeleteOpen(true); }} className="text-destructive">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedIds.has(q.id) && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="flex items-center justify-between">
                              <Label>Appointments</Label>
                              <Button size="icon" variant="ghost" onClick={() => openLinkAppt(q)} aria-label="Link appointment" title="Link appointment">
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {groupedAppts[q.id]?.length ? (
                              <ul className="mt-2 space-y-1">
                                {groupedAppts[q.id].map(({ qaId, appt }) => (
                                  <li key={qaId} className="flex items-center justify-between text-sm">
                                    {appt ? (
                                      <a
                                        className="underline underline-offset-2"
                                        href={`/appointments?date=${format(new Date(appt.start_at), "yyyy-MM-dd")}`}
                                        target="_self"
                                      >
                                        {appt.title} – {format(new Date(appt.start_at), "PPp")}
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">Unknown appointment</span>
                                    )}
                                    <Button size="icon" variant="destructive" onClick={() => unlinkAppt(qaId)} aria-label="Unlink appointment" title="Unlink">
                                      <Link2Off className="h-4 w-4" />
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-sm text-muted-foreground">No appointments linked</p>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between">
                              <Label>Files</Label>
                              <Button size="icon" variant="ghost" onClick={() => openLinkFile(q)} aria-label="Link file" title="Link file">
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {groupedFiles[q.id]?.length ? (
                              <ul className="mt-2 space-y-1">
                                {groupedFiles[q.id].map((f) => (
                                  <li key={f.id} className="flex items-center justify-between text-sm">
                                    <button className="appearance-none p-0 bg-transparent border-0 text-left underline underline-offset-2" onClick={() => openFile(f.storage_object_path)}>{f.file_name}</button>
                                    <Button size="sm" variant="destructive" onClick={() => unlinkFile(f.id)}>Unlink</Button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-sm text-muted-foreground">No files linked</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </main>

      {/* Create question dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New question</DialogTitle>
            <DialogDescription>Add a question to track and resolve.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="q-title">Question</Label>
              <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do we need to decide?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-desc">Description</Label>
              <Textarea id="q-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createQuestion}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link appointment dialog */}
      <Dialog open={linkApptOpen} onOpenChange={setLinkApptOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link appointment</DialogTitle>
            <DialogDescription>Select an appointment to link to this question.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Appointment</Label>
              <select className="border rounded-md h-10 px-2 w-full" value={chosenApptId} onChange={(e) => setChosenApptId(e.target.value)}>
                <option value="">Select…</option>
                {apptList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {format(new Date(a.start_at), "PPp")} – {a.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLinkApptOpen(false)}>Cancel</Button>
            <Button onClick={linkAppt} disabled={!chosenApptId}>Link</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link file dialog */}
      <Dialog open={linkFileOpen} onOpenChange={setLinkFileOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link file from Drive</DialogTitle>
            <DialogDescription>Pick a patient scope and folder, then choose a file.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Patient</Label>
              <select
                className="border rounded-md h-9 px-2"
                value={filePatientId ?? "__general__"}
                onChange={(e) => onPatientChange(e.target.value === "__general__" ? null : e.target.value)}
              >
                <option value="__general__">General</option>
                {patients.filter((p) => p.name !== "General").map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Folder</Label>
              <select className="border rounded-md h-9 px-2" value={selectedFolderId} onChange={(e) => onFolderChange(e.target.value)}>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.full_path || "/"}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Files</Label>
              <div className="max-h-56 overflow-auto rounded-md border">
                <ul>
                  {folderFiles.map((f) => (
                    <li key={f.name} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0">
                      <span className="text-sm">{f.name}</span>
                      <Button size="sm" variant="secondary" onClick={() => linkFile(f.name)}>Link</Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete question dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete “{deleteTarget?.title}”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Questions;
