-- =====================================================================
-- QC App · Phase 1 schema
--
-- Ownership model ("each document is managed by whoever owns it")
--   * Every inspection has one owner (inspections.owner_id).
--     Only the owner edits its content: header, items, results,
--     "before" photos, assignments, due dates; only the owner deletes it.
--   * Every member of the same project (pm, foreman, headman, viewer)
--     can SEE the document and can RECHECK items (pass / fail + note +
--     after photos) through recheck_item(). Nothing else.
--   * The assigned headman can also report "fixed" (+ after photos)
--     through report_fixed(); a recheck still has to follow.
--   * The project's PM can hand a document to another pm/foreman of the
--     project with transfer_inspection().
--   * Org level: ceo/admin read every project (read only). Only admin
--     creates projects; admin or the project PM manages members.
--   * Who may create a document: pm or foreman of the project.
--
-- Offline conflict rules (enforced here, client syncs through these paths)
--   1. Owner edits from two devices -> plain column updates, the later
--      write per field wins (client sends only the fields it changed).
--   2. Owner edits an item while someone else rechecks it -> different
--      columns, both survive.
--   3. Two people recheck the same item -> recheck_item() takes the
--      recheck state the client last saw (p_seen_at). If someone else got
--      there first, the late result is NOT applied; it is stored in
--      item_events as 'recheck_conflict' and the function returns
--      'conflict' so the app can tell the user.
--   4. Item deleted while someone rechecks it offline -> recheck_item()
--      returns 'gone'; the client keeps the result locally and tells
--      the user.
--
-- Item workflow (inspection_items.status), only for res = fix|bad:
--   open -> assigned -> fixed -> approved
--                  ^       |
--                  +- rejected
--   Legacy form fields stay in step: rres='ok' <-> approved,
--   rres='bad' <-> rejected, so the existing form keeps working.
--
-- Run once in the Supabase SQL Editor of an empty project.
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
  owner_id    uuid not null references auth.users(id) default auth.uid(),
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
create index inspections_owner_idx on public.inspections(owner_id);

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
  rchk_at        timestamptz,                    -- when the current recheck result was set
  rchk_by        uuid references auth.users(id), -- and by whom
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

