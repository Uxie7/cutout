-- Run in the Supabase SQL editor or with the Supabase CLI.
create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null default 'image/png' check (mime_type = 'image/png'),
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  created_at timestamptz not null default now(),
  constraint images_path_belongs_to_user check (
    storage_path like (user_id::text || '/%')
  )
);

create index if not exists images_user_created_idx
  on public.images (user_id, created_at desc);

alter table public.images enable row level security;

drop policy if exists "Users can read their own images" on public.images;
create policy "Users can read their own images"
  on public.images for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own images" on public.images;
create policy "Users can add their own images"
  on public.images for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own images" on public.images;
create policy "Users can delete their own images"
  on public.images for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cutout-images', 'cutout-images', false, 20971520, array['image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own image files" on storage.objects;
create policy "Users can read their own image files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'cutout-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own image files" on storage.objects;
create policy "Users can upload their own image files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cutout-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own image files" on storage.objects;
create policy "Users can delete their own image files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cutout-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
