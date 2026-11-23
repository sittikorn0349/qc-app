-- 005 · form-engine documents, team form templates, project zones
-- Closes the gap from the review: documents made with pwa-forms.js (daily report, pour permit, material
-- receipt, safety, custom forms) were only on the device in online mode. After this migration they sync
-- per project like inspections, team templates are shared inside the project, and the PM's standard
-- zone list travels with the project.
-- Safe to run once in the Supabase SQL editor. The app detects the tables; until they exist it says
-- "ในเครื่องนี้เท่านั้น ยังไม่ซิงก์" instead of pretending.

-- 1. documents --------------------------------------------------------------
create table if not exists public.form_docs (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users(id),
  form_id     text not null default '',
  title       text not null default '',
  data        jsonb not null,                     -- the whole document; photos are data URLs inside (already resized by the app)
  updated_at  timestamptz not null default now(), -- the client's updatedAt, used for newest-wins
  deleted_at  timestamptz,
  constraint form_docs_size check (pg_column_size(data) < 12000000)
);
create index if not exists form_docs_project_idx on public.form_docs (project_id, updated_at desc);
alter table public.form_docs enable row level security;

drop policy if exists form_docs_select on public.form_docs;
create policy form_docs_select on public.form_docs for select to authenticated
  using (public.can_see_project(project_id));
drop policy if exists form_docs_insert on public.form_docs;
create policy form_docs_insert on public.form_docs for insert to authenticated
  with check (owner_id = auth.uid() and public.is_member(project_id));
drop policy if exists form_docs_update on public.form_docs;
create policy form_docs_update on public.form_docs for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_member(project_id));
-- no delete policy: documents are soft-deleted (deleted_at), like inspections

-- 2. team templates (custom forms) --------------------------------------------
create table if not exists public.form_templates (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users(id),
  name        text not null default '',
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint form_templates_size check (pg_column_size(data) < 500000)
);
create index if not exists form_templates_project_idx on public.form_templates (project_id);
alter table public.form_templates enable row level security;

drop policy if exists form_templates_select on public.form_templates;
create policy form_templates_select on public.form_templates for select to authenticated
  using (public.can_see_project(project_id));
drop policy if exists form_templates_insert on public.form_templates;
create policy form_templates_insert on public.form_templates for insert to authenticated
  with check (owner_id = auth.uid() and public.is_member(project_id));
drop policy if exists form_templates_update on public.form_templates;
create policy form_templates_update on public.form_templates for update to authenticated
  using (owner_id = auth.uid() or public.can_manage_project(project_id))
  with check (public.is_member(project_id));

grant select, insert, update on public.form_docs, public.form_templates to authenticated;

-- 3. standard zones per project (set by the PM, used by everyone's location field) ----
alter table public.projects add column if not exists zones text[] not null default '{}';

create or replace function public.set_project_zones(p text, z text[]) returns text[]
language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_manage_project(p) or coalesce(public.project_role(p) = 'foreman', false)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update projects set zones = coalesce((select array_agg(distinct btrim(x)) from unnest(z) x where btrim(x) <> ''), '{}')
   where id = p;
  return (select zones from projects where id = p);
end $$;
grant execute on function public.set_project_zones(text, text[]) to authenticated;

-- my_projects() now also returns zones (same columns + zones at the end; older clients ignore it)
drop function if exists public.my_projects();
create function public.my_projects()
returns table (id text, name text, site text, categories text[], role text, zones text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.site, p.categories, m.role, p.zones
  from project_members m join projects p on p.id = m.project_id
  where m.user_id = auth.uid() and p.archived_at is null
  order by p.name;
$$;
grant execute on function public.my_projects() to authenticated;

-- 4. live updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.form_docs; exception when duplicate_object then null; end;
  end if;
end $$;
