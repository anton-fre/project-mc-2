import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePatient } from "@/context/PatientContext";

interface QuestionCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  defaultTitle?: string;
  onCreated?: (questionId: string) => Promise<void> | void;
}

const QuestionCreateDialog = ({ open, onOpenChange, userId, defaultTitle = "", onCreated }: QuestionCreateDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { selectedPatientId } = usePatient();

  useEffect(() => {
    if (open) setTitle(defaultTitle || "");
  }, [open, defaultTitle]);

  const handleCreate = async () => {
    if (!userId) return;
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please add a title" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("questions")
        .insert({ user_id: userId, title, description: description || null, status: "open", patient_id: selectedPatientId })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      const qid = (data as any)?.id as string | undefined;
      if (qid && onCreated) await onCreated(qid);
      toast({ title: "Created", description: "Question added" });
      onOpenChange(false);
      setTitle("");
      setDescription("");
    } catch (e: any) {
      toast({ title: "Create failed", description: e.message || "Could not create question" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New question</DialogTitle>
          <DialogDescription>Add a question to track and resolve.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="q-title">Title</Label>
            <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do we need to decide?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="q-desc">Description</Label>
            <Textarea id="q-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleCreate} disabled={submitting}>{submitting ? "Creating…" : "Create"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuestionCreateDialog;
