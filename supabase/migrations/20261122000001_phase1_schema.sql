-- =====================================================================
-- QC App · Phase 1 schema (Foreman <-> Headman fix loop)
--
-- Roles
--   org level  : profiles.org_role   ceo | admin | staff
--                ceo/admin read every project; admin manages projects
--   project    : project_members.role pm | foreman | headman | viewer
--                pm/foreman  : create & edit inspections and items
--                headman     : sees ONLY items assigned to them, can only
--                              report "fixed" (+ after photos) via RPC
--                viewer      : read only (owner / consultant)
--
-- Item workflow (inspection_items.status)
--   res = fix|bad  ->  open -> assigned -> fixed -> approved
--                                  ^          |
--                                  +- rejected <-+
--   Legacy form fields stay authoritative-compatible:
--   rres='ok' <-> approved, rres='bad' <-> rejected.
--
-- Run once in Supabase SQL Editor. Idempotency is not attempted:
-- this is the first migration on an empty project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '',
  email         text,
  org_role      text not null default 'staff' check (org_role in ('ceo','admin','staff')),
  line_user_id  text,
  created_at    timestamptz not null default now()
);

create table public.projects (
  id          text primary key default ('prj_' || replace(gen_random_uuid()::text, '-', '')),
  name        text not null,
  site        text not null default '',
  categories  text[] not null default array[
                'เหล็กเสริม','แบบหล่อ / นั่งร้าน','คอนกรีต','งานก่ออิฐ / ฉาบ',
                'งานไฟฟ้า','งานสุขาภิบาล','งานสถาปัตย์ / อื่นๆ'],
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table public.project_members (
  project_id  text not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('pm','foreman','headman','viewer')),
  added_by    uuid references auth.users(id) default auth.uid(),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members(user_id);

-- One inspection document. Columns mirror QC.explode() in index.html;
-- meta/sign are kept whole as jsonb so the form round-trips unchanged.
create table public.inspections (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete restrict,
  docno       text not null default '',
  insp_date   date,
  site        text not null default '',
  work        text not null default '',
  weather     text not null default '',
  meta        jsonb not null default '{}'::jsonb,
  sign        jsonb not null default '{}'::jsonb,
  summary     text not null default '',
  remarks     text not null default '',
  rev         integer not null default 0,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) default auth.uid(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index inspections_project_idx on public.inspections(project_id, updated_at desc);

create table public.inspection_items (
  id             text primary key,
  inspection_id  text not null references public.inspections(id) on delete cascade,
  project_id     text not null references public.projects(id),   -- copied from inspection by trigger
  ord            integer not null default 0,
  loc            text not null default '',
  chk            text not null default '',
  res            text not null default '' check (res in ('','ok','fix','bad')),
  note           text not null default '',
  cat            text not null default '',
  ref            text not null default '',
  before         text[] not null default '{}',   -- storage object paths
  after          text[] not null default '{}',
  rres           text not null default '' check (rres in ('','ok','bad')),
  rdate          text not null default '',
  rnote          text not null default '',
  status         text check (status in ('open','assigned','fixed','approved','rejected')),
  assignee_id    uuid references auth.users(id),
  due_date       date,
  fixed_at       timestamptz,
  fixed_note     text not null default '',
  updated_by     uuid references auth.users(id) default auth.uid(),
  updated_at     timestamptz not null default now()
);
create index inspection_items_insp_idx on public.inspection_items(inspection_id, ord);
create index inspection_items_project_idx on public.inspection_items(project_id, status);
create index inspection_items_assignee_idx on public.inspection_items(assignee_id)
  where status in ('assigned','rejected','fixed');

-- Audit trail: who changed status / assignee / due date, and when.
create table public.item_events (
  id           bigint generated always as identity primary key,
  item_id      text not null references public.inspection_items(id) on delete cascade,
  project_id   text not null references public.projects(id) on delete cascade,
  actor        uuid references auth.users(id) default auth.uid(),
  kind         text not null check (kind in ('created','status','assign','due')),
  from_value   text,
  to_value     text,
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index item_events_item_idx on public.item_events(item_id, created_at);

-- ---------------------------------------------------------------------
-- 2. Permission helpers (security definer: they read membership tables
--    without recursing through those tables' own RLS policies)
-- ---------------------------------------------------------------------
create function public.is_org_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and org_role in ('ceo','admin'));
$$;

create function public.is_org_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and org_role = 'admin');
$$;

create function public.project_role(p text) returns text
language sql stable security definer set search_path = public as $$
  select role from project_members where project_id = p and user_id = auth.uid();
$$;

-- can see the project row and its member list (any member, incl. headman)
create function public.can_see_project(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_reader() or public.project_role(p) is not null;
$$;

-- can read full inspections (everyone except headman)
create function public.can_read_inspections(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_reader() or coalesce(public.project_role(p) in ('pm','foreman','viewer'), false);
$$;

create function public.can_edit_project(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.project_role(p) in ('pm','foreman'), false);
$$;

create function public.can_manage_project(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_admin() or coalesce(public.project_role(p) = 'pm', false);
$$;

create function public.is_assigned_in_inspection(insp text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inspection_items
                 where inspection_id = insp and assignee_id = auth.uid()
                   and status in ('assigned','rejected','fixed'));
$$;

create function public.shares_project_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members a join project_members b using (project_id)
                 where a.user_id = auth.uid() and b.user_id = other);
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------
-- 3a. profile row for every new auth user
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name',
                   new.raw_user_meta_data->>'name',
                   split_part(coalesce(new.email, ''), '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3b. org_role can only be changed by an admin (or from the SQL editor)
create function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_role is distinct from old.org_role
     and auth.uid() is not null and not public.is_org_admin() then
    raise exception 'only an admin can change org_role';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- 3c. inspections: bump rev / updated_at / updated_by
create function public.touch_inspection() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'UPDATE' then
    new.rev := old.rev + 1;
    if new.project_id is distinct from old.project_id then
      raise exception 'an inspection cannot move to another project';
    end if;
  end if;
  return new;
end $$;
create trigger inspections_touch before insert or update on public.inspections
  for each row execute function public.touch_inspection();

-- 3d. items: copy project_id, derive status, enforce who may move it
create function public.item_workflow() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  role text;
  old_status text := case when tg_op = 'UPDATE' then old.status end;
begin
  select project_id into new.project_id from inspections where id = new.inspection_id;
  if new.project_id is null then
    raise exception 'inspection % not found', new.inspection_id;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(uid, new.updated_by);

  -- legacy recheck fields drive status when the status itself was not touched
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.rres is distinct from old.rres then
    new.status := case new.rres when 'ok' then 'approved'
                                when 'bad' then 'rejected'
                                else case when new.assignee_id is null then 'open' else 'assigned' end end;
  end if;

  -- only fix/bad items take part in the workflow
  if new.res not in ('fix','bad') then
    new.status := null;
  elsif new.status is null then
    new.status := case when new.rres = 'ok' then 'approved'
                       when new.rres = 'bad' then 'rejected'
                       when new.assignee_id is not null then 'assigned'
                       else 'open' end;
  elsif new.status = 'open' and new.assignee_id is not null then
    new.status := 'assigned';
  elsif new.status = 'assigned' and new.assignee_id is null then
    new.status := 'open';
  end if;

  -- keep legacy fields in step with status
  if new.status = 'approved' then
    new.rres := 'ok';
    if new.rdate = '' then new.rdate := to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD'); end if;
  elsif new.status = 'rejected' then
    new.rres := 'bad';
  elsif new.status in ('open','assigned','fixed') then
    new.rres := '';
  end if;
  if new.status = 'fixed' and old_status is distinct from 'fixed' then
    new.fixed_at := now();
  end if;

  -- who may make the transition (uid null = SQL editor / service role)
  if uid is not null and new.status is distinct from old_status then
    role := public.project_role(new.project_id);
    if new.status in ('approved','rejected') and coalesce(role in ('pm','foreman'), false) is false then
      raise exception 'only pm/foreman may approve or reject';
    end if;
    if new.status = 'fixed' and coalesce(role in ('pm','foreman'), false) is false
       and new.assignee_id is distinct from uid then
      raise exception 'only the assignee (or pm/foreman) may report fixed';
    end if;
  end if;
  return new;
end $$;
create trigger inspection_items_workflow before insert or update on public.inspection_items
  for each row execute function public.item_workflow();

-- 3e. audit trail
create function public.log_item_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status is not null then
      insert into item_events(item_id, project_id, kind, to_value) values (new.id, new.project_id, 'created', new.status);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into item_events(item_id, project_id, kind, from_value, to_value, note)
    values (new.id, new.project_id, 'status', old.status, new.status,
            case new.status when 'fixed' then new.fixed_note
                            when 'rejected' then new.rnote
                            when 'approved' then new.rnote else '' end);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into item_events(item_id, project_id, kind, from_value, to_value)
    values (new.id, new.project_id, 'assign', old.assignee_id::text, new.assignee_id::text);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into item_events(item_id, project_id, kind, from_value, to_value)
    values (new.id, new.project_id, 'due', old.due_date::text, new.due_date::text);
  end if;
  return new;
end $$;
create trigger inspection_items_events after insert or update on public.inspection_items
  for each row execute function public.log_item_events();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.inspections       enable row level security;
alter table public.inspection_items  enable row level security;
alter table public.item_events       enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_org_reader() or public.shares_project_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_org_admin())
  with check (id = auth.uid() or public.is_org_admin());

-- projects
create policy projects_select on public.projects for select to authenticated
  using (public.can_see_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_org_admin());
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id)) with check (public.can_manage_project(id));

-- project_members
create policy members_select on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.can_see_project(project_id));
create policy members_insert on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy members_update on public.project_members for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy members_delete on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id));

