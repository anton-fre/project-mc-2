import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Folder, Calendar, HelpCircle, StickyNote, X } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePatient } from "@/context/PatientContext";
const Index = () => {
  useEffect(() => {
    document.title = "Project MC – Home";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Project MC: access Files, Appointments, Open Questions, and Notes.");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);
  }, []);

  const { selectedPatientId, selectedPatient } = usePatient();

  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Auth (needed to list user files)
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_evt, session) => setUserId(session?.user?.id ?? null));
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  // File multi-select state
  type PickableFile = { path: string; name: string };
  const [selectOpen, setSelectOpen] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [allFiles, setAllFiles] = useState<PickableFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [fileSearch, setFileSearch] = useState("");

  // Reset files cache and selection when patient changes
  useEffect(() => {
    setAllFiles([]);
    setSelectedPaths(new Set());
  }, [selectedPatientId]);

  const openSelectFiles = async () => {
    setSelectOpen(true);
    if (!userId) return;
    if (allFiles.length) return; // cache
    setLoadingFiles(true);
    try {
      // Load folder prefixes, scoped by selected patient if any
      const patientId = selectedPatientId;
      let foldersQuery = supabase
        .from("folders")
        .select("id,full_path,patient_id")
        .eq("user_id", userId)
        .order("full_path", { ascending: true });
      if (patientId) foldersQuery = foldersQuery.eq("patient_id", patientId);
      const { data: folders } = await foldersQuery as any;

      const prefixes: string[] = [];
      if (patientId) {
        const baseRoot = `${userId}/${patientId}`;
        prefixes.push(baseRoot);
        (folders as any[] | null)?.forEach((f: any) => {
          const p = f.full_path ? `${baseRoot}/${f.full_path}` : baseRoot;
          if (!prefixes.includes(p)) prefixes.push(p);
        });
      } else {
        const root = `${userId}`;
        prefixes.push(root);
        (folders as any[] | null)?.forEach((f: any) => {
          const base = f.patient_id ? `${userId}/${f.patient_id}` : `${userId}`;
          const p = f.full_path ? `${base}/${f.full_path}` : base;
          if (!prefixes.includes(p)) prefixes.push(p);
        });
      }
      const results = await Promise.all(
        prefixes.map(async (prefix) => {
          const { data } = await supabase.storage.from("drive").list(prefix, { limit: 1000 });
          const rows = (data as any[]) ?? [];
          return rows
            .filter((r: any) => !r.name?.startsWith?.(".") && r.name !== ".keep")
            .map((r: any) => ({ path: `${prefix}/${r.name}`, name: r.name } as PickableFile));
        })
      );
      const merged = results.flat();
      // Deduplicate by path
      const uniqueMap = new Map<string, PickableFile>();
      merged.forEach((f) => uniqueMap.set(f.path, f));
      setAllFiles(Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setLoadingFiles(false);
    }
  };

  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const clearSelected = () => setSelectedPaths(new Set());

  const removeSelected = (path: string) => setSelectedPaths((prev) => {
    const next = new Set(prev); next.delete(path); return next;
  });

  const syncFiles = async () => {
    try {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke("sync-openai-store");
      if (error) throw error;
      toast({ title: "Synced", description: `${data?.uploaded || 0} file(s) synced to AI` });
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message || "Could not sync files" });
    } finally {
      setSyncing(false);
    }
  };

  const ask = async () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");

    const files = Array.from(selectedPaths);

    const runChat = async () => {
      const { data, error } = await supabase.functions.invoke("chat-with-files", { body: { prompt: q, files } });
      if (error) throw error;
      const answer = data?.answer || "No answer.";
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    };

    try {
      setSending(true);
      await runChat();
    } catch (e: any) {
      // Always try a one-time sync + retry on any failure
      toast({ title: "Indexing files", description: "Syncing your files then retrying…" });
      try {
        await syncFiles();
        await new Promise((r) => setTimeout(r, 1000));
        await runChat();
        return;
      } catch (e2: any) {
        const msg = String(e2?.message || e?.message || "");
        toast({ title: "Chat failed", description: msg || "Could not get answer" });
      }
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="mx-auto max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[100rem] px-4 py-10">
        <h1 className="text-3xl font-bold text-foreground">Project MC</h1>
        <p className="mt-2 text-muted-foreground">Your hub for files, appointments, questions and notes.</p>
      </div>

      <main className="mx-auto max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[100rem] px-4 py-10">
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
          <Link to="/files" className="group block h-full rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <Folder className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Files</CardTitle>
              </CardHeader>
              <CardContent className="mt-auto">
                <p className="text-sm text-muted-foreground">Upload, manage, and share files.</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/appointments" className="group block h-full rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Appointments</CardTitle>
              </CardHeader>
              <CardContent className="mt-auto">
                <p className="text-sm text-muted-foreground">Schedule and track meetings.</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/questions" className="group block h-full rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Open Questions</CardTitle>
              </CardHeader>
              <CardContent className="mt-auto">
                <p className="text-sm text-muted-foreground">Track unresolved items and decisions.</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/notes" className="group block h-full rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <StickyNote className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="mt-auto">
                <p className="text-sm text-muted-foreground">Capture thoughts and ideas.</p>
              </CardContent>
            </Card>
          </Link>
        </section>

      </main>
    </div>
  );
};

export default Index;

