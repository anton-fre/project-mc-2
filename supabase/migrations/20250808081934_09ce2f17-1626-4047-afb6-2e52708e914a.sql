-- Create a private bucket for user files
insert into storage.buckets (id, name, public)
values ('drive', 'drive', false)
on conflict (id) do nothing;

-- RLS policies for the drive bucket so users only access their own files under their UID prefix
create policy if not exists "Users can view their own files in drive"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'drive'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy if not exists "Users can upload files to their own folder in drive"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'drive'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy if not exists "Users can update their own files in drive"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'drive'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy if not exists "Users can delete their own files in drive"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'drive'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Folders table to model folder hierarchy per user
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  full_path text not null,
  created_at timestamptz not null default now()
);

alter table public.folders enable row level security;

create unique index if not exists idx_folders_user_full_path on public.folders(user_id, full_path);
create index if not exists idx_folders_user_parent on public.folders(user_id, parent_id);

create policy if not exists "Users can view their own folders"
on public.folders
for select
to authenticated
using (auth.uid() = user_id);

create policy if not exists "Users can create their own folders"
on public.folders
for insert
to authenticated
with check (auth.uid() = user_id);

create policy if not exists "Users can update their own folders"
on public.folders
for update
to authenticated
using (auth.uid() = user_id);

create policy if not exists "Users can delete their own folders"
on public.folders
for delete
to authenticated
using (auth.uid() = user_id);