-- inspections
create policy inspections_select on public.inspections for select to authenticated
  using (public.can_read_inspections(project_id));
create policy inspections_insert on public.inspections for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy inspections_update on public.inspections for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy inspections_delete on public.inspections for delete to authenticated
  using (public.project_role(project_id) = 'pm');

-- inspection_items: headman reads only their own items and never writes
-- directly (they use report_fixed()).
create policy items_select on public.inspection_items for select to authenticated
  using (public.can_read_inspections(project_id) or assignee_id = auth.uid());
create policy items_insert on public.inspection_items for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy items_update on public.inspection_items for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy items_delete on public.inspection_items for delete to authenticated
  using (public.can_edit_project(project_id));

-- item_events: read-only for readers; rows are written by triggers
create policy events_select on public.item_events for select to authenticated
  using (public.can_read_inspections(project_id)
         or exists (select 1 from public.inspection_items i
                    where i.id = item_id and i.assignee_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 5. RPCs for the headman screen and for review
-- ---------------------------------------------------------------------
create function public.my_tasks()
returns table (
  item_id text, project_id text, project_name text, inspection_id text, docno text,
  work text, loc text, chk text, note text, cat text, ref text, res text,
  before text[], after text[], status text, due_date date, rnote text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.project_id, p.name, i.inspection_id, n.docno,
         n.work, i.loc, i.chk, i.note, i.cat, i.ref, i.res,
         i.before, i.after, i.status, i.due_date, i.rnote, i.updated_at
  from inspection_items i
  join inspections n on n.id = i.inspection_id and n.deleted_at is null
  join projects p on p.id = i.project_id
  where i.assignee_id = auth.uid()
    and i.status in ('assigned','rejected','fixed')
  order by (i.status = 'fixed'), i.due_date nulls last, i.updated_at;
$$;

create function public.report_fixed(p_item text, p_after text[] default '{}', p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare it inspection_items;
begin
  select * into it from inspection_items where id = p_item for update;
  if not found or it.assignee_id is distinct from auth.uid() then
    raise exception 'item not assigned to you';
  end if;
  if it.status not in ('assigned','rejected') then
    raise exception 'item is %, cannot report fixed', it.status;
  end if;
  update inspection_items
     set status = 'fixed',
         after = it.after || coalesce(p_after, '{}'),
         fixed_note = coalesce(p_note, '')
   where id = p_item;
end $$;

create function public.review_item(p_item text, p_ok boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare it inspection_items;
begin
  select * into it from inspection_items where id = p_item for update;
  if not found or not public.can_edit_project(it.project_id) then
    raise exception 'not allowed';
  end if;
  update inspection_items
     set status = case when p_ok then 'approved' else 'rejected' end,
         rnote  = coalesce(nullif(p_note, ''), rnote),
         rdate  = to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD')
   where id = p_item;
end $$;

-- ---------------------------------------------------------------------
-- 6. Grants (the project was created with "auto-expose new tables" off)
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.projects, public.project_members,
              public.inspections, public.inspection_items, public.item_events from anon;

grant select on public.profiles to authenticated;
grant update (display_name, line_user_id, org_role) on public.profiles to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.inspections to authenticated;
grant select, insert, update, delete on public.inspection_items to authenticated;
grant select on public.item_events to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.my_tasks() to authenticated;
grant execute on function public.report_fixed(text, text[], text) to authenticated;
grant execute on function public.review_item(text, boolean, text) to authenticated;
grant execute on function public.is_org_reader(), public.is_org_admin(), public.project_role(text),
  public.can_see_project(text), public.can_read_inspections(text), public.can_edit_project(text),
  public.can_manage_project(text), public.is_assigned_in_inspection(text),
  public.shares_project_with(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Storage: private photo bucket, path = {project_id}/{inspection_id}/{before|after}/{file}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos'
         and (public.can_read_inspections((storage.foldername(name))[1])
              or public.is_assigned_in_inspection((storage.foldername(name))[2])));

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos'
              and (public.can_edit_project((storage.foldername(name))[1])
                   or ((storage.foldername(name))[3] = 'after'
                       and public.is_assigned_in_inspection((storage.foldername(name))[2]))));

create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'inspection-photos' and public.can_edit_project((storage.foldername(name))[1]));

create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-photos' and public.can_edit_project((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------
-- 8. Realtime (live lists for foreman / headman screens)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.inspections, public.inspection_items;
  end if;
end $$;