-- Audit trail per item. No FK to the item: history must outlive a deleted item.
create table public.item_events (
  id           bigint generated always as identity primary key,
  item_id      text not null,
  inspection_id text not null,
  project_id   text not null references public.projects(id) on delete cascade,
  actor        uuid references auth.users(id) default auth.uid(),
  kind         text not null check (kind in ('created','status','assign','due','recheck','recheck_conflict','deleted')),
  from_value   text,
  to_value     text,
  note         text not null default '',
  photos       text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index item_events_item_idx on public.item_events(item_id, created_at);
create index item_events_project_idx on public.item_events(project_id, created_at desc);

create table public.inspection_events (
  id             bigint generated always as identity primary key,
  inspection_id  text not null,
  project_id     text not null references public.projects(id) on delete cascade,
  actor          uuid references auth.users(id) default auth.uid(),
  kind           text not null check (kind in ('transfer')),
  from_value     text,
  to_value       text,
  created_at     timestamptz not null default now()
);

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

create function public.is_member(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.project_role(p) is not null;
$$;

-- see the project, its documents and its items
create function public.can_see_project(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_reader() or public.is_member(p);
$$;

create function public.can_create_inspection(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.project_role(p) in ('pm','foreman'), false);
$$;

create function public.can_manage_project(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_admin() or coalesce(public.project_role(p) = 'pm', false);
$$;

-- owner who is still a member of the document's project
create function public.is_inspection_owner(insp text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inspections
                 where id = insp and owner_id = auth.uid()
                   and public.is_member(project_id));
$$;

create function public.inspection_in_project(insp text, p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inspections where id = insp and project_id = p);
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

-- 3c. inspections: rev / updated_*, project and owner are fixed except via transfer
create function public.touch_inspection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'UPDATE' then
    new.rev := old.rev + 1;
    if new.project_id is distinct from old.project_id then
      raise exception 'an inspection cannot move to another project';
    end if;
    if new.owner_id is distinct from old.owner_id
       and auth.uid() is not null
       and coalesce(public.project_role(new.project_id) = 'pm', false) is false then
      raise exception 'only the project pm can transfer a document';
    end if;
  end if;
  return new;
end $$;
create trigger inspections_touch before insert or update on public.inspections
  for each row execute function public.touch_inspection();

-- 3d. items: copy project_id, derive status, guard transitions
create function public.item_workflow() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  old_status text := case when tg_op = 'UPDATE' then old.status end;
  old_rres   text := case when tg_op = 'UPDATE' then old.rres end;
begin
  select project_id into new.project_id from inspections where id = new.inspection_id;
  if new.project_id is null then
    raise exception 'inspection % not found', new.inspection_id;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(uid, new.updated_by);

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from project_members
                     where project_id = new.project_id and user_id = new.assignee_id) then
    raise exception 'assignee must be a member of the project';
  end if;

  -- legacy recheck fields drive status when status itself was not touched
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.rres is distinct from old.rres then
    new.status := case new.rres when 'ok' then 'approved'
                                when 'bad' then 'rejected'
                                else case when new.assignee_id is null then 'open' else 'assigned' end end;
  end if;

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
  -- stamp only when a recheck RESULT is recorded (not on create, not when
  -- report_fixed clears it), so rchk_at means "last recheck happened at"
  if new.rres in ('ok','bad') and new.rres is distinct from old_rres then
    new.rchk_at := now();
    new.rchk_by := uid;
  end if;
  if new.status = 'fixed' and old_status is distinct from 'fixed' then
    new.fixed_at := now();
  end if;

  -- who may make the transition (uid null = SQL editor / service role)
  if uid is not null and new.status is distinct from old_status then
    if new.status in ('approved','rejected') and not public.is_member(new.project_id) then
      raise exception 'only project members may recheck';
    end if;
    if new.status = 'fixed' and new.assignee_id is distinct from uid
       and not public.is_inspection_owner(new.inspection_id) then
      raise exception 'only the assignee or the document owner may report fixed';
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
  if tg_op = 'DELETE' then
    insert into item_events(item_id, inspection_id, project_id, kind, from_value)
    values (old.id, old.inspection_id, old.project_id, 'deleted', old.status);
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status is not null then
      insert into item_events(item_id, inspection_id, project_id, kind, to_value)
      values (new.id, new.inspection_id, new.project_id, 'created', new.status);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into item_events(item_id, inspection_id, project_id, kind, from_value, to_value, note)
    values (new.id, new.inspection_id, new.project_id, 'status', old.status, new.status,
            case new.status when 'fixed' then new.fixed_note
                            when 'rejected' then new.rnote
                            when 'approved' then new.rnote else '' end);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into item_events(item_id, inspection_id, project_id, kind, from_value, to_value)
    values (new.id, new.inspection_id, new.project_id, 'assign', old.assignee_id::text, new.assignee_id::text);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into item_events(item_id, inspection_id, project_id, kind, from_value, to_value)
    values (new.id, new.inspection_id, new.project_id, 'due', old.due_date::text, new.due_date::text);
  end if;
  return new;
end $$;
create trigger inspection_items_events after insert or update or delete on public.inspection_items
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
alter table public.inspection_events enable row level security;

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

-- inspections: everyone in the project sees; only the owner writes
create policy inspections_select on public.inspections for select to authenticated
  using (public.can_see_project(project_id));
create policy inspections_insert on public.inspections for insert to authenticated
  with check (public.can_create_inspection(project_id) and owner_id = auth.uid());
create policy inspections_update on public.inspections for update to authenticated
  using (owner_id = auth.uid() and public.is_member(project_id))
  with check (owner_id = auth.uid() and public.is_member(project_id));
create policy inspections_delete on public.inspections for delete to authenticated
  using (owner_id = auth.uid() and public.is_member(project_id));

-- inspection_items: everyone in the project sees; only the document owner
-- writes directly. Others recheck via recheck_item(), headman reports via
-- report_fixed().
create policy items_select on public.inspection_items for select to authenticated
  using (public.can_see_project(project_id));
create policy items_insert on public.inspection_items for insert to authenticated
  with check (public.is_inspection_owner(inspection_id));
create policy items_update on public.inspection_items for update to authenticated
  using (public.is_inspection_owner(inspection_id))
  with check (public.is_inspection_owner(inspection_id));
create policy items_delete on public.inspection_items for delete to authenticated
  using (public.is_inspection_owner(inspection_id));

-- history: read-only, written by triggers / functions
create policy item_events_select on public.item_events for select to authenticated
  using (public.can_see_project(project_id));
create policy inspection_events_select on public.inspection_events for select to authenticated
  using (public.can_see_project(project_id));

-- ---------------------------------------------------------------------
-- 5. Functions the app calls
-- ---------------------------------------------------------------------
-- Headman's list: items assigned to me that still need something
create function public.my_tasks()
returns table (
  item_id text, project_id text, project_name text, inspection_id text, docno text,
  work text, loc text, chk text, note text, cat text, ref text, res text,
  before text[], after text[], status text, due_date date, rnote text,
  rchk_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.project_id, p.name, i.inspection_id, n.docno,
         n.work, i.loc, i.chk, i.note, i.cat, i.ref, i.res,
         i.before, i.after, i.status, i.due_date, i.rnote, i.rchk_at, i.updated_at
  from inspection_items i
  join inspections n on n.id = i.inspection_id and n.deleted_at is null
  join projects p on p.id = i.project_id
  where i.assignee_id = auth.uid()
    and public.is_member(i.project_id)
    and i.status in ('assigned','rejected','fixed')
  order by (i.status = 'fixed'), i.due_date nulls last, i.updated_at;
$$;

-- Assigned headman: "I fixed it" (+ after photos). Does not close the item.
create function public.report_fixed(p_item text, p_after text[] default '{}', p_note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare it inspection_items;
begin
  select * into it from inspection_items where id = p_item for update;
  if not found then return 'gone'; end if;
  if it.assignee_id is distinct from auth.uid() or not public.is_member(it.project_id) then
    raise exception 'item not assigned to you';
  end if;
  if it.status = 'fixed' then return 'already_fixed'; end if;
  if it.status not in ('assigned','rejected') then
    raise exception 'item is %, cannot report fixed', it.status;
  end if;
  update inspection_items
     set status = 'fixed',
         after = it.after || coalesce(p_after, '{}'),
         fixed_note = coalesce(p_note, '')
   where id = p_item;
  return 'ok';
end $$;

-- Any project member: recheck result. p_seen_at = the item's rchk_at the
-- client had when the user rechecked (null if it had never been rechecked).
-- Returns 'ok' | 'conflict' (someone else rechecked first; kept in history) | 'gone'.
create function public.recheck_item(
  p_item text, p_result text, p_note text default '',
  p_after text[] default '{}', p_seen_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare it inspection_items;
begin
  if p_result not in ('ok','bad') then
    raise exception 'result must be ok or bad';
  end if;
  select * into it from inspection_items where id = p_item for update;
  if not found then return 'gone'; end if;
  if not public.is_member(it.project_id) then
    raise exception 'only project members may recheck';
  end if;
  if it.res not in ('fix','bad') then
    raise exception 'item does not need a recheck';
  end if;
  if it.rchk_at is distinct from p_seen_at then
    insert into item_events(item_id, inspection_id, project_id, kind, to_value, note, photos)
    values (it.id, it.inspection_id, it.project_id, 'recheck_conflict', p_result,
            coalesce(p_note, ''), coalesce(p_after, '{}'));
    return 'conflict';
  end if;
  update inspection_items
     set status = case p_result when 'ok' then 'approved' else 'rejected' end,
         rnote  = coalesce(p_note, ''),
         rdate  = to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD'),
         after  = it.after || coalesce(p_after, '{}'),
         rchk_at = now(),
         rchk_by = auth.uid()
   where id = p_item;
  insert into item_events(item_id, inspection_id, project_id, kind, to_value, note, photos)
  values (it.id, it.inspection_id, it.project_id, 'recheck', p_result,
          coalesce(p_note, ''), coalesce(p_after, '{}'));
  return 'ok';
end $$;

-- Project PM hands a document to another pm/foreman of the same project.
create function public.transfer_inspection(p_insp text, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d inspections;
begin
  select * into d from inspections where id = p_insp for update;
  if not found then raise exception 'inspection not found'; end if;
  if auth.uid() is not null and coalesce(public.project_role(d.project_id) = 'pm', false) is false then
    raise exception 'only the project pm can transfer a document';
  end if;
  if not exists (select 1 from project_members
                 where project_id = d.project_id and user_id = p_new_owner and role in ('pm','foreman')) then
    raise exception 'new owner must be a pm or foreman of the project';
  end if;
  update inspections set owner_id = p_new_owner where id = p_insp;
  insert into inspection_events(inspection_id, project_id, kind, from_value, to_value)
  values (d.id, d.project_id, 'transfer', d.owner_id::text, p_new_owner::text);
end $$;

-- ---------------------------------------------------------------------
-- 6. Grants (the project was created with "auto-expose new tables" off)
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.projects, public.project_members, public.inspections,
              public.inspection_items, public.item_events, public.inspection_events from anon;

grant select on public.profiles to authenticated;
grant update (display_name, line_user_id, org_role) on public.profiles to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.inspections to authenticated;
grant select, insert, update, delete on public.inspection_items to authenticated;
grant select on public.item_events, public.inspection_events to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.my_tasks(),
  public.report_fixed(text, text[], text),
  public.recheck_item(text, text, text, text[], timestamptz),
  public.transfer_inspection(text, uuid),
  public.is_org_reader(), public.is_org_admin(), public.project_role(text), public.is_member(text),
  public.can_see_project(text), public.can_create_inspection(text), public.can_manage_project(text),
  public.is_inspection_owner(text), public.inspection_in_project(text, text),
  public.shares_project_with(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 7. Storage: private bucket, path = {project_id}/{inspection_id}/{before|after}/{file}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos'
         and public.can_see_project((storage.foldername(name))[1]));

-- owner uploads anything; any project member may add "after" (recheck/fixed) photos
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos'
              and public.inspection_in_project((storage.foldername(name))[2], (storage.foldername(name))[1])
              and (public.is_inspection_owner((storage.foldername(name))[2])
                   or ((storage.foldername(name))[3] = 'after'
                       and public.is_member((storage.foldername(name))[1]))));

create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'inspection-photos'
         and public.is_inspection_owner((storage.foldername(name))[2]));

create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-photos'
         and public.is_inspection_owner((storage.foldername(name))[2]));

-- ---------------------------------------------------------------------
-- 8. Realtime (live lists)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.inspections, public.inspection_items;
  end if;
end $$;
