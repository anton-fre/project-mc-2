-- Create patients table
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.patients enable row level security;

-- Policies: owner-only access
create policy if not exists "Users can view their own patients"
  on public.patients
  for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their own patients"
  on public.patients
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update their own patients"
  on public.patients
  for update
  using (auth.uid() = user_id);

create policy if not exists "Users can delete their own patients"
  on public.patients
  for delete
  using (auth.uid() = user_id);

-- Trigger to maintain updated_at
create trigger if not exists update_patients_updated_at
before update on public.patients
for each row execute function public.update_updated_at_column();

-- Add patient_id to folders to scope folders by patient (nullable for "General")
alter table public.folders
  add column if not exists patient_id uuid references public.patients(id) on delete set null;

-- Helpful indexes
create index if not exists idx_patients_user_id on public.patients(user_id);
create index if not exists idx_folders_patient_id on public.folders(patient_id);
