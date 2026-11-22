-- =====================================================================
-- QC App · migration 0003 — LINE OA notifications
--
-- What it adds
--   * notifications: one row per message to one person, written by a trigger
--     on inspection_items (never by the app):
--       - item assigned to you                → assignee
--       - assignee reported "แจ้งแก้แล้ว"      → document owner
--       - recheck failed / passed             → assignee
--       - daily 08:00 digest of overdue items → assignee
--     Nobody is told about their own action.
--   * LINE account linking: the app asks for a 6-digit code (line_link_start),
--     the user sends it to the LINE OA, the Edge Function "line-notify"
--     calls line_link_complete() with the sender's LINE userId.
--   * profiles.line_user_id becomes private (not readable by teammates,
--     not writable from the app; only set through the linking flow).
--   * After new notifications are queued, pg_net pokes the Edge Function,
--     which sends them through the LINE Messaging API. pg_cron retries
--     every 10 minutes and queues the morning digest.
--
-- Safety: every notification step is wrapped so a failure here can never
-- block saving an inspection item. If pg_net / pg_cron are not available
-- the queue simply waits (nothing breaks).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. line_user_id is private
-- ---------------------------------------------------------------------
revoke select on public.profiles from authenticated;
grant select (id, display_name, email, org_role, created_at) on public.profiles to authenticated;
revoke update (line_user_id) on public.profiles from authenticated;

-- ---------------------------------------------------------------------
-- 2. settings (no direct client access; read through functions)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key   text primary key,
  value text not null default ''
);
alter table public.app_settings enable row level security;
insert into public.app_settings(key, value) values
  ('app_url',    'https://sittikorn0349.github.io/qc-app/beta/?mode=online'),
  ('line_oa_id', ''),   -- the OA's basic ID, e.g. @123abcde (set after creating the OA)
  ('notify_url', 'https://kcuhizrtegornpqtaijx.supabase.co/functions/v1/line-notify');

-- ---------------------------------------------------------------------
-- 3. linking a LINE account
-- ---------------------------------------------------------------------
create table public.line_link_codes (
  code       text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.line_link_codes enable row level security;

create function public.line_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'linked', coalesce((select line_user_id is not null from profiles where id = auth.uid()), false),
    'oa',     coalesce((select value from app_settings where key = 'line_oa_id'), ''));
$$;

create function public.line_link_start()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from line_link_codes where user_id = auth.uid() or expires_at < now();
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    insert into line_link_codes(code, user_id) values (c, auth.uid()) on conflict do nothing;
    exit when found;
  end loop;
  return public.line_status() || jsonb_build_object('code', c);
end $$;

create function public.line_unlink()
returns void language sql security definer set search_path = public as $$
  update profiles set line_user_id = null where id = auth.uid();
$$;

-- called by the Edge Function (service role) when a code arrives on LINE
create function public.line_link_complete(p_code text, p_line_user text)
returns text language plpgsql security definer set search_path = public as $$
declare u uuid; n text;
begin
  delete from line_link_codes where code = p_code and expires_at >= now() returning user_id into u;
  if u is null then return null; end if;
  update profiles set line_user_id = null where line_user_id = p_line_user and id <> u;
  update profiles set line_user_id = p_line_user where id = u returning nullif(display_name, '') into n;
  return coalesce(n, 'บัญชีของคุณ');
end $$;

-- ---------------------------------------------------------------------
-- 4. the queue
-- ---------------------------------------------------------------------
create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('assign','fixed','rejected','approved','overdue')),
  project_id text,
  item_id    text,
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  tries      integer not null default 0,
  sent_at    timestamptz,
  error      text
);
create index notifications_unsent_idx on public.notifications(id) where sent_at is null;
create index notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
grant select on public.notifications to authenticated;

create function public.queue_item_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  d record;
  what text;
  who text;
  due text;
begin
  begin
    if new.res not in ('fix','bad') then return null; end if;
    select n.owner_id, coalesce(nullif(n.docno, ''), nullif(n.work, ''), 'เอกสารตรวจงาน') as doc, p.name as project
      into d from inspections n join projects p on p.id = n.project_id where n.id = new.inspection_id;
    if not found then return null; end if;
    what := coalesce(nullif(concat_ws(' · ', nullif(new.loc, ''), nullif(new.chk, '')), ''), nullif(new.note, ''), 'รายการตรวจ');
    what := d.project || ' · ' || d.doc || E'\n' || what;
    select coalesce(nullif(display_name, ''), email, 'สมาชิก') into who from profiles where id = actor;
    due := case when new.due_date is null then ''
                else E'\nกำหนดแก้เสร็จ ' || to_char(new.due_date, 'DD/MM/YYYY') end;

    -- (re)assigned to someone
    if new.assignee_id is not null
       and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
       and new.status in ('assigned','rejected')
       and new.assignee_id is distinct from actor then
      insert into notifications(user_id, kind, project_id, item_id, title, body)
      values (new.assignee_id, 'assign', new.project_id, new.id, 'มีงานแก้มอบหมายให้คุณ',
              what || due || coalesce(E'\nโดย ' || who, ''));
    end if;

    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      if new.status = 'fixed' and d.owner_id is distinct from actor then
        insert into notifications(user_id, kind, project_id, item_id, title, body)
        values (d.owner_id, 'fixed', new.project_id, new.id, 'แจ้งแก้แล้ว รอตรวจซ้ำ',
                what || coalesce(E'\nโดย ' || who, '') ||
                case when new.fixed_note <> '' then E'\n“' || new.fixed_note || '”' else '' end);
      elsif new.status in ('approved','rejected') and new.assignee_id is not null
            and new.assignee_id is distinct from actor then
        insert into notifications(user_id, kind, project_id, item_id, title, body)
        values (new.assignee_id, new.status, new.project_id, new.id,
                case new.status when 'approved' then 'ตรวจซ้ำผ่านแล้ว' else 'ตรวจซ้ำยังไม่ผ่าน ต้องแก้อีกครั้ง' end,
                what || coalesce(E'\nโดย ' || who, '') ||
                case when new.rnote <> '' then E'\n“' || new.rnote || '”' else '' end);
      end if;
    end if;
  exception when others then
    raise warning 'queue_item_notifications skipped: %', sqlerrm;
  end;
  return null;
