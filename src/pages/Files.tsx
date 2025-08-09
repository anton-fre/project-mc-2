import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Folder as FolderIcon, File as FileIcon, MoreVertical, Trash2, Download as DownloadIcon, Share2, Mail, Pencil, Plus, ChevronUp, ChevronDown } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import QuestionCreateDialog from "@/components/questions/QuestionCreateDialog";
import { usePatient } from "@/context/PatientContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  full_path: string;
}

interface FileObject {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  metadata?: any;
}

interface Patient {
  id: string;
  name: string;
}

const Files = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Patients via global context
  const { patients, selectedPatient, selectedPatientId, loading: patientsLoading, setSelectedPatientId, refresh: refreshPatients } = usePatient();

  // File system state
  const [currentPath, setCurrentPath] = useState<string>(""); // e.g. "Projects/2025"
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileObject[]>([]);
  const [fileAppointments, setFileAppointments] = useState<Record<string, { id: string; title: string | null; start_at: string }[]>>({});
  const [fileQuestionsOpenCount, setFileQuestionsOpenCount] = useState<Record<string, number>>({});

  // Multi-select
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // In-app dialogs state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'file' | 'folder' | 'bulk'; payload?: string }>({ open: false, type: 'file' });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; type: 'file' | 'folder' | 'bulk'; payload?: string }>({ open: false, type: 'file' });
  const [emailInput, setEmailInput] = useState("");
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; oldName: string | null }>({ open: false, oldName: null });
  const [renameValue, setRenameValue] = useState("");
  const [createQuestionOpen, setCreateQuestionOpen] = useState(false);
  const [pendingQuestionFile, setPendingQuestionFile] = useState<string | null>(null);

  // Summarization state
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set());
  const [summaryDialog, setSummaryDialog] = useState<{ open: boolean; file?: string; content?: string }>({ open: false });
  // Inline summary panel height (draggable)
  const [summaryHeight, setSummaryHeight] = useState<number>(280);
  const onSummaryResizeMouseDown = (e: any) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = summaryHeight;
    const min = 120;
    const max = Math.round(window.innerHeight * 0.8);
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const next = Math.min(max, Math.max(min, startHeight + delta));
      setSummaryHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Views: My Drive vs Shared with me
  const [viewMode, setViewMode] = useState<'my' | 'shared'>('my');
  const [sharedFiles, setSharedFiles] = useState<{ path: string; file_name: string; owner_user_id: string; created_at: string }[]>([]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchContent, setMatchContent] = useState(false);
  const [searching, setSearching] = useState(false);
  const [contentMatches, setContentMatches] = useState<Set<string>>(new Set());

  // Preview state
  const [preview, setPreview] = useState<{ name: string; url: string; mime: string | null } | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);


  const [sortCol, setSortCol] = useState<'name' | 'type' | 'docType' | 'appointments' | 'questions' | 'modified' | 'size'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const onSort = (col: typeof sortCol) => {
    setSortCol((prevCol) => {
      if (prevCol === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevCol;
      }
      setSortDir('asc');
      return col;
    });
  };

