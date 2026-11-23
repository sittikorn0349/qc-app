-- 006 · workspace for the new UX (canvas "QC App · UX ใหม่ (แบบ Discord)")
--   company (the "server": name, join code, plan) · roles & permissions (Discord-style, mapped onto the
--   four base roles that every existing RLS rule already uses) · channels per project (+ per-channel access)
--   · chat messages in channels and in each check item's thread · unread markers · plan (tasks, baseline,
--   weekly promises) · share links for outsiders.
-- Nothing existing is removed or tightened: old clients keep working. Safe to run once in the SQL editor.

-- 0. helpers -------------------------------------------------------------------
create or replace function public.base_rank(r text) returns int language sql immutable as $$
  select case r when 'pm' then 4 when 'foreman' then 3 when 'headman' then 2 when 'viewer' then 1 else 0 end $$;

-- 1. company (one per deployment) ---------------------------------------------
create table if not exists public.company (
  id             int primary key default 1 check (id = 1),
  name           text not null default 'บริษัทของฉัน',
  join_code      text not null default upper(substr(md5(random()::text), 1, 3) || '-' || substr(md5(random()::text), 1, 3)),
  plan           text not null default 'free' check (plan in ('free','team','org')),
  seats          int  not null default 10,
  share_max_days int,                           -- null = no limit; the sharer picks within it
  standards      text[] not null default array['รายการประกอบแบบของโครงการ','มยผ.','วสท.']
);
insert into public.company (id) values (1) on conflict do nothing;
alter table public.company enable row level security;
drop policy if exists company_select on public.company;
create policy company_select on public.company for select to authenticated using (true);
drop policy if exists company_update on public.company;
create policy company_update on public.company for update to authenticated using (public.is_org_admin()) with check (public.is_org_admin());
grant select (id, name, plan, seats, share_max_days, standards) on public.company to authenticated;
grant update (name, share_max_days, standards) on public.company to authenticated;

alter table public.profiles add column if not exists joined boolean not null default false;
update public.profiles set joined = true where not joined and created_at < now();   -- everyone already here is in

create or replace function public.join_company(code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from company where upper(btrim(join_code)) = upper(btrim(code))) then return false; end if;
  update profiles set joined = true where id = auth.uid();
  return true;
end $$;
create or replace function public.company_code() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_org_admin() then (select join_code from company where id = 1) end $$;
create or replace function public.rotate_join_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(random()::text), 1, 3) || '-' || substr(md5(random()::text), 1, 3));
begin
  if not public.is_org_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update company set join_code = c where id = 1;
  return c;
end $$;
create or replace function public.company_info() returns table (name text, plan text, seats int, members int, joined boolean, is_admin boolean, share_max_days int, standards text[])
language sql stable security definer set search_path = public as $$
  select c.name, c.plan, c.seats, (select count(*)::int from profiles where joined),
         coalesce((select joined from profiles where id = auth.uid()), false), public.is_org_admin(), c.share_max_days, c.standards
  from company c where c.id = 1 $$;
grant execute on function public.join_company(text), public.company_code(), public.rotate_join_code(), public.company_info() to authenticated;