end $$;
create trigger inspection_items_notify after insert or update on public.inspection_items
  for each row execute function public.queue_item_notifications();

-- morning digest: one message per person with overdue items
create function public.queue_overdue_digest() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into notifications(user_id, kind, title, body)
  select i.assignee_id, 'overdue', 'งานแก้เลยกำหนด ' || count(*) || ' รายการ',
         string_agg(p.name || ' · ' || coalesce(nullif(concat_ws(' · ', nullif(i.loc, ''), nullif(i.chk, '')), ''), 'รายการตรวจ')
                    || ' (กำหนด ' || to_char(i.due_date, 'DD/MM') || ')', E'\n' order by i.due_date)
  from inspection_items i
  join inspections n on n.id = i.inspection_id and n.deleted_at is null
  join projects p on p.id = i.project_id
  where i.assignee_id is not null and i.status in ('assigned','rejected')
    and i.due_date < (now() at time zone 'Asia/Bangkok')::date
    and exists (select 1 from project_members m where m.project_id = i.project_id and m.user_id = i.assignee_id)
  group by i.assignee_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Edge Function takes a batch to send (skip locked: two runs never send the same row)
create function public.claim_notifications(p_limit integer default 200)
returns table (id bigint, user_id uuid, line_user_id text, title text, body text, created_at timestamptz)
language sql security definer set search_path = public as $$
  with c as (
    select n.id from notifications n
    where n.sent_at is null and n.tries < 5
      and (n.claimed_at is null or n.claimed_at < now() - interval '5 minutes')
    order by n.id limit p_limit
    for update skip locked)
  update notifications n set claimed_at = now(), tries = n.tries + 1
  from c where n.id = c.id
  returning n.id, n.user_id, (select line_user_id from profiles where profiles.id = n.user_id), n.title, n.body, n.created_at;
$$;
create function public.finish_notifications(p_ids bigint[], p_error text default null)
returns void language sql security definer set search_path = public as $$
  update notifications
     set sent_at = case when p_error is null or p_error = 'no_line' then now() else sent_at end,
         error = p_error, claimed_at = null
   where id = any(p_ids);
$$;

-- poke the Edge Function (pg_net) — never raises
create function public.kick_line_notify() returns void
language plpgsql security definer set search_path = public as $$
declare u text;
begin
  select value into u from app_settings where key = 'notify_url';
  if coalesce(u, '') = '' then return; end if;
  if not exists (select 1 from notifications where sent_at is null and tries < 5) then return; end if;
  begin
    execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := ''{"Content-Type":"application/json"}''::jsonb)' using u;
  exception when others then
    raise warning 'kick_line_notify: %', sqlerrm;
  end;
end $$;
create function public.notifications_kick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.kick_line_notify();
  return null;
end $$;
create trigger notifications_after_insert after insert on public.notifications
  for each statement execute function public.notifications_kick();

-- ---------------------------------------------------------------------
-- 5. grants
-- ---------------------------------------------------------------------
revoke execute on function
  public.line_status(), public.line_link_start(), public.line_unlink(),
  public.line_link_complete(text, text), public.queue_item_notifications(),
  public.queue_overdue_digest(), public.claim_notifications(integer),
  public.finish_notifications(bigint[], text), public.kick_line_notify(), public.notifications_kick()
  from public, anon, authenticated;
grant execute on function public.line_status(), public.line_link_start(), public.line_unlink() to authenticated;
do $$ begin
  execute 'grant execute on function public.line_link_complete(text, text), public.claim_notifications(integer),
           public.finish_notifications(bigint[], text) to service_role';
exception when undefined_object then null;  -- local test database has no service_role
end $$;

-- ---------------------------------------------------------------------
-- 6. background jobs (Supabase: pg_net + pg_cron). Skipped where missing.
-- ---------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_net;
exception when others then raise notice 'pg_net not available: %', sqlerrm;
end $$;
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('qc-line-retry', '*/10 * * * *', 'select public.kick_line_notify()');
  perform cron.schedule('qc-overdue-digest', '0 1 * * *', 'select public.queue_overdue_digest()');  -- 08:00 Asia/Bangkok
exception when others then raise notice 'pg_cron not available: %', sqlerrm;
end $$;
