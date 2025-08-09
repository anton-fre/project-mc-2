-- Create patients table (idempotent)
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS (safe to re-run)
alter table public.patients enable row level security;

-- Policies (create only if missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients' AND policyname = 'Users can view their own patients'
  ) THEN
    CREATE POLICY "Users can view their own patients"
    ON public.patients
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients' AND policyname = 'Users can insert their own patients'
  ) THEN
    CREATE POLICY "Users can insert their own patients"
    ON public.patients
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients' AND policyname = 'Users can update their own patients'
  ) THEN
    CREATE POLICY "Users can update their own patients"
    ON public.patients
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients' AND policyname = 'Users can delete their own patients'
  ) THEN
    CREATE POLICY "Users can delete their own patients"
    ON public.patients
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger to keep updated_at fresh (create only if missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_patients_updated_at'
  ) THEN
    CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON public.patients
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Add patient_id column to folders if it does not exist
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS patient_id uuid;
