-- =====================================================================
-- QC App · migration 0004 — ใบขอตรวจงาน (inspection requests)
--
-- A foreman / PM asks a named inspector to check a piece of work at a set
-- time. The inspector is told on LINE straight away, records pass / fail,
-- and the requester is told whether the next step ("งานถัดไป") may start.
--
--   status: requested → accepted → passed | failed      (or cancelled)
--   hold = true  → a hold point: the next step must wait for "passed"
--
-- Writes: the app inserts a request (pm/foreman of the project, as itself);
-- every later change goes through answer_inspection_request(), which
-- checks who may do what. Notifications use the queue from 0003.
-- =====================================================================

create table public.inspection_requests (
  id            text primary key default ('req_' || replace(gen_random_uuid()::text, '-', '')),
  project_id    text not null references public.projects(id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  loc           text not null default '',
  cat           text not null default '',
  hold          boolean not null default true,
  next_step     text not null default '',
  note          text not null default '',
  inspection_id text references public.inspections(id) on delete set null,
  requested_by  uuid not null default auth.uid() references auth.users(id),
  inspector_id  uuid not null references auth.users(id),
  scheduled_at  timestamptz not null,
  status        text not null default 'requested'
                check (status in ('requested','accepted','passed','failed','cancelled')),
  result_note   text not null default '',
  result_photos text[] not null default '{}',
  result_by     uuid references auth.users(id),
  result_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index inspection_requests_project_idx on public.inspection_requests(project_id, scheduled_at);
create index inspection_requests_inspector_idx on public.inspection_requests(inspector_id, status);
alter table public.inspection_requests enable row level security;

create policy requests_select on public.inspection_requests for select to authenticated
  using (public.can_see_project(project_id));
create policy requests_insert on public.inspection_requests for insert to authenticated
  with check (requested_by = auth.uid()
              and coalesce(public.project_role(project_id) in ('pm','foreman'), false));
grant select, insert on public.inspection_requests to authenticated;

-- insert: inspector must be a member (not the requester), document in the same project,
-- results cannot be pre-filled
create function public.guard_inspection_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from project_members where project_id = new.project_id and user_id = new.inspector_id) then
      raise exception 'inspector must be a member of the project';
    end if;
    if new.inspector_id = new.requested_by then
      raise exception 'choose someone else to inspect';
    end if;
    if new.inspection_id is not null and not public.inspection_in_project(new.inspection_id, new.project_id) then
      raise exception 'document is not in this project';
    end if;
    if auth.uid() is not null then
      new.status := 'requested'; new.result_note := ''; new.result_photos := '{}';
      new.result_by := null; new.result_at := null; new.created_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger inspection_requests_guard before insert or update on public.inspection_requests
  for each row execute function public.guard_inspection_request();

-- every change after creation
--   accept      inspector or project PM             requested → accepted
--   pass / fail inspector or project PM             requested|accepted → passed|failed
--   reschedule  requester, inspector or PM          requested|accepted (back to requested)
--   cancel      requester or PM                     requested|accepted → cancelled
-- returns 'ok' | 'already' (same outcome already recorded) | 'closed' | 'gone'
create function public.answer_inspection_request(
  p_id text, p_action text, p_note text default '', p_photos text[] default '{}',
  p_scheduled timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare r inspection_requests; me uuid := auth.uid(); is_pm boolean;
begin
  select * into r from inspection_requests where id = p_id for update;
  if not found then return 'gone'; end if;
  if not public.is_member(r.project_id) then raise exception 'not a member of this project'; end if;
  is_pm := coalesce(public.project_role(r.project_id) = 'pm', false);
  if p_action in ('pass','fail') and r.status = (case p_action when 'pass' then 'passed' else 'failed' end) then return 'already'; end if;
  if p_action = 'accept' and r.status = 'accepted' then return 'already'; end if;
  if p_action = 'cancel' and r.status = 'cancelled' then return 'already'; end if;
  if r.status not in ('requested','accepted') then return 'closed'; end if;

  if p_action = 'accept' then
    if me is distinct from r.inspector_id and not is_pm then raise exception 'only the inspector can accept'; end if;
    update inspection_requests set status = 'accepted' where id = p_id;
  elsif p_action in ('pass','fail') then
    if me is distinct from r.inspector_id and not is_pm then raise exception 'only the inspector records the result'; end if;
    update inspection_requests
       set status = case p_action when 'pass' then 'passed' else 'failed' end,
           result_note = coalesce(p_note, ''), result_photos = coalesce(p_photos, '{}'),
           result_by = me, result_at = now()
     where id = p_id;
  elsif p_action = 'reschedule' then
    if p_scheduled is null then raise exception 'new time required'; end if;
    if me is distinct from r.requested_by and me is distinct from r.inspector_id and not is_pm then
      raise exception 'not allowed to reschedule';
    end if;
    update inspection_requests set scheduled_at = p_scheduled, status = 'requested',
           note = case when coalesce(p_note, '') <> '' then p_note else note end
     where id = p_id;
  elsif p_action = 'cancel' then
    if me is distinct from r.requested_by and not is_pm then raise exception 'only the requester can cancel'; end if;
    update inspection_requests set status = 'cancelled', result_note = coalesce(p_note, '') where id = p_id;
  else
    raise exception 'unknown action %', p_action;
  end if;
  return 'ok';
end $$;

-- ---------------------------------------------------------------------
-- notifications (queue from 0003)
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('assign','fixed','rejected','approved','overdue',
   'request','request_accepted','request_result','request_cancelled','request_moved','request_today'));

create function public.queue_request_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  who text; proj text; what text; at_txt text;
begin
  begin
    select coalesce(nullif(display_name, ''), email, 'สมาชิก') into who from profiles where id = actor;
    select name into proj from projects where id = new.project_id;
    what := proj || E'\n' || new.title || case when new.loc <> '' then ' · ' || new.loc else '' end;
    at_txt := to_char(new.scheduled_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') || ' น.';

    if tg_op = 'INSERT' then
      insert into notifications(user_id, kind, project_id, item_id, title, body)
      values (new.inspector_id, 'request', new.project_id, new.id,
              case when new.hold then 'ขอตรวจงาน (จุดหยุดตรวจ)' else 'ขอตรวจงาน' end,
              what || E'\nนัด ' || at_txt ||
              case when new.next_step <> '' then E'\nงานถัดไปที่รอผล: ' || new.next_step else '' end ||
              case when new.note <> '' then E'\n“' || new.note || '”' else '' end ||
              coalesce(E'\nโดย ' || who, ''));
    elsif new.status is distinct from old.status then
      if new.status = 'accepted' and new.requested_by is distinct from actor then
        insert into notifications(user_id, kind, project_id, item_id, title, body)
        values (new.requested_by, 'request_accepted', new.project_id, new.id, 'ผู้ตรวจรับนัดแล้ว',
                what || E'\nนัด ' || at_txt || coalesce(E'\nโดย ' || who, ''));
      elsif new.status in ('passed','failed') and new.requested_by is distinct from actor then
        insert into notifications(user_id, kind, project_id, item_id, title, body)
        values (new.requested_by, 'request_result', new.project_id, new.id,
                case new.status when 'passed' then 'ตรวจผ่าน' else 'ตรวจไม่ผ่าน' end,
                what ||
                case when new.next_step <> '' then
                  case new.status when 'passed' then E'\nเริ่มงานถัดไปได้: ' || new.next_step
                                  else E'\nยังเริ่มไม่ได้: ' || new.next_step end
                else '' end ||
                case when new.result_note <> '' then E'\n“' || new.result_note || '”' else '' end ||
                coalesce(E'\nโดย ' || who, ''));
      elsif new.status = 'cancelled' and new.inspector_id is distinct from actor then
        insert into notifications(user_id, kind, project_id, item_id, title, body)
        values (new.inspector_id, 'request_cancelled', new.project_id, new.id, 'ยกเลิกนัดตรวจ',
                what || E'\nนัดเดิม ' || at_txt || coalesce(E'\nโดย ' || who, ''));
      elsif new.status = 'requested' and old.status = 'accepted' and new.scheduled_at is distinct from old.scheduled_at then
        null;  -- handled below as a move
      end if;
    end if;
    if tg_op = 'UPDATE' and new.scheduled_at is distinct from old.scheduled_at and new.status in ('requested','accepted') then
      insert into notifications(user_id, kind, project_id, item_id, title, body)
      select u, 'request_moved', new.project_id, new.id, 'เลื่อนนัดตรวจ',
             what || E'\nนัดใหม่ ' || at_txt || coalesce(E'\nโดย ' || who, '')
      from unnest(array[new.inspector_id, new.requested_by]) u
      where u is distinct from actor;
    end if;
  exception when others then
    raise warning 'queue_request_notifications skipped: %', sqlerrm;
  end;
  return null;
end $$;
create trigger inspection_requests_notify after insert or update on public.inspection_requests
  for each row execute function public.queue_request_notifications();

-- 07:00 Asia/Bangkok: each inspector gets today's appointments in one message
create function public.queue_inspection_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into notifications(user_id, kind, title, body)
  select r.inspector_id, 'request_today', 'นัดตรวจวันนี้ ' || count(*) || ' รายการ',
         string_agg(to_char(r.scheduled_at at time zone 'Asia/Bangkok', 'HH24:MI') || ' · ' || p.name || ' · ' || r.title
                    || case when r.loc <> '' then ' · ' || r.loc else '' end
                    || case when r.hold then ' (H)' else '' end, E'\n' order by r.scheduled_at)
  from inspection_requests r join projects p on p.id = r.project_id
  where r.status in ('requested','accepted')
    and (r.scheduled_at at time zone 'Asia/Bangkok')::date = (now() at time zone 'Asia/Bangkok')::date
  group by r.inspector_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.answer_inspection_request(text, text, text, text[], timestamptz),
  public.guard_inspection_request(), public.queue_request_notifications(), public.queue_inspection_reminders()
  from public, anon, authenticated;
grant execute on function public.answer_inspection_request(text, text, text, text[], timestamptz) to authenticated;

-- photos attached to a result are visible to the project like item photos
create or replace function public.photo_visible(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from inspection_items i
    where (i.before @> array[path] or i.after @> array[path]) and public.can_see_project(i.project_id))
  or exists (
    select 1 from inspection_requests r
    where r.result_photos @> array[path] and public.can_see_project(r.project_id));
$$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.inspection_requests;
  end if;
end $$;
do $$ begin
  perform cron.schedule('qc-inspection-today', '0 0 * * *', 'select public.queue_inspection_reminders()');  -- 07:00 Asia/Bangkok
exception when others then raise notice 'pg_cron not available: %', sqlerrm;
end $$;