-- 2. roles & permissions --------------------------------------------------------
-- A custom role carries display name, colour, order and a permission list. `base` is the project role it
-- grants on the server (pm / foreman / headman / viewer): everything already protected by RLS keeps using
-- that, and the finer permissions below are checked by has_perm() in the new RPCs and by the app's UI.
create table if not exists public.roles (
  id        text primary key default ('rl_' || replace(gen_random_uuid()::text, '-', '')),
  name      text not null,
  color     text not null default '#5B6B7F',
  position  int  not null default 0,          -- higher = more senior
  base      text not null default 'viewer' check (base in ('pm','foreman','headman','viewer')),
  perms     text[] not null default '{}',
  builtin   boolean not null default false,
  created_at timestamptz not null default now()
);
insert into public.roles (id, name, color, position, base, perms, builtin) values
 ('owner',     'เจ้าของ',            '#7A2E8E', 100, 'pm',      array['*'], true),
 ('admin',     'แอดมิน',             '#B42318',  90, 'pm',      array['*'], true),
 ('pm',        'PM',                 '#1F5FA8',  80, 'pm',      array['ins_view','ins_create','ins_edit_own','ins_recheck','ins_assign','ins_approve','ch_manage','ch_post','mem_manage','dw_upload','pl_edit','pl_baseline','pl_assign','req_create','req_answer'], true),
 ('qc',        'วิศวกร QC',          '#0E7C66',  70, 'foreman', array['ins_view','ins_create','ins_edit_own','ins_recheck','ins_assign','ch_post','dw_upload','req_answer'], true),
 ('foreman',   'โฟร์แมน',            '#B26B00',  60, 'foreman', array['ins_view','ins_create','ins_edit_own','ch_post','req_create','pl_progress'], true),
 ('headman',   'เฮดแมน / ช่าง',      '#8A5A00',  50, 'headman', array['ins_view','ins_fix','ch_post','pl_progress'], true),
 ('sub',       'ผู้รับเหมาช่วง',      '#5A6B7F',  40, 'headman', array['ins_view','ins_fix','ch_post'], true),
 ('owner_rep', 'ผู้แทนเจ้าของงาน',    '#4A2F86',  30, 'viewer',  array['ins_view','ins_approve','ch_post'], true),
 ('everyone',  '@ทุกคน',             '#98A2B3',   0, 'viewer',  array['ins_view'], true)
on conflict (id) do nothing;
alter table public.roles enable row level security;
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated using (true);
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all to authenticated using (public.is_org_admin()) with check (public.is_org_admin());
grant select, insert, update, delete on public.roles to authenticated;

create table if not exists public.member_roles (
  project_id text not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role_id    text not null references public.roles(id) on delete cascade,
  primary key (project_id, user_id, role_id)
);
alter table public.member_roles enable row level security;
drop policy if exists member_roles_select on public.member_roles;
create policy member_roles_select on public.member_roles for select to authenticated using (public.can_see_project(project_id));
grant select on public.member_roles to authenticated;

-- roles a user holds in a project; members without explicit roles get the builtin role of their base role
create or replace function public.user_roles(p text, u uuid) returns setof public.roles
language sql stable security definer set search_path = public as $$
  select r.* from roles r join member_roles m on m.role_id = r.id where m.project_id = p and m.user_id = u
  union
  select r.* from roles r join project_members pm on pm.project_id = p and pm.user_id = u
   where not exists (select 1 from member_roles m where m.project_id = p and m.user_id = u)
     and r.id = case pm.role when 'pm' then 'pm' when 'foreman' then 'qc' when 'headman' then 'headman' else 'everyone' end
  union
  select r.* from roles r where r.id = 'everyone' and exists (select 1 from project_members pm where pm.project_id = p and pm.user_id = u)