// SEO basics for this page
useEffect(() => {
  document.title = "Files | Project MC";
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", "Manage, upload, and share files securely with Project MC.");
}, []);

  // Auth session handling
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      const email = session?.user?.email ?? null;
      setUserId(uid);
      setUserEmail(email);
      if (!uid) navigate("/auth", { replace: true });
    });

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      const email = data.session?.user?.email ?? null;
      setUserId(uid);
      setUserEmail(email);
      if (!uid) navigate("/auth", { replace: true });
    });

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  // Selected patient and base path helpers
  // selectedPatient provided by PatientContext

  const getBasePath = () => {
    if (!userId) return "";
    const patientPrefix = selectedPatient && selectedPatient.name !== "General" ? `/${selectedPatient.id}` : "";
    return `${userId}${patientPrefix}${currentPath ? "/" + currentPath : ""}`;
  };

  // Patients are managed via PatientContext; removed local loading effect

  // Reset path when patient changes
  useEffect(() => {
    setCurrentPath("");
  }, [selectedPatientId]);

  // Resolve current folder by currentPath for this user and selected patient
  useEffect(() => {
    if (!userId || !selectedPatientId || patientsLoading) return;
    const resolveAndLoad = async () => {
      setLoading(true);
      setSelectedFiles(new Set());
      try {
        let resolved: Folder | null = null;
        if (currentPath) {
          let q = supabase
            .from("folders")
            .select("id,name,parent_id,full_path")
            .eq("full_path", currentPath);
          // Scope by patient
          if (selectedPatient && selectedPatient.name !== "General") {
            q = q.eq("patient_id", selectedPatientId);
          } else {
            q = q.is("patient_id", null);
          }
          const { data, error } = await q.maybeSingle();
          if (error) throw error;
          resolved = data as Folder | null;
        }
        setCurrentFolder(resolved);

        // Load child folders under currentFolder (or root if null) scoped by patient
        let folderQuery = supabase
          .from("folders")
          .select("id,name,parent_id,full_path")
          .order("name", { ascending: true })
          .eq("user_id", userId);
        folderQuery = selectedPatient && selectedPatient.name !== "General"
          ? folderQuery.eq("patient_id", selectedPatientId)
          : folderQuery.is("patient_id", null);

        const { data: folderRows, error: folderErr } = currentPath
          ? await folderQuery.eq("parent_id", resolved?.id ?? "__none__") // will return empty if not resolved
          : await folderQuery.is("parent_id", null);
        if (folderErr) throw folderErr;
        setFolders((folderRows as Folder[]) || []);

        // Load files directly under this path from Storage (scoped by patient)
        const base = getBasePath();
        const { data: fileRows, error: fileErr } = await supabase.storage
          .from("drive")
          .list(base, { limit: 1000, sortBy: { column: "name", order: "asc" } });
        if (fileErr) throw fileErr;
        const rows = (fileRows as FileObject[]) || [];
        const filtered = rows.filter((f) => f.name !== ".keep" && !f.name.startsWith(".") && !!f.id);
        setFiles(filtered);
        // Clean up any legacy placeholder file
        if (rows.some((f) => f.name === ".keep")) {
          try { await supabase.storage.from("drive").remove([`${base}/.keep`]); } catch {}
        }
      } catch (e: any) {
        console.error(e);
        toast({ title: "Error", description: e.message || "Failed to load items" });
      } finally {
        setLoading(false);
      }
    };
    resolveAndLoad();
  }, [userId, selectedPatientId, patientsLoading, currentPath, refreshKey]);

  // Load appointments linked to currently visible files
  useEffect(() => {
    (async () => {
      if (!userId || files.length === 0) {
        setFileAppointments({});
        return;
      }
      try {
        const base = getBasePath();
        const paths = files.map((f) => `${base}/${f.name}`);
        const { data: links, error: linksErr } = await supabase
          .from("appointment_files")
          .select("appointment_id, storage_object_path")
          .in("storage_object_path", paths);
        if (linksErr) throw linksErr;
        const byPath = new Map<string, string[]>();
        const apptIds: string[] = [];
        (links as any[]).forEach((r: any) => {
          const arr = byPath.get(r.storage_object_path) || [];
          if (!arr.includes(r.appointment_id)) arr.push(r.appointment_id);
          byPath.set(r.storage_object_path, arr);
          apptIds.push(r.appointment_id);
        });
        const uniqueIds = Array.from(new Set(apptIds));
        if (uniqueIds.length === 0) {
          setFileAppointments({});
          return;
        }
        const { data: appts, error: apptsErr } = await supabase
          .from("appointments")
          .select("id,title,start_at")
          .in("id", uniqueIds);
        if (apptsErr) throw apptsErr;
        const apptMap = new Map<string, any>();
        (appts as any[]).forEach((a: any) => apptMap.set(a.id, a));
        const result: Record<string, { id: string; title: string | null; start_at: string }[]> = {};
        for (const [p, ids] of byPath) {
          result[p] = ids.map((id) => apptMap.get(id)).filter(Boolean);
        }
        setFileAppointments(result);
      } catch {
        // ignore mapping errors
      }
    })();
  }, [userId, files, selectedPatientId, currentPath, refreshKey]);

  // Load open questions count linked to currently visible files
  useEffect(() => {
    (async () => {
      if (!userId || files.length === 0) {
        setFileQuestionsOpenCount({});
        return;
      }
      try {
        const base = getBasePath();
        const paths = files.map((f) => `${base}/${f.name}`);
        const { data: qlinks, error: qlinksErr } = await supabase
          .from("question_files")
          .select("question_id, storage_object_path")
          .in("storage_object_path", paths);
        if (qlinksErr) throw qlinksErr;
        const byPath = new Map<string, string[]>();
        const qIds: string[] = [];
        (qlinks as any[]).forEach((r: any) => {
          const arr = byPath.get(r.storage_object_path) || [];
          if (!arr.includes(r.question_id)) arr.push(r.question_id);
          byPath.set(r.storage_object_path, arr);
          qIds.push(r.question_id);
        });
        const uniqueQ = Array.from(new Set(qIds));
        if (uniqueQ.length === 0) {
          setFileQuestionsOpenCount({});
          return;
        }
        const { data: qs, error: qsErr } = await supabase
          .from("questions")
          .select("id,status")
          .in("id", uniqueQ);
        if (qsErr) throw qsErr;
        const openSet = new Set((qs as any[]).filter((q: any) => (q.status ?? "open") === "open").map((q: any) => q.id));
        const result: Record<string, number> = {};
        for (const [p, ids] of byPath) {
          const count = ids.filter((id) => openSet.has(id)).length;
          if (count > 0) result[p] = count;
        }
        setFileQuestionsOpenCount(result);
      } catch {
        // ignore mapping errors
      }
    })();
  }, [userId, files, selectedPatientId, currentPath, refreshKey]);

  const pathSegments = useMemo(() => (currentPath ? currentPath.split("/") : []), [currentPath]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredFolders = useMemo(() => {
    if (!normalizedQuery) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(normalizedQuery));
  }, [folders, normalizedQuery]);

  const filteredFiles = useMemo(() => {
    if (!normalizedQuery) return files;
    const byName = files.filter((f) => f.name.toLowerCase().includes(normalizedQuery));
    if (matchContent && contentMatches.size) {
      const byContent = files.filter((f) => contentMatches.has(f.name));
      const map = new Map<string, FileObject>();
      for (const it of [...byName, ...byContent]) map.set(it.name, it);
      return Array.from(map.values());
    }
    return byName;
  }, [files, normalizedQuery, matchContent, contentMatches]);

  const sortedFolders = useMemo(() => {
    const arr = [...filteredFolders];
    const val = (f: Folder) => {
      switch (sortCol) {
        case 'name': return f.name.toLowerCase();
        case 'type': return 'folder';
        case 'docType': return '-';
        case 'appointments': return '';
        case 'questions': return '';
        case 'modified': return '';
        case 'size': return '';
      }
    };
    arr.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredFolders, sortCol, sortDir]);

  const sortedFiles = useMemo(() => {
    const arr = [...filteredFiles];
    const base = getBasePath();
    const val = (f: FileObject) => {
      switch (sortCol) {
        case 'name': return f.name.toLowerCase();
        case 'type': return 'file';
        case 'docType': return classifyDocumentType(f.name).toLowerCase();
        case 'appointments': {
          const path = `${base}/${f.name}`;
          const count = (fileAppointments[path] || []).length;
          return count;
        }
        case 'questions': {
          const path = `${base}/${f.name}`;
          const count = fileQuestionsOpenCount[path] || 0;
          return count;
        }
        case 'modified': return f.updated_at ? new Date(f.updated_at).getTime() : 0;
        case 'size': return f.metadata?.size ? Number(f.metadata.size) : 0;
      }
    };
    arr.sort((a, b) => {
      const va = val(a) as any;
      const vb = val(b) as any;
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredFiles, sortCol, sortDir, fileAppointments, fileQuestionsOpenCount, userId, selectedPatientId, currentPath]);

  useEffect(() => {
    if (!preview) return;
    const exists = files.some((f) => f.name === preview.name);
    if (!exists) {
      setPreview(null);
      setPreviewText(null);
      setPreviewError(null);
    }
  }, [files, currentPath]);

  const onCreateFolder = async () => {
    if (!userId) return;
    const name = window.prompt("Folder name");
    if (!name) return;

    setCreatingFolder(true);
    try {
      const full_path = currentPath ? `${currentPath}/${name}` : name;
      const parent_id = currentFolder?.id ?? null;
      const { error } = await supabase.from("folders").insert({
        user_id: userId,
        name,
        parent_id,
        full_path,
        patient_id: selectedPatient && selectedPatient.name !== "General" ? selectedPatientId : null,
      });
      if (error) throw error;
      toast({ title: "Folder created", description: `${name} added` });
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to create folder" });
    } finally {
      setCreatingFolder(false);
    }
  };

  const onUpload = async (filesList: FileList | null) => {
    if (!userId || !filesList || filesList.length === 0) return;
    setUploading(true);
    try {
      const base = getBasePath();
      for (const file of Array.from(filesList)) {
        const { error } = await supabase.storage.from("drive").upload(`${base}/${file.name}`, file, { upsert: true });
        if (error) throw error;
      }
      toast({ title: "Upload complete", description: `${filesList.length} file(s) uploaded` });
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const onShareLinkFile = async (fileName: string) => {
    if (!userId) return;
    try {
      const base = getBasePath();
      const path = `${base}/${fileName}`;
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 60 * 24 * 7);
      if (error) throw error;
      if (data?.signedUrl) {
        await navigator.clipboard.writeText(data.signedUrl);
        toast({ title: "Share link copied", description: "Expires in 7 days" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Could not create share link" });
    }
  };

  const onDownload = async (fileName: string) => {
    if (!userId) return;
    try {
      const base = getBasePath();
      const path = `${base}/${fileName}`;
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 10);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Download failed" });
    }
  };

  const isWordDoc = (name: string) => /\.(docx?|dotx?)$/i.test(name);

  const openInWord = async (fileName: string) => {
    if (!userId) return;
    try {
      const base = getBasePath();
      const path = `${base}/${fileName}`;
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 10);
      if (error || !data?.signedUrl) throw error || new Error("No URL");
      const wordUrl = `ms-word:ofe|u|${encodeURIComponent(data.signedUrl)}`;
      const fallback = setTimeout(() => {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }, 1500);
      window.location.href = wordUrl;
      const handler = () => clearTimeout(fallback);
      window.addEventListener("blur", handler, { once: true });
      setTimeout(handler, 2000);
    } catch (e: any) {
      toast({ title: "Open in Word failed", description: e.message || "Could not open in Word" });
    }
  };

  const openPreview = async (fileName: string) => {
    if (!userId) return;
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewText(null);
      const base = getBasePath();
      const path = `${base}/${fileName}`;
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 10);
      if (error || !data?.signedUrl) throw error || new Error("No URL");
      const fileObj = files.find((f) => f.name === fileName);
      const mime = (fileObj as any)?.metadata?.mimetype ?? null;
      setPreview({ name: fileName, url: data.signedUrl, mime });
      if (isTextLike(mime, fileName)) {
        const resp = await fetch(data.signedUrl);
        const txt = await resp.text();
        setPreviewText(txt);
      }
    } catch (e: any) {
      setPreviewError(e.message || "Failed to open preview");
      toast({ title: "Preview failed", description: e.message || "Could not open preview" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreview(null);
    setPreviewText(null);
    setPreviewError(null);
  };

  const isTextLike = (ct: string | null, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext && ["txt","md","json","csv","ts","tsx","js","jsx","css","html","xml","yml","yaml"].includes(ext)) return true;
    if (!ct) return false;
    const lower = ct.toLowerCase();
    if (lower.startsWith("text/")) return true;
    if (lower === "application/json") return true;
    if (lower === "application/xml" || lower === "text/xml" || lower.endsWith("+xml")) {
      if (lower.includes("officedocument") || lower.includes("openxml") || lower.includes("msword") || lower.includes("zip")) return false;
      return true;
    }
    return false;
  };

  const isPdf = (ct: string | null, name: string) => (ct?.includes("pdf") ?? false) || /\.pdf$/i.test(name);
  const isDocx = (ct: string | null, name: string) => (ct?.includes("officedocument.wordprocessingml.document") ?? false) || /\.docx$/i.test(name);
  const isImage = (ct: string | null, name: string) => (ct?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
  const classifyDocumentType = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (/(doc|docx|dot|dotx)$/.test(ext)) return "Word";
    if (/(xls|xlsx|csv)$/.test(ext)) return "Spreadsheet";
    if (/(ppt|pptx)$/.test(ext)) return "Presentation";
    if (/(pdf)$/.test(ext)) return "PDF";
    if (/(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)) return "Image";
    if (/(txt|md)$/.test(ext)) return "Text";
    if (/(json|xml|yml|yaml)$/.test(ext)) return "Data";
    return ext.toUpperCase() || "File";
  };
  const getOfficeViewerUrl = (url: string) => `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;

  // Extract simple text from a PDF (first few pages) on the client
  const extractPdfTextFromBlob = async (blob: Blob): Promise<string> => {
    const pdfjsLib: any = await import('pdfjs-dist');
    const data = await blob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const pages = Math.min(pdf.numPages, 8);
    let full = '';
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it: any) => it.str).join(' ');
      full += text + '\n';
    }
    return full;
  };

  // Summarize a file using a Gemini-powered edge function
  const summarizeFile = async (fileName: string) => {
    if (!userId) return;
    try {
      setSummarizing((s) => new Set(s).add(fileName));
      const base = getBasePath();
      const path = `${base}/${fileName}`;
      const { data, error } = await supabase.storage.from('drive').createSignedUrl(path, 60 * 5);
      if (error || !data?.signedUrl) throw error || new Error('No URL');

      const fileObj = files.find((f) => f.name === fileName);
      const mime = (fileObj as any)?.metadata?.mimetype ?? null;
      let text = '';
      if (isTextLike(mime, fileName)) {
        const resp = await fetch(data.signedUrl);
        text = await resp.text();
      } else if (isPdf(mime, fileName)) {
        const resp = await fetch(data.signedUrl);
        const blob = await resp.blob();
        text = await extractPdfTextFromBlob(blob);
      } else if (isDocx(mime, fileName)) {
        const resp = await fetch(data.signedUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const mammoth: any = await import('mammoth/mammoth.browser');
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result?.value || '';
      } else {
        toast({ title: 'Unsupported', description: 'Only text, PDF, and Word (.docx) files are supported for summarization yet.' });
        return;
      }

      // Limit text to keep costs and latency low
      text = text.slice(0, 120000);

      const { data: fnData, error: fnError } = await supabase.functions.invoke('summarize-document', { body: { text, fileName } });
      if (fnError) throw fnError;
      const summary = (fnData as any)?.summary || 'No summary generated.';
      setSummaryDialog({ open: true, file: fileName, content: summary });
    } catch (e: any) {
      toast({ title: 'Summarize failed', description: e.message || 'Could not summarize' });
    } finally {
      setSummarizing((s) => { const next = new Set(s); next.delete(fileName); return next; });
    }
  };

  const handleSearchContents = async () => {
    setSearching(true);
    try {
      const q = searchQuery.toLowerCase();
      const matches = new Set<string>();
      const base = getBasePath();
      for (const f of files) {
        const path = `${base}/${f.name}`;
        const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 5);
        if (error || !data?.signedUrl) continue;
        try {
          const resp = await fetch(data.signedUrl, { headers: { Range: "bytes=0-1048575" } });
          const ct = resp.headers.get("content-type");
          if (!isTextLike(ct, f.name)) continue;
          const text = await resp.text();
          if (text.toLowerCase().includes(q)) {
            matches.add(f.name);
          }
        } catch {}
      }
      setContentMatches(matches);
      toast({ title: "Content search complete", description: `${matches.size} file(s) matched` });
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message || "Could not search file contents" });
    } finally {
      setSearching(false);
    }
  };
  const SortHeader = ({ col, label, alignRight = false, className = "" }: { col: typeof sortCol; label: string; alignRight?: boolean; className?: string }) => {
    const active = sortCol === col;
    return (
      <button
        type="button"
        className={`inline-flex w-full items-center gap-1 select-none ${alignRight ? 'justify-end text-right' : 'justify-start text-left'} ${className}`}
        onClick={() => onSort(col)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className="inline-flex">
          {active ? (sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : (
            <ChevronUp className="h-3.5 w-3.5 opacity-30" />
          )}
        </span>
      </button>
    );
  };
  const onGoTo = (segmentIndex: number | null) => {
    if (segmentIndex === null) {
      setCurrentPath("");
    } else {
      const next = pathSegments.slice(0, segmentIndex + 1).join("/");
      setCurrentPath(next);
    }
  };

  const onOpenFolder = (name: string) => {
    const next = currentPath ? `${currentPath}/${name}` : name;
    setCurrentPath(next);
  };

  const deleteFile = async (name: string) => {
    if (!userId) return;
    const base = getBasePath();
    const path = `${base}/${name}`;
    const { error } = await supabase.storage.from("drive").remove([path]);
    if (error) return toast({ title: "Delete failed", description: error.message });
    toast({ title: "Deleted", description: name });
    setRefreshKey((k) => k + 1);
  };

  const listFilesInPrefix = async (prefix: string) => {
    const { data, error } = await supabase.storage.from("drive").list(prefix, { limit: 1000 });
    if (error) throw error;
    return data ?? [];
  };

  const deleteFolderRecursive = async (folderName: string) => {
    if (!userId) return;
    const delFullPath = currentPath ? `${currentPath}/${folderName}` : folderName;

    try {
      // Get all descendant folder paths from DB
      const { data: descendantRows, error: selErr } = await supabase
        .from("folders")
        .select("full_path")
        .eq("user_id", userId)
        .or(`full_path.eq.${delFullPath},full_path.like.${delFullPath}/%`)
        .filter("patient_id", selectedPatient && selectedPatient.name !== "General" ? "eq" : "is", selectedPatient && selectedPatient.name !== "General" ? selectedPatientId : null as any);

      if (selErr) throw selErr;
      const folderPaths = [delFullPath, ...(descendantRows?.map((r: any) => r.full_path) || [])].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      // Gather all file paths under those folders
      const toRemove: string[] = [];
      for (const fp of folderPaths) {
        const rootPrefix = selectedPatient && selectedPatient.name !== "General" ? `${userId}/${selectedPatient.id}` : `${userId}`;
        const base = `${rootPrefix}/${fp}`;
        const list = await listFilesInPrefix(base);
        for (const f of list) {
          toRemove.push(`${base}/${f.name}`);
        }
      }
      if (toRemove.length) {
        const { error: remErr } = await supabase.storage.from("drive").remove(toRemove);
        if (remErr) throw remErr;
      }

      // Delete folder records
      const { error: delErr } = await supabase
        .from("folders")
        .delete()
        .eq("user_id", userId)
        .or(`full_path.eq.${delFullPath},full_path.like.${delFullPath}/%`)
        .filter("patient_id", selectedPatient && selectedPatient.name !== "General" ? "eq" : "is", selectedPatient && selectedPatient.name !== "General" ? selectedPatientId : null as any);

      if (delErr) throw delErr;

      toast({ title: "Folder deleted", description: delFullPath });
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message || "Could not delete folder" });
    }
  };

  const shareViaEmail = async (email: string, links: string[], subject: string) => {
    const { error } = await supabase.functions.invoke("send-share-email", {
      body: { toEmail: email, subject, links },
    });
    if (error) throw error;
  };

  const onShareEmailFile = async (fileName: string) => {
    if (!userId) return;
    const to = window.prompt("Recipient email?");
    if (!to) return;
    try {
      const base = getBasePath();
      const path = `${base}/${fileName}`;
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(path, 60 * 60 * 24 * 7);
      if (error) throw error;
      const link = data?.signedUrl ? [data.signedUrl] : [];
      await shareViaEmail(to, link, `File shared with you: ${fileName}`);
      toast({ title: "Email sent", description: `Shared ${fileName} with ${to}` });
    } catch (e: any) {
      toast({ title: "Share failed", description: e.message || "Could not send email" });
    }
  };

  const onShareEmailFolder = async (folderName: string) => {
    if (!userId) return;
    const to = window.prompt("Recipient email?");
    if (!to) return;
    const delFullPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    try {
      const { data: descendantRows, error: selErr } = await supabase
        .from("folders")
        .select("full_path")
        .eq("user_id", userId)
        .or(`full_path.eq.${delFullPath},full_path.like.${delFullPath}/%`)
        .filter("patient_id", selectedPatient && selectedPatient.name !== "General" ? "eq" : "is", selectedPatient && selectedPatient.name !== "General" ? selectedPatientId : null as any);

      if (selErr) throw selErr;
      const folderPaths = [delFullPath, ...(descendantRows?.map((r: any) => r.full_path) || [])].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      const links: string[] = [];
      for (const fp of folderPaths) {
        const rootPrefix = selectedPatient && selectedPatient.name !== "General" ? `${userId}/${selectedPatient.id}` : `${userId}`;
        const base = `${rootPrefix}/${fp}`;
        const list = await listFilesInPrefix(base);
        for (const f of list) {
          const { data, error } = await supabase.storage
            .from("drive")
            .createSignedUrl(`${base}/${f.name}`, 60 * 60 * 24 * 7);
          if (error) throw error;
          if (data?.signedUrl) links.push(data.signedUrl);
        }
      }

      if (links.length === 0) {
        toast({ title: "No files to share", description: "Folder is empty" });
        return;
      }

      await shareViaEmail(to, links, `Folder shared with you: ${delFullPath}`);
      toast({ title: "Email sent", description: `Shared ${links.length} file(s) with ${to}` });
    } catch (e: any) {
      toast({ title: "Share failed", description: e.message || "Could not send email" });
    }
  };


  // Patient management
  const onAddPatient = async () => {
    if (!userId) return;
    const name = window.prompt("Patient name");
    if (!name || !name.trim()) return;
    try {
      const { data, error } = await supabase
        .from("patients")
        .insert({ user_id: userId, name: name.trim() })
        .select("id,name")
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const p = data as Patient;
        await refreshPatients();
        setSelectedPatientId(p.id);
        toast({ title: "Patient added", description: p.name });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to add patient" });
    }
  };

  const onDeletePatient = async () => {
    if (!userId || !selectedPatient) return;
    if (selectedPatient.name === "General") {
      toast({ title: "Not allowed", description: "Cannot delete the General patient" });
      return;
    }
    if (!window.confirm(`Delete patient "${selectedPatient.name}"? This cannot be undone.`)) return;
    try {
      const { count, error: cntErr } = await supabase
        .from("folders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("patient_id", selectedPatient.id);
      if (cntErr) throw cntErr;

      const rootPrefix = `${userId}/${selectedPatient.id}`;
      const { data: rootList, error: listErr } = await supabase.storage.from("drive").list(rootPrefix, { limit: 1 });
      if (listErr) throw listErr;

      if ((count ?? 0) > 0 || (rootList?.length ?? 0) > 0) {
        toast({ title: "Patient not empty", description: "Delete files and folders first" });
        return;
      }

      const { error: delErr } = await supabase.from("patients").delete().eq("id", selectedPatient.id);
      if (delErr) throw delErr;
      await refreshPatients();
      if (selectedPatientId === selectedPatient.id) {
        setSelectedPatientId(null);
      }
      toast({ title: "Patient deleted", description: selectedPatient.name });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete patient" });
    }
  };

  // Multi-select helpers
  const allSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selectedFiles.has(f.name));
  const toggleSelectAll = (checked: boolean | string) => {
    const c = !!checked;
    setSelectedFiles(c ? new Set(filteredFiles.map((f) => f.name)) : new Set());
  };
  const toggleFile = (name: string, checked: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name); else next.delete(name);
      return next;
    });
  };

  const bulkDeleteSelected = async () => {
    if (!userId || selectedFiles.size === 0) return;
    try {
      const base = getBasePath();
      const paths = Array.from(selectedFiles).map((n) => `${base}/${n}`);
      const { error } = await supabase.storage.from("drive").remove(paths);
      if (error) throw error;
      toast({ title: "Deleted", description: `${selectedFiles.size} file(s)` });
      setSelectedFiles(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message || "Could not delete selected files" });
    }
  };

  const bulkDownloadSelected = async () => {
    if (!userId || selectedFiles.size === 0) return;
    const base = getBasePath();
    for (const n of Array.from(selectedFiles)) {
      const { data, error } = await supabase.storage.from("drive").createSignedUrl(`${base}/${n}`, 60 * 10);
      if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const bulkCopyLinksSelected = async () => {
    if (!userId || selectedFiles.size === 0) return;
    try {
      const base = getBasePath();
      const links: string[] = [];
      for (const n of Array.from(selectedFiles)) {
        const { data, error } = await supabase.storage.from("drive").createSignedUrl(`${base}/${n}`, 60 * 60 * 24 * 7);
        if (error) throw error;
        if (data?.signedUrl) links.push(data.signedUrl);
      }
      if (links.length) {
        await navigator.clipboard.writeText(links.join("\n"));
        toast({ title: "Links copied", description: `${links.length} link(s)` });
      }
    } catch (e: any) {
      toast({ title: "Share failed", description: e.message || "Could not create links" });
    }
  };

  const bulkShareEmailSelected = async () => {
    if (!userId || selectedFiles.size === 0) return;
    const to = window.prompt("Recipient email?");
    if (!to) return;
    try {
      const base = getBasePath();
      const links: string[] = [];
      for (const n of Array.from(selectedFiles)) {
        const { data, error } = await supabase.storage.from("drive").createSignedUrl(`${base}/${n}`, 60 * 60 * 24 * 7);
        if (error) throw error;
        if (data?.signedUrl) links.push(data.signedUrl);
      }
      if (links.length === 0) return;
      await shareViaEmail(to, links, `Files shared with you (${links.length})`);
      toast({ title: "Email sent", description: `Shared ${links.length} file(s) with ${to}` });
    } catch (e: any) {
      toast({ title: "Share failed", description: e.message || "Could not send email" });
    }
  };

const renameFile = async (oldName: string) => {
  if (!userId) return;
  const newName = window.prompt("New name", oldName);
  if (!newName || newName === oldName) return;
  try {
    const base = getBasePath();
    const { error } = await supabase.storage.from("drive").move(`${base}/${oldName}`, `${base}/${newName}`);
    if (error) throw error;
    toast({ title: "Renamed", description: `${oldName} → ${newName}` });
    setSelectedFiles(new Set());
    setRefreshKey((k) => k + 1);
  } catch (e: any) {
    toast({ title: "Rename failed", description: e.message || "Could not rename file" });
  }
};

const renameSelected = async () => {
    if (!userId || selectedFiles.size !== 1) return;
    const oldName = Array.from(selectedFiles)[0];
    setRenameDialog({ open: true, oldName });
    setRenameValue(oldName);
  };

  const addQuestionForFile = async (fileName: string) => {
    if (!userId) return;
    try {
      const { data: q, error: qErr } = await supabase
        .from('questions')
        .insert({ user_id: userId, title: fileName, description: null, status: 'open' })
        .select('id')
        .maybeSingle();
      if (qErr) throw qErr;
      const base = getBasePath();
      const path = `${base}/${fileName}`;
      const { error: linkErr } = await supabase
        .from('question_files')
        .insert({ user_id: userId, question_id: (q as any)?.id, storage_object_path: path, file_name: fileName });
      if (linkErr) throw linkErr;
      toast({ title: 'Question created', description: 'Linked to file' });
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast({ title: 'Add question failed', description: e.message || 'Could not create question' });
    }
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[100rem] px-4 py-6">
        <section className="mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => onGoTo(null)} className="cursor-pointer">My Drive</BreadcrumbLink>
              </BreadcrumbItem>
              {pathSegments.map((seg, idx) => (
                <>
                  <BreadcrumbSeparator key={`sep-${idx}`} />
                  <BreadcrumbItem key={seg + idx}>
                    {idx === pathSegments.length - 1 ? (
                      <BreadcrumbPage>{seg}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink onClick={() => onGoTo(idx)} className="cursor-pointer">{seg}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </section>

        <section className="mb-6 flex flex-wrap items-center gap-2 justify-end">
          <div className="flex items-center gap-3">
            <Button onClick={onCreateFolder} disabled={creatingFolder}>
              {creatingFolder ? "Creating..." : "New Folder"}
            </Button>
            <label className="inline-flex items-center gap-2">
              <Input type="file" multiple onChange={(e) => onUpload(e.target.files)} />
            </label>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <Input
              placeholder="Search files"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Switch id="search-contents" checked={matchContent} onCheckedChange={(v) => setMatchContent(!!v)} />
              <Label htmlFor="search-contents">Search inside files</Label>
            </div>
            <Button variant="secondary" onClick={handleSearchContents} disabled={!searchQuery || searching || !matchContent}>
              {searching ? "Searching..." : "Search contents"}
            </Button>
          </div>
        </section>

        {selectedFiles.size > 0 && (
          <section aria-label="Bulk actions" className="mb-4 rounded-md border border-border bg-card p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedFiles.size} selected</span>
            <Button variant="destructive" onClick={() => setDeleteConfirm({ open: true, type: 'bulk' })}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
            <Button variant="secondary" onClick={bulkDownloadSelected}>
              <DownloadIcon className="h-4 w-4 mr-2" /> Download
            </Button>
            <Button variant="secondary" onClick={bulkCopyLinksSelected}>
              <Share2 className="h-4 w-4 mr-2" /> Copy links
            </Button>
            <Button variant="secondary" onClick={() => { setEmailDialog({ open: true, type: 'bulk' }); setEmailInput(''); }}>
              <Mail className="h-4 w-4 mr-2" /> Share via email
            </Button>
            <Button onClick={renameSelected} disabled={selectedFiles.size !== 1}>
              <Pencil className="h-4 w-4 mr-2" /> Rename
            </Button>
            <Button variant="ghost" onClick={() => setSelectedFiles(new Set())}>Clear</Button>
          </section>
        )}

        <section aria-label="Items" className="mb-20">
          <ResizablePanelGroup direction="horizontal" className="w-full h-[70vh]">
            <ResizablePanel defaultSize={60} minSize={15}>
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
                <p className="text-muted-foreground">{searchQuery ? "No items match your search" : "No files added. Start adding files."}</p>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="flex-1 rounded-md border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3"><SortHeader col="name" label="Name" /></TableHead>
                        <TableHead><SortHeader col="type" label="Type" /></TableHead>
                        <TableHead><SortHeader col="docType" label="Document Type" /></TableHead>
                        <TableHead><SortHeader col="appointments" label="Appointments" /></TableHead>
                        <TableHead><SortHeader col="questions" label="Questions" /></TableHead>
                        <TableHead><SortHeader col="modified" label="Modified" /></TableHead>
                        <TableHead className="text-right"><SortHeader col="size" label="Size" alignRight /></TableHead>
                        <TableHead className="w-40 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedFolders.map((f) => (
                        <TableRow key={f.id} className="hover:bg-accent">
                          <TableCell onClick={() => onOpenFolder(f.name)}>
                            <div className="grid grid-cols-[1.25rem_1rem_1fr] items-start gap-2 cursor-pointer">
                              <span className="block w-5 h-4" aria-hidden />
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Menu for folder ${f.name}`}
                                    className="inline-flex"
                                  >
                                    <FolderIcon className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="z-50">
                                  <DropdownMenuLabel>Folder actions</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => onOpenFolder(f.name)}>Open</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => { setEmailDialog({ open: true, type: 'folder', payload: f.name }); setEmailInput(''); }}>Share via email</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeleteConfirm({ open: true, type: 'folder', payload: f.name })} className="text-destructive">
                                    Delete permanently
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <span className="font-medium text-foreground">{f.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>Folder</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-right text-muted-foreground">-</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Actions for folder ${f.name}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="z-50">
                                <DropdownMenuLabel>Folder actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onOpenFolder(f.name)}>Open</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setEmailDialog({ open: true, type: 'folder', payload: f.name }); setEmailInput(''); }}>Share via email</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDeleteConfirm({ open: true, type: 'folder', payload: f.name })} className="text-destructive">
                                  Delete permanently
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}

                      {sortedFiles.map((file) => (
                        <TableRow key={file.name}>
                          <TableCell onDoubleClick={() => { setRenameDialog({ open: true, oldName: file.name }); setRenameValue(file.name); }}>
                            <div className="grid grid-cols-[1.25rem_1rem_1fr] items-start gap-2">
                              <Checkbox
                                checked={selectedFiles.has(file.name)}
                                onCheckedChange={(v) => toggleFile(file.name, !!v)}
                                aria-label={`Select ${file.name}`}
                              />
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Menu for file ${file.name}`}
                                    className="inline-flex"
                                  >
                                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="z-50">
                                  <DropdownMenuLabel>File actions</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => onDownload(file.name)}>Download</DropdownMenuItem>
                                  {isWordDoc(file.name) && (
                                    <DropdownMenuItem onClick={() => openInWord(file.name)}>Open in Word</DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => onShareLinkFile(file.name)}>Copy share link</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setEmailDialog({ open: true, type: 'file', payload: file.name }); setEmailInput(''); }}>Share via email</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeleteConfirm({ open: true, type: 'file', payload: file.name })} className="text-destructive">
                                    Delete permanently
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <div className="flex items-center gap-2">
                                <button
                                  className="text-foreground underline-offset-2 hover:underline text-left break-words"
                                  onClick={(e) => { e.stopPropagation(); openPreview(file.name); }}
                                >
                                  {file.name}
                                </button>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>File</TableCell>
                          <TableCell className="text-muted-foreground">{classifyDocumentType(file.name)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {(() => {
                              const path = `${getBasePath()}/${file.name}`;
                              const list = fileAppointments[path] || [];
                              if (!list.length) return "-";
                              return (
                                <span className="inline-flex flex-wrap gap-x-2">
                                  {list.map((a) => (
                                    <a
                                      key={a.id}
                                      href={`/appointments?date=${new Date(a.start_at).toISOString().slice(0,10)}&appt=${a.id}`}
                                      className="underline underline-offset-2"
                                    >
                                      {a.title || new Date(a.start_at).toLocaleString()}
                                    </a>
                                  ))}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {(() => {
                              const path = `${getBasePath()}/${file.name}`;
                              const count = fileQuestionsOpenCount[path] || 0;
                              return (
                                <div className="flex items-center gap-2">
                                  {count > 0 ? (
                                    <a href={`/questions?file=${encodeURIComponent(path)}`} className="underline underline-offset-2">
                                      Open ({count})
                                    </a>
                                  ) : (
                                    <span>-</span>
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`Add question for ${file.name}`}
                                    title="Add question"
                                    onClick={(e) => { e.stopPropagation(); setPendingQuestionFile(file.name); setCreateQuestionOpen(true); }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {file.updated_at ? new Date(file.updated_at).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {file.metadata?.size ? `${(file.metadata.size / 1024).toFixed(1)} KB` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => summarizeFile(file.name)}
                                disabled={summarizing.has(file.name)}
                                aria-label={`Summarize ${file.name}`}
                              >
                                {summarizing.has(file.name) ? "Summarizing…" : "Summarize"}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" aria-label={`Actions for file ${file.name}`}>
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-50">
                                  <DropdownMenuLabel>File actions</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => onDownload(file.name)}>Download</DropdownMenuItem>
                                  {isWordDoc(file.name) && (
                                    <DropdownMenuItem onClick={() => openInWord(file.name)}>Open in Word</DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => onShareLinkFile(file.name)}>Copy share link</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setEmailDialog({ open: true, type: 'file', payload: file.name }); setEmailInput(''); }}>Share via email</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeleteConfirm({ open: true, type: 'file', payload: file.name })} className="text-destructive">
                                    Delete permanently
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {summaryDialog.open && (
                  <section
                    className="mt-4 rounded-md border border-border bg-card p-4 relative flex flex-col"
                    aria-live="polite"
                    style={{ height: summaryHeight }}
                  >
                    <div
                      className="-mt-4 -mx-4 h-3 cursor-row-resize hover:bg-accent transition-colors select-none"
                      onMouseDown={onSummaryResizeMouseDown}
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label="Resize summary panel"
                      title="Drag to resize"
                    />
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-base font-medium text-foreground">{`Summary${summaryDialog.file ? ` — ${summaryDialog.file}` : ''}`}</h2>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setSummaryDialog({ open: false })}>Close</Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto text-sm leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{ a: (props) => (<a {...props} target="_blank" rel="noreferrer noopener" />) }}
                      >
                        {summaryDialog.content || 'No summary available.'}
                      </ReactMarkdown>
                    </div>
                  </section>
                )}
                </div>
              )}
            </ResizablePanel>
            {preview && (
              <>
                <ResizableHandle withHandle className="w-2 sm:w-3 hover:bg-accent transition-colors" />
                <ResizablePanel defaultSize={40} minSize={20}>
                  <div className="h-full flex flex-col">
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-base font-medium text-foreground">Preview</h2>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={closePreview}>Close</Button>
                      </div>
                    </div>
                    <div className="flex-1 rounded-md border border-border bg-card overflow-hidden">
                      {previewLoading ? (
                        <div className="w-full h-full grid place-items-center text-muted-foreground">Loading preview…</div>
                      ) : previewError ? (
                        <div className="p-4 text-sm text-destructive">{previewError}</div>
                      ) : isWordDoc(preview.name) ? (
                        <iframe title="DOCX preview" src={getOfficeViewerUrl(preview.url)} className="w-full h-full" />
                      ) : isPdf(preview.mime, preview.name) ? (
                        <iframe title="PDF preview" src={preview.url} className="w-full h-full" />
                      ) : isImage(preview.mime, preview.name) ? (
                        <div className="w-full h-full bg-background flex items-center justify-center">
                          <img src={preview.url} alt={`Preview of ${preview.name}`} className="max-w-full max-h-full object-contain" />
                        </div>
                      ) : previewText ? (
                        <pre className="w-full h-full p-4 whitespace-pre-wrap text-sm overflow-auto"><code>{previewText}</code></pre>
                      ) : (
                        <div className="w-full h-full grid place-items-center text-muted-foreground">Preview not available</div>
                      )}
                    </div>
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </section>


        {/* In-app dialogs */}
        <QuestionCreateDialog
          open={createQuestionOpen}
          onOpenChange={(o) => {
            setCreateQuestionOpen(o);
            if (!o) setPendingQuestionFile(null);
          }}
          userId={userId!}
          defaultTitle={pendingQuestionFile || ""}
          onCreated={async (qid) => {
            if (!pendingQuestionFile) return;
            const base = getBasePath();
            const path = `${base}/${pendingQuestionFile}`;
            await supabase
              .from('question_files')
              .insert({ user_id: userId, question_id: qid, storage_object_path: path, file_name: pendingQuestionFile });
            setRefreshKey((k) => k + 1);
          }}
        />
        <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm delete</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteConfirm.type === 'bulk'
                  ? `Delete ${selectedFiles.size} selected file(s)? This cannot be undone.`
                  : deleteConfirm.type === 'file'
                  ? `Delete "${deleteConfirm.payload}"? This cannot be undone.`
                  : `Delete folder "${deleteConfirm.payload}" and all its contents? This cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (deleteConfirm.type === 'bulk') {
                    await bulkDeleteSelected();
                  } else if (deleteConfirm.type === 'file' && deleteConfirm.payload) {
                    await deleteFile(deleteConfirm.payload);
                  } else if (deleteConfirm.type === 'folder' && deleteConfirm.payload) {
                    await deleteFolderRecursive(deleteConfirm.payload);
                  }
                  setDeleteConfirm({ open: false, type: 'file' });
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={emailDialog.open} onOpenChange={(o) => setEmailDialog((s) => ({ ...s, open: o }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share via email</DialogTitle>
              <DialogDescription>We will generate time-limited links and send them.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="share-email">Recipient email</Label>
              <Input id="share-email" type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="name@example.com" />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEmailDialog((s) => ({ ...s, open: false }))}>Cancel</Button>
              <Button
                onClick={async () => {
                  const to = emailInput.trim();
                  if (!to) {
                    toast({ title: 'Email required', description: 'Please enter a valid email', variant: 'destructive' as any });
                    return;
                  }
                  try {
                    if (emailDialog.type === 'file' && emailDialog.payload) {
                      const base = getBasePath();
                      const path = `${base}/${emailDialog.payload}`;
                      const { data, error } = await supabase.storage.from('drive').createSignedUrl(path, 60 * 60 * 24 * 7);
                      if (error) throw error;
                      const link = data?.signedUrl ? [data.signedUrl] : [];
                      await shareViaEmail(to, link, `File shared with you: ${emailDialog.payload}`);
                    } else if (emailDialog.type === 'folder' && emailDialog.payload) {
                      const delFullPath = currentPath ? `${currentPath}/${emailDialog.payload}` : emailDialog.payload;
                      const { data: descendantRows, error: selErr } = await supabase
                        .from('folders')
                        .select('full_path')
                        .eq('user_id', userId)
                        .or(`full_path.eq.${delFullPath},full_path.like.${delFullPath}/%`)
                        .filter('patient_id', selectedPatient && selectedPatient.name !== 'General' ? 'eq' : 'is', selectedPatient && selectedPatient.name !== 'General' ? selectedPatientId : null as any);
                      if (selErr) throw selErr;
                      const folderPaths = [delFullPath, ...(descendantRows?.map((r: any) => r.full_path) || [])].filter((v, i, a) => a.indexOf(v) === i);
                      const links: string[] = [];
                      for (const fp of folderPaths) {
                        const rootPrefix = selectedPatient && selectedPatient.name !== 'General' ? `${userId}/${selectedPatient.id}` : `${userId}`;
                        const base = `${rootPrefix}/${fp}`;
                        const list = await listFilesInPrefix(base);
                        for (const f of list) {
                          const { data, error } = await supabase.storage.from('drive').createSignedUrl(`${base}/${f.name}`, 60 * 60 * 24 * 7);
                          if (!error && data?.signedUrl) links.push(data.signedUrl);
                        }
                      }
                      if (links.length === 0) {
                        toast({ title: 'No files to share', description: 'Folder is empty' });
                        return;
                      }
                      await shareViaEmail(to, links, `Folder shared with you: ${delFullPath}`);
                    } else if (emailDialog.type === 'bulk') {
                      const base = getBasePath();
                      const links: string[] = [];
                      for (const n of Array.from(selectedFiles)) {
                        const { data, error } = await supabase.storage.from('drive').createSignedUrl(`${base}/${n}`, 60 * 60 * 24 * 7);
                        if (!error && data?.signedUrl) links.push(data.signedUrl);
                      }
                      if (links.length === 0) return;
                      await shareViaEmail(to, links, `Files shared with you (${links.length})`);
                    }
                    toast({ title: 'Email sent' });
                    setEmailDialog({ open: false, type: 'file' });
                    setEmailInput('');
                  } catch (e: any) {
                    toast({ title: 'Share failed', description: e.message || 'Could not send email', variant: 'destructive' as any });
                  }
                }}
              >
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={renameDialog.open} onOpenChange={(o) => setRenameDialog((s) => ({ ...s, open: o }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename file</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="rename-input">New name</Label>
              <Input id="rename-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setRenameDialog({ open: false, oldName: null })}>Cancel</Button>
              <Button
                onClick={async () => {
                  if (!renameDialog.oldName || !renameValue || renameValue === renameDialog.oldName) { setRenameDialog({ open: false, oldName: null }); return; }
                  try {
                    const base = getBasePath();
                    const { error } = await supabase.storage.from('drive').move(`${base}/${renameDialog.oldName}`, `${base}/${renameValue}`);
                    if (error) throw error;
                    toast({ title: 'Renamed', description: `${renameDialog.oldName} → ${renameValue}` });
                    setSelectedFiles(new Set());
                    setRefreshKey((k) => k + 1);
                    setRenameDialog({ open: false, oldName: null });
                  } catch (e: any) {
                    toast({ title: 'Rename failed', description: e.message || 'Could not rename file', variant: 'destructive' as any });
                  }
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


      </main>
    </div>
  );
};

export default Files;
