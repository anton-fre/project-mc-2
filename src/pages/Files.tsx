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
import { Folder as FolderIcon, File as FileIcon, MoreVertical } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

const Files = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [currentPath, setCurrentPath] = useState<string>(""); // e.g. "Projects/2025"
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileObject[]>([]);

const [refreshKey, setRefreshKey] = useState(0);
const [searchQuery, setSearchQuery] = useState("");
const [matchContent, setMatchContent] = useState(false);
const [searching, setSearching] = useState(false);
const [contentMatches, setContentMatches] = useState<Set<string>>(new Set());

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

  // Resolve current folder by currentPath for this user
  useEffect(() => {
    if (!userId) return;
    const resolveAndLoad = async () => {
      setLoading(true);
      try {
        let resolved: Folder | null = null;
        if (currentPath) {
          const { data, error } = await supabase
            .from("folders")
            .select("id,name,parent_id,full_path")
            .eq("full_path", currentPath)
            .maybeSingle();
          if (error) throw error;
          resolved = data as Folder | null;
        }
        setCurrentFolder(resolved);

        // Load child folders under currentFolder (or root if null)
        const folderQuery = supabase
          .from("folders")
          .select("id,name,parent_id,full_path")
          .order("name", { ascending: true })
          .eq("user_id", userId);
        const { data: folderRows, error: folderErr } = currentPath
          ? await folderQuery.eq("parent_id", resolved?.id ?? "__none__") // will return empty if not resolved
          : await folderQuery.is("parent_id", null);
        if (folderErr) throw folderErr;
        setFolders((folderRows as Folder[]) || []);

        // Load files directly under this path from Storage
        const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
        const { data: fileRows, error: fileErr } = await supabase.storage
          .from("drive")
          .list(base, { limit: 1000, sortBy: { column: "name", order: "asc" } });
        if (fileErr) throw fileErr;
        setFiles((fileRows as FileObject[]) || []);
      } catch (e: any) {
        console.error(e);
        toast({ title: "Error", description: e.message || "Failed to load items" });
      } finally {
        setLoading(false);
      }
    };
    resolveAndLoad();
  }, [userId, currentPath, refreshKey]);

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
      });
      if (error) throw error;
      toast({ title: "Folder created", description: `${name} added` });
      await supabase.storage
        .from("drive")
        .upload(`${userId}/${full_path}/.keep`, new Blob([""]), { upsert: true });
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
      const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
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
      const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
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
      const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
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
      const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
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

  const isTextLike = (ct: string | null, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext && ["txt","md","json","csv","ts","tsx","js","jsx","css","html","xml","yml","yaml"].includes(ext)) return true;
    if (!ct) return false;
    return ct.startsWith("text/") || ct.includes("json") || ct.includes("xml");
  };

  const handleSearchContents = async () => {
    if (!userId || !searchQuery || !matchContent) return;
    setSearching(true);
    try {
      const q = searchQuery.toLowerCase();
      const matches = new Set<string>();
      const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
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
    if (!window.confirm(`Permanently delete "${name}"?`)) return;
    const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
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
    if (!window.confirm(`Permanently delete folder "${delFullPath}" and all its contents?`)) return;

    try {
      // Get all descendant folder paths from DB
      const { data: descendantRows, error: selErr } = await supabase
        .from("folders")
        .select("full_path")
        .eq("user_id", userId)
        .or(`full_path.eq.${delFullPath},full_path.like.${delFullPath}/%`);
      if (selErr) throw selErr;
      const folderPaths = [delFullPath, ...(descendantRows?.map((r: any) => r.full_path) || [])].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      // Gather all file paths under those folders
      const toRemove: string[] = [];
      for (const fp of folderPaths) {
        const base = `${userId}/${fp}`;
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
        .or(`full_path.eq.${delFullPath},full_path.like.${delFullPath}/%`);
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
      const base = `${userId}${currentPath ? "/" + currentPath : ""}`;
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
        .or(`full_path.eq.${delFullPath},full_path.like.${delFullPath}/%`);
      if (selErr) throw selErr;
      const folderPaths = [delFullPath, ...(descendantRows?.map((r: any) => r.full_path) || [])].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      const links: string[] = [];
      for (const fp of folderPaths) {
        const base = `${userId}/${fp}`;
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

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-4 py-6">
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

        <section className="mb-6 flex flex-wrap items-center gap-3">
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

        <section aria-label="Items" className="mb-20">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
            <p className="text-muted-foreground">{searchQuery ? "No items match your search" : "This folder is empty"}</p>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/2">Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Modified</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFolders.map((f) => (
                    <TableRow key={f.id} className="hover:bg-accent">
                      <TableCell className="flex items-center gap-2 cursor-pointer" onClick={() => onOpenFolder(f.name)}>
                        <FolderIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{f.name}</span>
                      </TableCell>
                      <TableCell>Folder</TableCell>
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
                            <DropdownMenuItem onClick={() => onShareEmailFolder(f.name)}>Share via email</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => deleteFolderRecursive(f.name)} className="text-destructive">
                              Delete permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredFiles.map((file) => (
                    <TableRow key={file.name}>
                      <TableCell className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{file.name}</span>
                      </TableCell>
                      <TableCell>File</TableCell>
                      <TableCell className="text-muted-foreground">
                        {file.updated_at ? new Date(file.updated_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {file.metadata?.size ? `${(file.metadata.size / 1024).toFixed(1)} KB` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
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
                            <DropdownMenuItem onClick={() => onShareEmailFile(file.name)}>Share via email</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => deleteFile(file.name)} className="text-destructive">
                              Delete permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Files;
