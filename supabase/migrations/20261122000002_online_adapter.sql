-- =====================================================================
-- QC App · migration 0002 — what the online form adapter needs
--
--  * personal folders (the form's library folders), owner-only
--  * inspections.folder_id / extra so the form document round-trips
--  * photo storage keyed by uploader: {uid}/{file}
--      - the form uploads a photo before it knows which item it belongs to,
--        so uploads go to the uploader's own folder
--      - anyone who can see an item that references a photo can view it
--  * my_projects(): projects I belong to, with my role
-- =====================================================================

-- 1. personal folders -------------------------------------------------
create table public.folders (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index folders_owner_idx on public.folders(owner_id);
alter table public.folders enable row level security;
create policy folders_owner on public.folders for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.folders to authenticated;
revoke all on public.folders from anon;

-- 2. round-trip fields on inspections ----------------------------------
alter table public.inspections add column folder_id text;          -- owner's own folder, meaningless to others
alter table public.inspections add column extra jsonb not null default '{}'::jsonb;  -- form fields with no column (rx, by, v)

-- 3. photos: uploader-keyed paths -----------------------------------
create index inspection_items_before_gin on public.inspection_items using gin (before);
create index inspection_items_after_gin  on public.inspection_items using gin (after);

create function public.photo_visible(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inspection_items i
                 where (i.before @> array[path] or i.after @> array[path])
                   and public.can_see_project(i.project_id));
$$;
grant execute on function public.photo_visible(text) to authenticated;

drop policy if exists photos_select on storage.objects;
drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;

create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.photo_visible(name)));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4. projects I belong to ----------------------------------------------
create function public.my_projects()
returns table (id text, name text, site text, categories text[], role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.site, p.categories, m.role
  from project_members m join projects p on p.id = m.project_id
  where m.user_id = auth.uid() and p.archived_at is null
  order by p.name;
$$;
grant execute on function public.my_projects() to authenticated;
