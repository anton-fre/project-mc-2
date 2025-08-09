-- Create table for digitalized documents
CREATE TABLE IF NOT EXISTS public.digital_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  patient_id UUID NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  ocr_text TEXT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.digital_documents ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own digital documents'
  ) THEN
    CREATE POLICY "Users can view their own digital documents"
    ON public.digital_documents FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own digital documents'
  ) THEN
    CREATE POLICY "Users can insert their own digital documents"
    ON public.digital_documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own digital documents'
  ) THEN
    CREATE POLICY "Users can update their own digital documents"
    ON public.digital_documents FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own digital documents'
  ) THEN
    CREATE POLICY "Users can delete their own digital documents"
    ON public.digital_documents FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_digital_documents_updated_at ON public.digital_documents;
CREATE TRIGGER trg_digital_documents_updated_at
BEFORE UPDATE ON public.digital_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_digital_documents_user_patient ON public.digital_documents (user_id, patient_id);
-- Full text search index (simple)
CREATE INDEX IF NOT EXISTS idx_digital_documents_ocr_tsv ON public.digital_documents USING GIN (to_tsvector('english', coalesce(ocr_text, '')));