$$;
create or replace function public.has_perm(p text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_admin() or exists (select 1 from public.user_roles(p, auth.uid()) r where '*' = any(r.perms) or perm = any(r.perms)) $$;
create or replace function public.my_permissions(p text) returns table (perms text[], roles text[], top int)
language sql stable security definer set search_path = public as $$
  select case when public.is_org_admin() then array['*'] else coalesce(array_agg(distinct x), '{}') end,
         coalesce((select array_agg(id) from public.user_roles(p, auth.uid())), '{}'),
         case when public.is_org_admin() then 1000 else coalesce((select max(position) from public.user_roles(p, auth.uid())), -1) end
  from public.user_roles(p, auth.uid()) r left join lateral unnest(r.perms) x on true $$;
grant execute on function public.user_roles(text, uuid), public.has_perm(text, text), public.my_permissions(text) to authenticated;

create table if not exists public.role_audit (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid default auth.uid(),
  project_id text,
  action     text not null,
  target     text not null default '',
  detail     jsonb not null default '{}'
);
alter table public.role_audit enable row level security;
drop policy if exists role_audit_select on public.role_audit;
create policy role_audit_select on public.role_audit for select to authenticated
  using (public.is_org_admin() or (project_id is not null and public.can_manage_project(project_id)));
grant select on public.role_audit to authenticated;

create or replace function public.audit_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into role_audit(action, target, detail) values (lower(tg_op) || '_role', coalesce(new.id, old.id),
    jsonb_build_object('before', case when tg_op <> 'INSERT' then to_jsonb(old) end, 'after', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return coalesce(new, old);
end $$;
drop trigger if exists roles_audit on public.roles;
create trigger roles_audit after insert or update or delete on public.roles for each row execute function public.audit_roles();
create or replace function public.guard_builtin_role() returns trigger
language plpgsql as $$
begin
  if old.builtin and tg_op = 'DELETE' then raise exception 'builtin roles cannot be deleted'; end if;
  if old.id = 'owner' and tg_op = 'UPDATE' and (new.perms <> old.perms or new.base <> old.base) then
    raise exception 'the owner role is locked so the company cannot be locked out';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists roles_guard on public.roles;
create trigger roles_guard before update or delete on public.roles for each row execute function public.guard_builtin_role();

-- give someone roles in a project: only roles below your own most senior one; base role follows the roles
create or replace function public.set_member_roles(p text, u uuid, role_ids text[]) returns text
language plpgsql security definer set search_path = public as $$
declare mine int; theirs int; want int; b text;
begin
  if not (public.is_org_admin() or public.has_perm(p, 'mem_manage')) then raise exception 'not allowed' using errcode = '42501'; end if;
  mine := case when public.is_org_admin() then 1000 else (select max(position) from public.user_roles(p, auth.uid())) end;
  theirs := coalesce((select max(position) from public.user_roles(p, u)), -1);
  want := coalesce((select max(position) from roles where id = any(role_ids)), -1);
  if theirs >= mine or want >= mine then raise exception 'can only manage roles below your own' using errcode = '42501'; end if;
  if coalesce(array_length(role_ids, 1), 0) = 0 then
    delete from member_roles where project_id = p and user_id = u;
    delete from project_members where project_id = p and user_id = u;
    insert into role_audit(project_id, action, target, detail) values (p, 'remove_member', u::text, '{}');
    return null;
  end if;
  select r.base into b from roles r where r.id = any(role_ids) order by public.base_rank(r.base) desc limit 1;
  insert into project_members(project_id, user_id, role) values (p, u, b)
    on conflict (project_id, user_id) do update set role = excluded.role;
  delete from member_roles where project_id = p and user_id = u and not (role_id = any(role_ids));
  insert into member_roles(project_id, user_id, role_id) select p, u, x from unnest(role_ids) x on conflict do nothing;
  insert into role_audit(project_id, action, target, detail) values (p, 'set_roles', u::text, jsonb_build_object('roles', role_ids, 'base', b));
  return b;
end $$;
grant execute on function public.set_member_roles(text, uuid, text[]) to authenticated;

-- people in the company (to add to a project) and in a project (with roles)
create or replace function public.company_people() returns table (id uuid, name text, email text, joined boolean, org_role text)
language sql stable security definer set search_path = public as $$
  select id, display_name, email, joined, org_role from profiles
   where public.is_org_admin() or exists (select 1 from project_members m where m.user_id = auth.uid() and m.role = 'pm') or id = auth.uid()
   order by display_name $$;
create or replace function public.project_people(p text) returns table (id uuid, name text, email text, base text, roles text[])
language sql stable security definer set search_path = public as $$
  select pr.id, pr.display_name, pr.email, m.role, coalesce((select array_agg(r.id order by r.position desc) from public.user_roles(p, pr.id) r where r.id <> 'everyone'), '{}')
  from project_members m join profiles pr on pr.id = m.user_id
  where m.project_id = p and public.can_see_project(p)
  order by public.base_rank(m.role) desc, pr.display_name $$;
grant execute on function public.company_people(), public.project_people(text) to authenticated;

-- 3. channels --------------------------------------------------------------------
create table if not exists public.channels (
  id           text primary key default ('ch_' || replace(gen_random_uuid()::text, '-', '')),
  project_id   text not null references public.projects(id) on delete cascade,
  name         text not null,
  category     text not null default 'โซนงาน',
  kind         text not null default 'zone' check (kind in ('zone','topic','announce')),
  hold         text check (hold in ('H','W')),
  standard_ref text not null default '',
  position     int  not null default 0,
  created_by   uuid default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create index if not exists channels_project_idx on public.channels (project_id, position);
create table if not exists public.channel_access (
  channel_id text not null references public.channels(id) on delete cascade,
  role_id    text not null references public.roles(id) on delete cascade,
  see        text not null default 'inherit' check (see in ('allow','deny','inherit')),
  post       text not null default 'inherit' check (post in ('allow','deny','inherit')),
  primary key (channel_id, role_id)
);
create or replace function public.channel_rule(ch text, what text) returns text
language sql stable security definer set search_path = public as $$
  -- any allow on one of my roles wins, then any deny, else inherit
  select case when bool_or(v = 'allow') then 'allow' when bool_or(v = 'deny') then 'deny' else 'inherit' end
  from (select case when what = 'see' then a.see else a.post end v
          from channels c join channel_access a on a.channel_id = c.id
          join public.user_roles(c.project_id, auth.uid()) r on r.id = a.role_id
         where c.id = ch) s $$;
create or replace function public.can_see_channel(ch text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels c where c.id = ch and public.can_see_project(c.project_id)
     and (public.is_org_reader() or public.has_perm(c.project_id, 'ch_manage') or coalesce(public.channel_rule(ch, 'see'), 'inherit') <> 'deny')) $$;
create or replace function public.can_post_channel(ch text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels c where c.id = ch and c.archived_at is null and public.is_member(c.project_id)
     and public.can_see_channel(ch)
     and (public.has_perm(c.project_id, 'ch_manage')
          or case coalesce(public.channel_rule(ch, 'post'), 'inherit')
               when 'allow' then true when 'deny' then false
               else c.kind <> 'announce' and public.has_perm(c.project_id, 'ch_post') end)) $$;
grant execute on function public.channel_rule(text, text), public.can_see_channel(text), public.can_post_channel(text) to authenticated;

alter table public.channels enable row level security;
alter table public.channel_access enable row level security;
drop policy if exists channels_select on public.channels;
-- written out on the row itself (not via can_see_channel(id)) so INSERT ... RETURNING sees the new row
create policy channels_select on public.channels for select to authenticated
  using (public.can_see_project(project_id) and (public.is_org_reader() or public.has_perm(project_id, 'ch_manage')
         or coalesce(public.channel_rule(id, 'see'), 'inherit') <> 'deny'));
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated with check (public.has_perm(project_id, 'ch_manage'));
drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update to authenticated using (public.has_perm(project_id, 'ch_manage')) with check (public.has_perm(project_id, 'ch_manage'));
drop policy if exists channel_access_select on public.channel_access;
create policy channel_access_select on public.channel_access for select to authenticated
  using (exists (select 1 from channels c where c.id = channel_id and public.can_see_project(c.project_id)));
drop policy if exists channel_access_write on public.channel_access;
create policy channel_access_write on public.channel_access for all to authenticated
  using (exists (select 1 from channels c where c.id = channel_id and public.has_perm(c.project_id, 'ch_manage')))
  with check (exists (select 1 from channels c where c.id = channel_id and public.has_perm(c.project_id, 'ch_manage')));
grant select, insert, update on public.channels to authenticated;
grant select, insert, update, delete on public.channel_access to authenticated;

-- first visit to a project: make its channels from the PM's zones (or ทั่วไป) + an announcements channel
create or replace function public.ensure_channels(p text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; z text; i int := 0;
begin
  if not public.can_see_project(p) then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from channels where project_id = p) then return 0; end if;
  insert into channels(project_id, name, category, kind, position, created_by) values (p, 'ประกาศ', 'ทั่วไป', 'announce', -1, null);
  for z in select unnest(case when coalesce(array_length(zones, 1), 0) > 0 then zones else array['ทั่วไป'] end) from projects where id = p loop
    insert into channels(project_id, name, category, kind, position, created_by) values (p, z, 'โซนงาน', 'zone', i, null);
    i := i + 1; n := n + 1;
  end loop;
  return n + 1;
end $$;
grant execute on function public.ensure_channels(text) to authenticated;

alter table public.inspections add column if not exists channel_id text references public.channels(id) on delete set null;

-- 4. messages (channel feed + one thread per check item) --------------------------
create table if not exists public.messages (
  id            bigint generated always as identity primary key,
  client_id     text not null unique,                 -- the app's id, so a resend after a lost reply is harmless
  project_id    text not null references public.projects(id) on delete cascade,
  channel_id    text not null references public.channels(id) on delete cascade,
  inspection_id text,
  item_id       text,
  author        uuid not null default auth.uid() references auth.users(id),
  body          text not null default '' check (length(body) <= 4000),
  photos        text[] not null default '{}',
  kind          text not null default 'text' check (kind in ('text','system')),
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  deleted_at    timestamptz
);
create index if not exists messages_channel_idx on public.messages (channel_id, created_at desc);
create index if not exists messages_item_idx on public.messages (item_id, created_at) where item_id is not null;
alter table public.messages enable row level security;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.can_see_channel(channel_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (author = auth.uid() and kind = 'text' and public.can_post_channel(channel_id)
              and exists (select 1 from channels c where c.id = channel_id and c.project_id = messages.project_id));
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated using (author = auth.uid()) with check (author = auth.uid());
grant select, insert on public.messages to authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;

create table if not exists public.channel_reads (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  channel_id text not null references public.channels(id) on delete cascade,
  last_read  timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.channel_reads enable row level security;
drop policy if exists channel_reads_own on public.channel_reads;
create policy channel_reads_own on public.channel_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.channel_reads to authenticated;

create or replace function public.unread_counts(p text) returns table (channel_id text, n int)
language sql stable security definer set search_path = public as $$
  select c.id, (select count(*)::int from messages m where m.channel_id = c.id and m.deleted_at is null and m.author <> auth.uid()
                  and m.created_at > coalesce((select last_read from channel_reads r where r.user_id = auth.uid() and r.channel_id = c.id), '-infinity'))
            + (select count(*)::int from inspections i where i.channel_id = c.id and i.deleted_at is null and i.owner_id <> auth.uid()
                  and i.updated_at > coalesce((select last_read from channel_reads r where r.user_id = auth.uid() and r.channel_id = c.id), '-infinity'))
  from channels c where c.project_id = p and public.can_see_channel(c.id) $$;
grant execute on function public.unread_counts(text) to authenticated;

-- 5. plan -------------------------------------------------------------------------
alter table public.projects add column if not exists weighting text not null default 'boq' check (weighting in ('boq','days'));
alter table public.projects add column if not exists standards text[] not null default '{}';

create table if not exists public.plan_tasks (
  id          text primary key default ('pt_' || replace(gen_random_uuid()::text, '-', '')),
  project_id  text not null references public.projects(id) on delete cascade,
  wbs         text not null default '',
  name        text not null,
  start       date not null default current_date,
  dur         int  not null default 1 check (dur >= 0),
  preds       jsonb not null default '[]',              -- [{id, type: FS|SS|FF, lag}]
  channel_id  text references public.channels(id) on delete set null,
  hold_channel_id text references public.channels(id) on delete set null,   -- H point that must pass first
  weight      numeric not null default 0,               -- BOQ value
  pct         numeric not null default 0 check (pct between 0 and 100),
  assignee    uuid references auth.users(id),
  position    int  not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index if not exists plan_tasks_project_idx on public.plan_tasks (project_id, position);
alter table public.plan_tasks enable row level security;
drop policy if exists plan_select on public.plan_tasks;
create policy plan_select on public.plan_tasks for select to authenticated using (public.can_see_project(project_id));
drop policy if exists plan_write on public.plan_tasks;
create policy plan_write on public.plan_tasks for all to authenticated using (public.has_perm(project_id, 'pl_edit')) with check (public.has_perm(project_id, 'pl_edit'));
grant select, insert, update, delete on public.plan_tasks to authenticated;

create table if not exists public.plan_baselines (
  id          bigint generated always as identity primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  approved_by uuid not null default auth.uid(),
  approved_at timestamptz not null default now(),
  snapshot    jsonb not null
);
alter table public.plan_baselines enable row level security;
drop policy if exists baselines_select on public.plan_baselines;
create policy baselines_select on public.plan_baselines for select to authenticated using (public.can_see_project(project_id));
grant select on public.plan_baselines to authenticated;
create or replace function public.approve_baseline(p text) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  if not public.has_perm(p, 'pl_baseline') then raise exception 'needs the permission อนุมัติแผนฐาน' using errcode = '42501'; end if;
  insert into plan_baselines(project_id, snapshot)
    select p, coalesce(jsonb_agg(to_jsonb(t) order by t.position), '[]') from plan_tasks t where t.project_id = p
  returning id into i;
  insert into role_audit(project_id, action, target, detail) values (p, 'approve_baseline', i::text, '{}');
  return i;
end $$;

create table if not exists public.plan_commitments (
  task_id    text not null references public.plan_tasks(id) on delete cascade,
  week       date not null,                               -- Monday of the week
  user_id    uuid not null references auth.users(id),
  state      text not null default 'assigned' check (state in ('assigned','promised','declined','blocked','done')),
  blocker    text not null default '',
  note       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (task_id, week)
);
alter table public.plan_commitments enable row level security;
drop policy if exists commit_select on public.plan_commitments;
create policy commit_select on public.plan_commitments for select to authenticated
  using (exists (select 1 from plan_tasks t where t.id = task_id and public.can_see_project(t.project_id)));
drop policy if exists commit_assign on public.plan_commitments;
create policy commit_assign on public.plan_commitments for insert to authenticated
  with check (exists (select 1 from plan_tasks t where t.id = task_id and public.has_perm(t.project_id, 'pl_assign')));
grant select, insert on public.plan_commitments to authenticated;
-- the person answers: promise / decline (with reason) / blocked (goes to the 3-week look-ahead) / done; progress %
create or replace function public.answer_commitment(t text, w date, st text, why text default '', progress numeric default null) returns text
language plpgsql security definer set search_path = public as $$
declare p text;
begin
  select project_id into p from plan_tasks where id = t;
  if not exists (select 1 from plan_commitments where task_id = t and week = w and user_id = auth.uid()) then
    raise exception 'not your task' using errcode = '42501'; end if;
  if st not in ('promised','declined','blocked','done') then raise exception 'bad state'; end if;
  if st in ('declined','blocked') and btrim(coalesce(why, '')) = '' then raise exception 'say why' using errcode = '22023'; end if;
  update plan_commitments set state = st, blocker = case when st in ('declined','blocked') then why else blocker end, updated_at = now()
   where task_id = t and week = w;
  if progress is not null then update plan_tasks set pct = greatest(0, least(100, progress)), updated_at = now() where id = t; end if;
  -- an H point that has not passed keeps the task from starting
  if st = 'promised' and exists (select 1 from plan_tasks x where x.id = t and x.hold_channel_id is not null
        and exists (select 1 from inspection_items it join inspections i on i.id = it.inspection_id
                      join channels hc on hc.id = x.hold_channel_id
                     where i.project_id = x.project_id and i.deleted_at is null and it.res in ('fix','bad')
                       and coalesce(it.rres, '') <> 'ok'
                       and (i.channel_id = hc.id or btrim(it.loc) = hc.name or it.loc like hc.name || ' · %'))) then
    return 'held';
  end if;
  return 'ok';
end $$;
grant execute on function public.approve_baseline(text), public.answer_commitment(text, date, text, text, numeric) to authenticated;

-- 6. share links for people outside the system (PDF in a private bucket, signed URL made by the app) -----
insert into storage.buckets (id, name, public) values ('shares', 'shares', false) on conflict (id) do nothing;
drop policy if exists shares_insert on storage.objects;
create policy shares_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shares' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists shares_select on storage.objects;
create policy shares_select on storage.objects for select to authenticated
  using (bucket_id = 'shares' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists shares_delete on storage.objects;
create policy shares_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shares' and (storage.foldername(name))[1] = auth.uid()::text);
create table if not exists public.share_links (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id),
  project_id text references public.projects(id) on delete cascade,
  doc_id     text not null,
  path       text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.share_links enable row level security;
drop policy if exists share_links_own on public.share_links;
create policy share_links_own on public.share_links for all to authenticated
  using (owner_id = auth.uid() or (project_id is not null and public.can_manage_project(project_id)))
  with check (owner_id = auth.uid());
grant select, insert, update on public.share_links to authenticated;

-- 7. live updates ------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.channels; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.plan_commitments; exception when duplicate_object then null; end;
  end if;
end $$;
