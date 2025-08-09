import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { usePatient } from "@/context/PatientContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MoreVertical, ChevronUp, ChevronDown } from "lucide-react";
interface Patient { id: string; name: string }
interface DocRow {
  id: string;
  user_id: string;
  patient_id: string | null;
  file_path: string;
  file_name: string;
  ocr_text: string | null;
  status: string;
  created_at: string;
}

const DigitalizeDocumentation = () => {
  const [userId, setUserId] = useState<string | null>(null);

  // SEO
  useEffect(() => {
    document.title = "Digitalize documentation | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Upload PDFs and images per patient; OCR to make them searchable.");
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = window.location.href;
  }, []);

  // Auth
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id ?? null));
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Patients via global context
  const { patients, selectedPatientId, setSelectedPatientId } = usePatient();
  const patientSelectValue = selectedPatientId ?? "__general__";

  // Docs list
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<'name'|'status'|'added'>('name');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  // Dialog and action state
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateText, setTranslateText] = useState<string>("");
  const [translateDoc, setTranslateDoc] = useState<DocRow | null>(null);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteDoc, setPromoteDoc] = useState<DocRow | null>(null);
  const [promotePatientId, setPromotePatientId] = useState<string | null>(selectedPatientId);

  const isDocxName = (name: string, type?: string) => !!(name?.toLowerCase().endsWith('.docx') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  const onSort = (col: typeof sortCol) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('asc');
      return col;
    });
  };

  const loadDocs = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let q = supabase.from("digital_documents").select("id,user_id,patient_id,file_path,file_name,ocr_text,status,created_at").eq("user_id", userId).order("created_at", { ascending: false });
      if (selectedPatientId) {
        q = q.eq("patient_id", selectedPatientId);
      } else {
        q = q.is("patient_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      setDocs((data as DocRow[]) ?? []);
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDocs(); }, [userId, selectedPatientId]);

  // Realtime refresh
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("digital-docs-changes")
      .on('postgres_changes', { event: '*', schema: 'public', table: 'digital_documents' }, loadDocs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, selectedPatientId]);

  const basePrefix = (uid: string, pid: string | null) => pid ? `${uid}/${pid}` : `${uid}`;
  const handleUpload = async (files: FileList | null) => {
    if (!userId || !files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const prefix = `${basePrefix(userId, selectedPatientId)}/digitalized`;
        const storagePath = `${prefix}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from('drive').upload(storagePath, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        const { data: row, error: insErr } = await supabase
          .from('digital_documents')
          .insert({ user_id: userId, patient_id: selectedPatientId, file_path: storagePath, file_name: file.name, status: 'processing' })
          .select("*").maybeSingle();
        if (insErr) throw insErr;
        toast({ title: 'Uploaded', description: file.name });

        // DOCX: extract text via mammoth; otherwise run OCR
        if (isDocxName(file.name, file.type)) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const mammoth: any = await import('mammoth');
            const { value } = await mammoth.extractRawText({ arrayBuffer });
            const text = value || '';
            await supabase
              .from('digital_documents')
              .update({ ocr_text: text || null, status: 'processed' })
              .eq('id', row!.id)
              .eq('user_id', userId!);
          } catch (err) {
            console.error('DOCX parse failed', err);
            await supabase.from('digital_documents').update({ status: 'error' }).eq('id', row!.id).eq('user_id', userId!);
          }
        } else {
          // Client-side OCR for images and PDFs
          await runClientOCR(file, row!.id);
        }
      } catch (e: any) {
        console.error(e);
        toast({ title: 'Upload failed', description: e.message || 'Could not upload file', variant: 'destructive' as any });
      }
    }
  };

  const runClientOCR = async (file: File, docId: string) => {
    try {
      let text = '';
      if (file.type.startsWith('image/')) {
        const { createWorker } = (await import('tesseract.js')) as any;
        const worker: any = await createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        const dataUrl = await fileToDataURL(file);
        const { data } = await worker.recognize(dataUrl as string);
        text = data.text || '';
        await worker.terminate();
      } else if (file.type === 'application/pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        // @ts-ignore - worker is auto set by modern bundlers
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const pdfjs = pdfjsLib as any;
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        // Some builds require setting workerSrc; pdfjs-dist@4 auto-bundles worker.
        const doc = await (pdfjs.getDocument({ data: uint8 }).promise);
        const pageTexts: string[] = [];
        const maxPages = Math.min(doc.numPages, 10); // cap for performance
        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items?.map((it: any) => it.str).filter(Boolean) || [];
          pageTexts.push(strings.join(' '));
        }
        text = pageTexts.join('\n\n');
      }

      const newStatus = text ? 'processed' : 'processed';
      const { error: updErr } = await supabase
        .from('digital_documents')
        .update({ ocr_text: text || null, status: newStatus })
        .eq('id', docId)
        .eq('user_id', userId!);
      if (updErr) throw updErr;
    } catch (e: any) {
      console.error('OCR failed', e);
      await supabase.from('digital_documents').update({ status: 'error' }).eq('id', docId).eq('user_id', userId!);
    }
  };

  const fileToDataURL = (file: File) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result!); r.readAsDataURL(file); });

  const handleDelete = async (doc: DocRow) => {
    if (!userId) return;
    if (!window.confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    setDeleting((prev) => new Set(prev).add(doc.id));
    try {
      const { error: remErr } = await supabase.storage.from('drive').remove([doc.file_path]);
      if (remErr) throw remErr;
      const { error: delErr } = await supabase.from('digital_documents').delete().eq('id', doc.id).eq('user_id', userId);
      if (delErr) throw delErr;
      toast({ title: 'Deleted', description: doc.file_name });
      setDocs((prev) => prev.filter((x) => x.id !== doc.id));
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message || 'Could not delete', variant: 'destructive' as any });
    } finally {
      setDeleting((prev) => { const n = new Set(prev); n.delete(doc.id); return n; });
    }
  };

  const ocrDocument = async (doc: DocRow) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.storage.from('drive').createSignedUrl(doc.file_path, 60 * 5);
      if (error || !data?.signedUrl) throw error || new Error('No URL');
      const resp = await fetch(data.signedUrl);
      const blob = await resp.blob();
      const file = new File([blob], doc.file_name, { type: blob.type || 'application/octet-stream' });
      await runClientOCR(file, doc.id);
      toast({ title: 'OCR complete', description: doc.file_name });
    } catch (e: any) {
      toast({ title: 'OCR failed', description: e.message || 'Could not OCR file', variant: 'destructive' as any });
    }
  };

  const translateDocument = async (doc: DocRow) => {
    if (!userId) return;
    setTranslateDoc(doc);
    setTranslateOpen(true);
    setTranslateLoading(true);
    try {
      let text = doc.ocr_text || '';
      if (!text && isDocxName(doc.file_name)) {
        const { data, error } = await supabase.storage.from('drive').createSignedUrl(doc.file_path, 60 * 5);
        if (error || !data?.signedUrl) throw error || new Error('Could not open file');
        const resp = await fetch(data.signedUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const mammoth: any = await import('mammoth');
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        text = value || '';
      }
      if (!text) throw new Error('No text available to translate.');
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('translate-document', { body: { text, fileName: doc.file_name, targetLang: 'en' } });
      if (fnErr) throw fnErr;
      setTranslateText(fnData?.translatedText || fnData?.result || '');
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Translate failed', description: e.message || 'Could not translate', variant: 'destructive' as any });
    } finally {
      setTranslateLoading(false);
    }
  };

  const handlePromoteConfirm = async () => {
    if (!userId || !promoteDoc || !promotePatientId) { toast({ title: 'Select a patient', description: 'Please choose a patient to promote this file to.' }); return; }
    try {
      const newPath = `${basePrefix(userId, promotePatientId)}/${promoteDoc.file_name}`;
      const { error: moveErr } = await supabase.storage.from('drive').move(promoteDoc.file_path, newPath);
      if (moveErr) throw moveErr;
      const { error: updErr } = await supabase
        .from('digital_documents')
        .update({ patient_id: promotePatientId, file_path: newPath })
        .eq('id', promoteDoc.id)
        .eq('user_id', userId);
      if (updErr) throw updErr;
      toast({ title: 'Promoted', description: `${promoteDoc.file_name} moved to patient files.` });
      setPromoteOpen(false);
      setPromoteDoc(null);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Promote failed', description: e.message || 'Could not move file', variant: 'destructive' as any });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d => d.file_name.toLowerCase().includes(q) || (d.ocr_text || '').toLowerCase().includes(q));
  }, [docs, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: any;
      let vb: any;
      switch (sortCol) {
        case 'status': va = a.status; vb = b.status; break;
        case 'added': va = new Date(a.created_at).getTime(); vb = new Date(b.created_at).getTime(); break;
        case 'name':
        default: va = a.file_name.toLowerCase(); vb = b.file_name.toLowerCase();
      }
      const cmp = typeof va === 'number' ? (va - vb) : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[100rem] px-4 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Digitalize documentation</h1>
          <p className="mt-2 text-muted-foreground">Upload PDFs and images, OCR them to make searchable, organized by patient.</p>
        </header>

        <section className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="patient">Patient</Label>
            <Select value={patientSelectValue} onValueChange={(v) => setSelectedPatientId(v === "__general__" ? null : v)}>
              <SelectTrigger id="patient" className="min-w-[220px]"><SelectValue placeholder="Select a patient" /></SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="__general__">General</SelectItem>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Input placeholder="Search by name or text" value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="inline-flex items-center gap-2">
              <Input type="file" accept="application/pdf,image/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={(e) => handleUpload(e.target.files)} />
            </label>
          </div>
        </section>

        <section className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><button className="inline-flex items-center gap-1" onClick={() => onSort('name')}><span>Name</span>{sortCol==='name' ? (sortDir==='asc'?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>):<ChevronUp className="h-3.5 w-3.5 opacity-30"/>}</button></TableHead>
                <TableHead><button className="inline-flex items-center gap-1" onClick={() => onSort('status')}><span>Status</span>{sortCol==='status' ? (sortDir==='asc'?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>):<ChevronUp className="h-3.5 w-3.5 opacity-30"/>}</button></TableHead>
                <TableHead>Preview</TableHead>
                <TableHead className="text-right"><button className="inline-flex items-center gap-1" onClick={() => onSort('added')}><span>Added</span>{sortCol==='added' ? (sortDir==='asc'?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>):<ChevronUp className="h-3.5 w-3.5 opacity-30"/>}</button></TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">No documents yet.</TableCell></TableRow>
              ) : (
                filtered.map((d) => (
                  <TableRow key={d.id} className="align-top">
                    <TableCell className="text-foreground">
                      <div className="font-medium">{d.file_name}</div>
                      {d.ocr_text ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.ocr_text.slice(0, 280)}</p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">No OCR text yet</p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.status}</TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={async () => {
                        const { data, error } = await supabase.storage.from('drive').createSignedUrl(d.file_path, 60 * 5);
                        if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                      }}>Open</Button>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{new Date(d.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${d.file_name}`} disabled={deleting.has(d.id)}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-50">
                          <DropdownMenuLabel>Document actions</DropdownMenuLabel>
                          {isDocxName(d.file_name) ? (
                            <DropdownMenuItem onClick={() => translateDocument(d)}>Translate to English</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => ocrDocument(d)}>OCR the file to make it searchable</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { setPromoteDoc(d); setPromotePatientId(selectedPatientId); setPromoteOpen(true); }}>Promote to patient files</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(d)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        {/* Translate dialog */}
        <Dialog open={translateOpen} onOpenChange={(o) => { setTranslateOpen(o); if (!o) { setTranslateText(''); setTranslateDoc(null); } }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Translation: {translateDoc?.file_name}</DialogTitle>
              <DialogDescription>Translated to English</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto prose prose-sm dark:prose-invert">
              {translateLoading ? (
                <p className="text-muted-foreground">Translating…</p>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{translateText || 'No content'}</ReactMarkdown>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setTranslateOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Promote dialog */}
        <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Promote to patient files</DialogTitle>
              <DialogDescription>Select a patient to move this file to their Files.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label htmlFor="promotePatient">Patient</Label>
              <Select value={promotePatientId ?? ''} onValueChange={(v) => setPromotePatientId(v || null)}>
                <SelectTrigger id="promotePatient"><SelectValue placeholder="Select a patient" /></SelectTrigger>
                <SelectContent className="z-50">
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPromoteOpen(false)}>Cancel</Button>
              <Button onClick={handlePromoteConfirm}>Promote</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default DigitalizeDocumentation;
