import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay, startOfWeek, addDays, addHours, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { enGB } from "date-fns/locale";
import { WeekGrid, DayGrid } from "@/components/appointments/TimeGrid";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { usePatient } from "@/context/PatientContext";

interface Appointment {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  patient_id: string | null;
}

interface FileObject { name: string }
interface Patient { id: string; name: string }

const Appointments = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [startHour] = useState(7);
  const [endHour] = useState(20);

  const [monthEvents, setMonthEvents] = useState<Record<string, { id: string; title: string; start_at: string; end_at: string }[]>>({});
  const [gridEvents, setGridEvents] = useState<Appointment[]>([]);

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startValue, setStartValue] = useState(""); // datetime-local string
  const [endValue, setEndValue] = useState("");

// Files dialog state
  const [filesOpen, setFilesOpen] = useState(false);
  const [activeAppt, setActiveAppt] = useState<Appointment | null>(null);
  const [apptFiles, setApptFiles] = useState<{ id: string; file_name: string; storage_object_path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [folderOptions, setFolderOptions] = useState<{ id: string; full_path: string }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [folderFiles, setFolderFiles] = useState<FileObject[]>([]);
  const [copyToPatient, setCopyToPatient] = useState(true);
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareForAppt, setShareForAppt] = useState<Appointment | null>(null);
  const [shareEmail2, setShareEmail2] = useState("");
  const [includeFiles, setIncludeFiles] = useState(true);
  const [sharing2, setSharing2] = useState(false);

  // Global patient context
  const { patients: ctxPatients, selectedPatientId, setSelectedPatientId } = usePatient();
  const patientSelectValue = selectedPatientId ?? "__general__";

  // Patients
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dialogPatientId, setDialogPatientId] = useState<string | null>(null);
  const [filesPatientId, setFilesPatientId] = useState<string | null>(null);

  useEffect(() => {
    // SEO
    document.title = "Appointments | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Manage appointments, attach files, and view your schedule.");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get("date");
    if (date) {
      const dt = new Date(`${date}T12:00:00`);
      if (!isNaN(dt.getTime())) {
        setSelectedDate(dt);
        setView('day');
      }
    }
  }, []);

  // Auth
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("patients")
          .select("id,name")
          .order("name", { ascending: true });
        if (error) throw error;
        let list = (data as Patient[]) ?? [];
        if (list.length === 0) {
          const { data: ins, error: insErr } = await (supabase as any)
            .from("patients")
            .insert({ user_id: userId, name: "General" })
            .select("id,name")
            .maybeSingle();
          if (insErr) throw insErr;
          if (ins) list = [ins as Patient];
        }
        if (mounted) setPatients(list);
      } catch {}
    })();
    return () => { mounted = false };
  }, [userId]);

  const dayBounds = useMemo(() => ({
    start: startOfDay(selectedDate),
    end: endOfDay(selectedDate),
  }), [selectedDate]);

  // Load appointments for selected date (overlaps included)
  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("appointments")
          .select("id,user_id,title,notes,start_at,end_at,all_day,patient_id")
          .lt("start_at", dayBounds.end.toISOString())
          .gt("end_at", dayBounds.start.toISOString());
        q = selectedPatientId ? q.eq("patient_id", selectedPatientId) : q.is("patient_id", null);
        const { data, error } = await q.order("start_at", { ascending: true });
        if (error) throw error;
        setAppointments((data as Appointment[]) ?? []);
      } catch (e: any) {
        toast({ title: "Load failed", description: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, dayBounds.start, dayBounds.end, selectedPatientId]);

  // Load month appointments for calendar markers
  useEffect(() => {
    if (!userId || view !== 'month') return;
    (async () => {
      try {
        const start = startOfMonth(selectedDate);
        const end = endOfMonth(selectedDate);
        let q = supabase
          .from('appointments')
          .select('id,title,start_at,end_at')
          .lt('start_at', end.toISOString())
          .gt('end_at', start.toISOString());
        q = selectedPatientId ? q.eq('patient_id', selectedPatientId) : q.is('patient_id', null);
        const { data, error } = await q;
        if (error) throw error;
        const map: Record<string, { id: string; title: string; start_at: string; end_at: string }[]> = {};
        (data as Appointment[] | null)?.forEach((a) => {
          const s = new Date(a.start_at);
          const e = new Date(a.end_at);
          eachDayOfInterval({ start: s, end: e }).forEach((d) => {
            const key = format(d, 'yyyy-MM-dd');
            (map[key] ||= []).push({ id: a.id, title: a.title, start_at: a.start_at, end_at: a.end_at });
          });
        });
        setMonthEvents(map);
      } catch {
        // ignore markers load errors
      }
    })();
  }, [userId, view, selectedDate, selectedPatientId]);

  // Load events for week/day grids
  useEffect(() => {
    if (!userId) return;
    (async () => {
      if (view === 'week') {
        const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const we = endOfDay(addDays(ws, 6));
        let q = supabase
          .from('appointments')
          .select('id,user_id,title,notes,start_at,end_at,all_day,patient_id')
          .lt('start_at', we.toISOString())
          .gt('end_at', ws.toISOString());
        q = selectedPatientId ? q.eq('patient_id', selectedPatientId) : q.is('patient_id', null);
        const { data, error } = await q.order('start_at', { ascending: true });
        if (!error) setGridEvents((data as Appointment[]) ?? []);
      } else if (view === 'day') {
        setGridEvents(appointments);
      }
    })();
  }, [userId, view, selectedDate, appointments, selectedPatientId]);

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setNotes("");
    setAllDay(false);
    const d = selectedDate;
    const startLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
    const endLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0);
    setStartValue(format(startLocal, "yyyy-MM-dd'T'HH:mm"));
    setEndValue(format(endLocal, "yyyy-MM-dd'T'HH:mm"));
    setDialogPatientId(selectedPatientId ?? (ctxPatients[0]?.id ?? null));
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditing(appt);
    setTitle(appt.title);
    setNotes(appt.notes || "");
    setAllDay(appt.all_day);
    // Convert to datetime-local format
    setStartValue(format(new Date(appt.start_at), "yyyy-MM-dd'T'HH:mm"));
    setEndValue(format(new Date(appt.end_at), "yyyy-MM-dd'T'HH:mm"));
    setDialogPatientId(appt.patient_id ?? null);
    setDialogOpen(true);
  };

  const saveAppointment = async () => {
    if (!userId) return;
    try {
      const start = new Date(startValue);
      const end = new Date(endValue);
      if (!title.trim()) return toast({ title: "Title required", description: "Please add a title" });
      if (end <= start) return toast({ title: "Invalid time", description: "End must be after start" });

      if (editing) {
        const { error } = await supabase
          .from("appointments")
          .update({ title, notes: notes || null, all_day: allDay, start_at: start.toISOString(), end_at: end.toISOString(), patient_id: dialogPatientId })
          .eq("id", editing.id)
          .eq("user_id", userId);
        if (error) throw error;
        toast({ title: "Updated", description: "Appointment saved" });
      } else {
        const { error } = await supabase
          .from("appointments")
          .insert({ user_id: userId, title, notes: notes || null, all_day: allDay, start_at: start.toISOString(), end_at: end.toISOString(), patient_id: dialogPatientId });
        if (error) throw error;
        toast({ title: "Created", description: "Appointment added" });
      }
      setDialogOpen(false);
      // refresh
      const { data, error: reloadErr } = await supabase
        .from("appointments")
        .select("id,user_id,title,notes,start_at,end_at,all_day,patient_id")
        .lt("start_at", dayBounds.end.toISOString())
        .gt("end_at", dayBounds.start.toISOString())
        .order("start_at", { ascending: true });
      if (!reloadErr) setAppointments((data as Appointment[]) ?? []);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message });
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!userId) return;
    if (!confirm("Delete this appointment?")) return;
    try {
      const { error } = await supabase.from("appointments").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      toast({ title: "Deleted", description: "Appointment removed" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message });
    }
  };

  // Files helpers
  const ensureAppointmentsFolders = async (appointmentId: string) => {
    if (!userId) return { basePath: "" };

    // Ensure root "Appointments" folder exists in folders (General = patient_id null)
    let rootId: string | null = null;
    const { data: rootSel } = await supabase
      .from("folders")
      .select("id")
      .eq("user_id", userId)
      .is("patient_id", null)
      .eq("full_path", "Appointments")
      .maybeSingle();
    if (rootSel?.id) {
      rootId = rootSel.id as string;
    } else {
      const { data: rootIns, error: rootErr } = await supabase
        .from("folders")
        .insert({ user_id: userId, name: "Appointments", parent_id: null, full_path: "Appointments", patient_id: null })
        .select("id")
        .maybeSingle();
      if (rootErr) throw rootErr;
      rootId = (rootIns as any)?.id as string;
    }

    // Ensure appointment subfolder
    const subPath = `Appointments/${appointmentId}`;
    const { data: subSel } = await supabase
      .from("folders")
      .select("id")
      .eq("user_id", userId)
      .is("patient_id", null)
      .eq("full_path", subPath)
      .maybeSingle();
    if (!subSel?.id) {
      const { error: subErr } = await supabase
        .from("folders")
        .insert({ user_id: userId, name: appointmentId, parent_id: rootId, full_path: subPath, patient_id: null });
      if (subErr) throw subErr;
    }

    return { basePath: `${userId}/${subPath}` };
  };

  const ensurePatientFolders = async (patientId: string) => {
    if (!userId) return { basePath: "" };
    // For patient-scoped storage we use the convention: <userId>/<patientId>
    return { basePath: `${userId}/${patientId}` };
  };

  const openFilesFor = async (appt: Appointment) => {
    setActiveAppt(appt);
    const pid = appt.patient_id ?? null;
    setFilesPatientId(pid);
    setFilesOpen(true);
    try {
      // Load attachments
      const { data, error } = await supabase
        .from("appointment_files")
        .select("id,file_name,storage_object_path")
        .eq("appointment_id", appt.id)
        .order("created_at", { ascending: true });
      if (!error) setApptFiles((data as any[]) ?? []);

      // Load folder options for selected patient scope
      let q = supabase.from("folders").select("id,full_path").eq("user_id", userId!);
      q = pid ? q.eq("patient_id", pid) : q.is("patient_id", null);
      const { data: foldersData } = await q.order("full_path", { ascending: true });
      setFolderOptions([{ id: "__root__", full_path: "" }, ...((foldersData as any[]) ?? [])]);
      setSelectedFolder("__root__");
      // Load root files for this scope
      if (userId) {
        const base = pid ? `${userId}/${pid}` : `${userId}`;
        const { data: rootFiles } = await supabase.storage.from("drive").list(base, { limit: 1000 });
        const rows = (rootFiles as any[]) ?? [];
        setFolderFiles(rows.filter((f: any) => f.name !== ".keep" && !f.name?.startsWith?.(".")));
      }
    } catch (e: any) {
      // ignore
    }
  };

  const onFolderChange = async (folderId: string) => {
    setSelectedFolder(folderId);
    if (!userId) return;
    const chosen = folderOptions.find((f) => f.id === folderId);
    const base = filesPatientId ? `${userId}/${filesPatientId}` : `${userId}`;
    const prefix = chosen?.full_path ? `${base}/${chosen.full_path}` : base;
    const { data } = await supabase.storage.from("drive").list(prefix, { limit: 1000 });
    const rows = (data as any[]) ?? [];
    setFolderFiles(rows.filter((f: any) => f.name !== ".keep" && !f.name?.startsWith?.(".")));
  };

  const onFilesPatientChange = async (pid: string | null) => {
    setFilesPatientId(pid);
    if (!userId) return;
    // Reload folder options for this scope
    let q = supabase.from("folders").select("id,full_path").eq("user_id", userId);
    q = pid ? q.eq("patient_id", pid) : q.is("patient_id", null);
    const { data: fo } = await q.order("full_path", { ascending: true });
    setFolderOptions([{ id: "__root__", full_path: "" }, ...(((fo as any[]) ?? []))]);
    setSelectedFolder("__root__");
    const base = pid ? `${userId}/${pid}` : `${userId}`;
    const { data } = await supabase.storage.from("drive").list(base, { limit: 1000 });
    const rows = (data as any[]) ?? [];
    setFolderFiles(rows.filter((f: any) => f.name !== ".keep" && !f.name?.startsWith?.(".")));
  };
  const uploadToAppointment = async (files: FileList | null) => {
    if (!userId || !activeAppt || !files || files.length === 0) return;
    setUploading(true);
    try {
      const { basePath } = await ensureAppointmentsFolders(activeAppt.id);
      const patientId = filesPatientId;
      const patientBase = patientId ? (await ensurePatientFolders(patientId)).basePath : null;
      for (const f of Array.from(files)) {
        const storagePath = `${basePath}/${f.name}`;
        const { error: upErr } = await supabase.storage.from("drive").upload(storagePath, f, { upsert: true });
        if (upErr) throw upErr;
        const { error: linkErr } = await supabase
          .from("appointment_files")
          .insert({ user_id: userId, appointment_id: activeAppt.id, storage_object_path: storagePath, file_name: f.name });
        if (linkErr) throw linkErr;

        // Optional copy to patient's folder
        if (copyToPatient && patientBase) {
          const patientPath = `${patientBase}/${f.name}`;
          await supabase.storage.from("drive").upload(patientPath, f, { upsert: true });
        }
      }
      toast({ title: "Uploaded", description: `${files.length} file(s) attached` });
      // reload attachments
      const { data } = await supabase
        .from("appointment_files")
        .select("id,file_name,storage_object_path")
        .eq("appointment_id", activeAppt.id)
        .order("created_at", { ascending: true });
      setApptFiles((data as any[]) ?? []);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const attachExisting = async (name: string) => {
    if (!userId || !activeAppt) return;
    setSelecting(true);
    try {
      const chosen = folderOptions.find((f) => f.id === selectedFolder);
      const base = filesPatientId ? `${userId}/${filesPatientId}` : `${userId}`;
      const storagePath = chosen?.full_path ? `${base}/${chosen.full_path}/${name}` : `${base}/${name}`;
      const { error } = await supabase
        .from("appointment_files")
        .insert({ user_id: userId, appointment_id: activeAppt.id, storage_object_path: storagePath, file_name: name });
      if (error) throw error;
      setApptFiles((prev) => [...prev, { id: crypto.randomUUID(), file_name: name, storage_object_path: storagePath }]);
      toast({ title: "Attached", description: name });
    } catch (e: any) {
      toast({ title: "Attach failed", description: e.message });
    } finally {
      setSelecting(false);
    }
  };

  const removeAttachment = async (id: string) => {
    if (!activeAppt || !userId) return;
    try {
      const { error } = await supabase.from("appointment_files").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
      setApptFiles((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      toast({ title: "Remove failed", description: e.message });
    }
  };

  const openAttachment = async (path: string) => {
    try {
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 5);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Open failed", description: e.message });
    }
  };

  const sendInvite = async () => {
    if (!activeAppt || !shareEmail) return;
    try {
      setSharing(true);
      // Insert share permissions first
      const rows = apptFiles.map((f) => ({
        owner_user_id: userId as string,
        target_email: shareEmail.toLowerCase(),
        path: f.storage_object_path,
        file_name: f.file_name,
        patient_id: activeAppt.patient_id,
      }));
      if (rows.length === 0) throw new Error("No files to share");
      const { error: insertErr } = await supabase.from("shares").insert(rows);
      if (insertErr) throw insertErr;

      // Generate 7-day links
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const paths = rows.map((r) => r.path);
      const urlsResp = await fetch("https://hqsvllpakgyrwsdulukd.functions.supabase.co/get-shared-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ paths }),
      });
      const urlsJson = await urlsResp.json();
      const links = (Array.isArray(urlsJson) ? urlsJson : urlsJson.results || urlsJson)
        .map((r: any) => r.url)
        .filter(Boolean);
      if (links.length === 0) throw new Error("Could not generate links");

      // Email the recipient
      const subject = `Files for appointment: ${activeAppt.title || format(new Date(activeAppt.start_at), "PPP p")}`;
      const emailResp = await fetch("https://hqsvllpakgyrwsdulukd.functions.supabase.co/send-share-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: shareEmail, subject, links }),
      });
      if (!emailResp.ok) throw new Error("Email send failed");
      toast({ title: "Invite sent", description: `Shared ${links.length} link(s) – expire in 7 days.` });
      setShareEmail("");
    } catch (e: any) {
      toast({ title: "Invite failed", description: e.message });
    } finally {
      setSharing(false);
    }
  };
  // Create at clicked slot
  const openCreateAt = (dt: Date) => {
    setSelectedDate(dt);
    setEditing(null);
    setTitle("");
    setNotes("");
    setAllDay(false);
    const startLocal = dt;
    const endLocal = addHours(dt, 1);
    setStartValue(format(startLocal, "yyyy-MM-dd'T'HH:mm"));
    setEndValue(format(endLocal, "yyyy-MM-dd'T'HH:mm"));
    setDialogPatientId(null);
    setDialogOpen(true);
  };

  const openShareFor = async (appt: Appointment) => {
    setShareForAppt(appt);
    setShareEmail2("");
    setIncludeFiles(true);
    setShareOpen(true);
  };

  const shareNow = async () => {
    if (!userId || !shareForAppt || !shareEmail2) return;
    try {
      setSharing2(true);
      let links: string[] = [];
      if (includeFiles) {
        const { data: files, error: filesErr } = await supabase
          .from("appointment_files")
          .select("file_name,storage_object_path")
          .eq("appointment_id", shareForAppt.id);
        if (filesErr) throw filesErr;
        const rows = (files || []).map((f: any) => ({
          owner_user_id: userId as string,
          target_email: shareEmail2.toLowerCase(),
          path: f.storage_object_path,
          file_name: f.file_name,
          patient_id: shareForAppt.patient_id,
        }));
        if (rows.length) {
          const { error: insErr } = await supabase.from("shares").insert(rows);
          if (insErr) throw insErr;

          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (!token) throw new Error("Not authenticated");
          const resp = await fetch("https://hqsvllpakgyrwsdulukd.functions.supabase.co/get-shared-url", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ paths: rows.map((r) => r.path) }),
          });
          const json = await resp.json();
          links = (Array.isArray(json) ? json : json.results || json).map((r: any) => r.url).filter(Boolean);
        }
      }

      const subject = `Event: ${shareForAppt.title} – ${format(new Date(shareForAppt.start_at), "PPP p")}`;
      const emailResp = await fetch("https://hqsvllpakgyrwsdulukd.functions.supabase.co/send-share-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: shareEmail2, subject, links }),
      });
      if (!emailResp.ok) throw new Error("Email send failed");
      toast({ title: "Shared", description: `Event shared${links.length ? ` with ${links.length} file link(s)` : ""}. Links expire in 7 days.` });
      setShareOpen(false);
    } catch (e: any) {
      toast({ title: "Share failed", description: e.message });
    } finally {
      setSharing2(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-none px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Appointments</h1>
          <p className="mt-2 text-muted-foreground">Plan events and attach files. Files uploaded here also appear in Files &gt; Appointments.</p>
        </header>


        <div className="grid grid-cols-1 gap-6">
          <section aria-label="Calendar" className="rounded-md border p-3">
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList className="mb-3">
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="day">Day</TabsTrigger>
              </TabsList>

              <TabsContent value="month" className="mt-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  className="p-3 pointer-events-auto w-full"
                  showOutsideDays
                  locale={enGB}
                  classNames={{
                    months: "w-full",
                    month: "w-full",
                    table: "w-full",
                    head_row: "grid grid-cols-7 w-full",
                    row: "grid grid-cols-7 w-full",
                    head_cell: "text-muted-foreground rounded-md font-normal text-[0.8rem] text-center",
                    cell: "min-h-28 md:min-h-32 text-center text-sm p-0 align-top",
                    day: "h-full w-full p-2 font-normal aria-selected:opacity-100",
                    day_selected: "bg-transparent ring-2 ring-primary text-foreground",
                  }}
                  components={{
                    DayContent: (dayProps: any) => {
                      const date: Date = dayProps.date;
                      const key = format(date, 'yyyy-MM-dd');
                      const items = monthEvents[key] || [];
                      return (
                        <div className="flex h-full w-full flex-col items-start p-1 cursor-pointer" onDoubleClick={() => { setSelectedDate(date); setView('day'); }} title="Double-click to open day view">
                          <span className="text-xs font-medium">{date.getDate()}</span>
                          <div className="mt-1 flex w-full flex-col gap-1">
                            {items.slice(0, 3).map((it) => (
                              <div key={it.id} className="rounded bg-primary/10 text-primary text-[10px] px-1 truncate" title={it.title}>
                                {it.title}
                              </div>
                            ))}
                            {items.length > 3 && (
                              <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>
                            )}
                          </div>
                        </div>
                      );
                    },
                  }}
                />
                <div className="mt-3">
                  <Button onClick={openCreate}>New appointment</Button>
                </div>
              </TabsContent>

              <TabsContent value="week" className="mt-0">
                <WeekGrid
                  selectedDate={selectedDate}
                  startHour={startHour}
                  endHour={endHour}
                  onSlotClick={(dt) => openCreateAt(dt)}
                  events={gridEvents}
                />
              </TabsContent>

              <TabsContent value="day" className="mt-0">
                <DayGrid
                  selectedDate={selectedDate}
                  startHour={startHour}
                  endHour={endHour}
                  onSlotClick={(dt) => openCreateAt(dt)}
                  events={gridEvents}
                />
              </TabsContent>
            </Tabs>
          </section>

          <section aria-label="Appointments list" className="rounded-md border p-4">
            <h2 className="text-lg font-medium">{format(selectedDate, "PPP")}</h2>
            {loading ? (
              <p className="mt-3 text-muted-foreground">Loading…</p>
            ) : appointments.length === 0 ? (
              <p className="mt-3 text-muted-foreground">No appointments for this day.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {appointments.map((a) => (
                  <li key={a.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{a.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {a.all_day ? "All day" : `${format(new Date(a.start_at), "p")} – ${format(new Date(a.end_at), "p")}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => openFilesFor(a)}>Files</Button>
                        <Button variant="default" onClick={() => openShareFor(a)}>Share</Button>
                        <Button variant="outline" onClick={() => openEdit(a)}>Edit</Button>
                        <Button variant="destructive" onClick={() => deleteAppointment(a.id)}>Delete</Button>
                      </div>
                    </div>
                    {a.notes && <p className="mt-2 text-sm">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit appointment" : "New appointment"}</DialogTitle>
            <DialogDescription>Set details and save.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Checkup with Dr. Smith" />
            </div>
              <div className="space-y-2">
                <Label htmlFor="patient">Patient</Label>
                <select
                  id="patient"
                  className="border rounded-md h-9 px-2"
                  value={dialogPatientId ?? (ctxPatients[0]?.id ?? "")}
                  onChange={(e) => setDialogPatientId(e.target.value)}
                >
                  {ctxPatients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Start</Label>
                  <Input id="start" type="datetime-local" value={startValue} onChange={(e) => setStartValue(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">End</Label>
                  <Input id="end" type="datetime-local" value={endValue} onChange={(e) => setEndValue(e.target.value)} />
                </div>
              </div>
            <div className="flex items-center gap-2">
              <Switch id="allDay" checked={allDay} onCheckedChange={setAllDay} />
              <Label htmlFor="allDay">All day</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAppointment}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Files dialog */}
      <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
            <DialogDescription>Upload new files or attach existing from your Drive.</DialogDescription>
          </DialogHeader>

          {activeAppt && (
            <div className="space-y-6">
              <div>
                <Label>Upload to this appointment</Label>
                <div className="mt-2 flex items-center gap-4">
                  <Input type="file" multiple onChange={(e) => uploadToAppointment(e.target.files)} disabled={uploading} />
                  <div className="flex items-center gap-2">
                    <Switch id="copyPatient" checked={copyToPatient} onCheckedChange={setCopyToPatient} />
                    <Label htmlFor="copyPatient">Also copy to patient's folder</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Patient</Label>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <select
                    className="border rounded-md h-9 px-2"
                    value={filesPatientId ?? "__general__"}
                    onChange={(e) => onFilesPatientChange(e.target.value === "__general__" ? null : e.target.value)}
                  >
                    <option value="__general__">General</option>
                    {patients.filter((p) => p.name !== "General").map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select existing file</Label>
                <div className="max-h-48 overflow-auto rounded-md border">
                  <ul>
                    {folderFiles.map((f) => (
                      <li key={f.name} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0">
                        <span className="text-sm">{f.name}</span>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => attachExisting(f.name)} disabled={selecting}>Attach</Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Share via email (7-day links)</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input type="email" placeholder="recipient@example.com" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
                  <Button onClick={sendInvite} disabled={sharing || !shareEmail}>Send invite</Button>
                </div>
                <p className="text-xs text-muted-foreground">We’ll generate signed links that expire in 7 days and email them.</p>
              </div>

              <div>
                <Label>Attached files</Label>
                {apptFiles.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">None yet</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {apptFiles.map((af) => (
                      <li key={af.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <button className="text-sm underline underline-offset-2" onClick={() => openAttachment(af.storage_object_path)}>{af.file_name}</button>
                        <Button size="sm" variant="destructive" onClick={() => removeAttachment(af.id)}>Remove</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Event dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share event</DialogTitle>
            <DialogDescription>Send event details and optional file links.</DialogDescription>
          </DialogHeader>
          {shareForAppt && (
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input type="email" placeholder="recipient@example.com" value={shareEmail2} onChange={(e) => setShareEmail2(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="includeFiles" checked={includeFiles} onCheckedChange={setIncludeFiles} />
                <Label htmlFor="includeFiles">Include attached files (7-day links)</Label>
              </div>
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">{shareForAppt.title}</div>
                <div>{format(new Date(shareForAppt.start_at), "PPP p")} – {format(new Date(shareForAppt.end_at), "p")}</div>
                {shareForAppt.notes && <p className="mt-2">{shareForAppt.notes}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button>
                <Button onClick={shareNow} disabled={!shareEmail2 || sharing2}>Share</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Appointments;
