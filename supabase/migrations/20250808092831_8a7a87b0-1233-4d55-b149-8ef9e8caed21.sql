-- Create table to store OpenAI Vector Store IDs per user
CREATE TABLE IF NOT EXISTS public.openai_vector_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  store_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.openai_vector_stores ENABLE ROW LEVEL SECURITY;

-- Create policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'openai_vector_stores' AND policyname = 'Users can view their own vector store' 
  ) THEN
    CREATE POLICY "Users can view their own vector store"
    ON public.openai_vector_stores
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'openai_vector_stores' AND policyname = 'Users can insert their own vector store' 
  ) THEN
    CREATE POLICY "Users can insert their own vector store"
    ON public.openai_vector_stores
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'openai_vector_stores' AND policyname = 'Users can update their own vector store' 
  ) THEN
    CREATE POLICY "Users can update their own vector store"
    ON public.openai_vector_stores
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'openai_vector_stores' AND policyname = 'Users can delete their own vector store' 
  ) THEN
    CREATE POLICY "Users can delete their own vector store"
    ON public.openai_vector_stores
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Helper function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on updates
DROP TRIGGER IF EXISTS trg_openai_vector_stores_updated_at ON public.openai_vector_stores;
CREATE TRIGGER trg_openai_vector_stores_updated_at
BEFORE UPDATE ON public.openai_vector_stores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index by user for fast lookups
CREATE INDEX IF NOT EXISTS idx_openai_vector_stores_user ON public.openai_vector_stores(user_id);