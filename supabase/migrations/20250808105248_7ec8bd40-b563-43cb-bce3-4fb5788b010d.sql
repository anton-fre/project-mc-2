-- Create shares table for in-app user-to-user sharing
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  target_email text not null,
  path text not null,
  file_name text not null,
  patient_id uuid null,
  created_at timestamptz not null default now()
);

alter table public.shares enable row level security;

-- Index for recipient lookups
create index if not exists idx_shares_target_email on public.shares (lower(target_email));
create index if not exists idx_shares_owner on public.shares (owner_user_id);
create index if not exists idx_shares_path on public.shares (path);

-- Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shares' AND policyname = 'Owners can view their shares'
  ) THEN
    CREATE POLICY "Owners can view their shares"
    ON public.shares
    FOR SELECT
    USING (owner_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shares' AND policyname = 'Owners can insert shares'
  ) THEN
    CREATE POLICY "Owners can insert shares"
    ON public.shares
    FOR INSERT
    WITH CHECK (owner_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shares' AND policyname = 'Owners can update their shares'
  ) THEN
    CREATE POLICY "Owners can update their shares"
    ON public.shares
    FOR UPDATE
    USING (owner_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shares' AND policyname = 'Owners can delete their shares'
  ) THEN
    CREATE POLICY "Owners can delete their shares"
    ON public.shares
    FOR DELETE
    USING (owner_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shares' AND policyname = 'Recipients can view shares by email'
  ) THEN
    CREATE POLICY "Recipients can view shares by email"
    ON public.shares
    FOR SELECT
    USING (lower((auth.jwt() ->> 'email')) = lower(target_email));
  END IF;
END $$;