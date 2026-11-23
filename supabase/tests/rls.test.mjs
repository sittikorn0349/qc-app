// Runs the Phase 1 migration in PGlite (real Postgres compiled to WASM) with
// minimal stand-ins for Supabase's auth/storage schemas, then checks the
// ownership rules, every role's permissions, the item workflow and the
// offline conflict rules.
//
//   npm i @electric-sql/pglite
//   node supabase/tests/rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = process.env.MIG_DIR || join(here, '..', 'migrations');

const STUBS = `
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create schema storage; grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to authenticated;
`;

const U = {
  ceo: '00000000-0000-0000-0000-00000000000c',
  admin: '00000000-0000-0000-0000-00000000000a',
  pm: '00000000-0000-0000-0000-000000000001',
  foreman: '00000000-0000-0000-0000-000000000002',   // owner of i1
  foreman2: '00000000-0000-0000-0000-000000000005',
  headman: '00000000-0000-0000-0000-000000000003',
  viewer: '00000000-0000-0000-0000-000000000006',
  outsider: '00000000-0000-0000-0000-000000000009',
};

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); ${user ? 'set role authenticated;' : ''}`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const q = (sql, p) => db.query(sql, p);
async function fails(user, sql, p, msg) {
  let err = null;
  try { await as(user, () => q(sql, p)); } catch (e) { err = e; }
  ok(!!err, `${msg}${err ? ' → ' + err.message.split('\n')[0] : ' (did NOT fail)'}`);
}
const rows = async (user, sql, p) => (await as(user, () => q(sql, p))).rows;
const one = async (user, sql, p) => (await rows(user, sql, p))[0];
const item = (id) => one(null, `select * from inspection_items where id=$1`, [id]);

await db.exec(STUBS);
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
  console.log('applied', f);
}
for (const [k, id] of Object.entries(U)) {
  await q(`insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${k}@example.com`, { full_name: k.toUpperCase() }]);
}
await q(`update profiles set org_role='ceo' where id=$1`, [U.ceo]);
await q(`update profiles set org_role='admin' where id=$1`, [U.admin]);

console.log('\n[profiles]');
ok((await q(`select count(*)::int n from profiles`)).rows[0].n === 8, 'trigger created a profile per auth user');
await fails(U.pm, `update profiles set org_role='ceo' where id=$1`, [U.pm], 'staff cannot promote themselves');

console.log('\n[projects & members]');
await fails(U.pm, `insert into projects(id, name) values ('p1','Tower A')`, [], 'staff cannot create projects');
await fails(U.ceo, `insert into projects(id, name) values ('p1','Tower A')`, [], 'CEO is read-only');
await as(U.admin, () => q(`insert into projects(id, name) values ('p1','Tower A'),('p2','Mall B')`));
await as(U.admin, () => q(`insert into project_members(project_id, user_id, role) values ('p1',$1,'pm')`, [U.pm]));
await as(U.pm, () => q(`insert into project_members(project_id, user_id, role) values
  ('p1',$1,'foreman'),('p1',$2,'foreman'),('p1',$3,'headman'),('p1',$4,'viewer')`, [U.foreman, U.foreman2, U.headman, U.viewer]));
ok(true, 'admin creates projects; pm adds foremen, headman, viewer');
await fails(U.foreman, `insert into project_members(project_id, user_id, role) values ('p1',$1,'viewer')`, [U.outsider], 'foreman cannot add members');
ok((await rows(U.ceo, `select id from projects`)).length === 2, 'CEO sees all projects');
ok((await rows(U.outsider, `select id from projects`)).length === 0, 'outsider sees no projects');

console.log('\n[ownership: create & edit]');
await as(U.foreman, async () => {
  await q(`insert into inspections(id, project_id, docno) values ('i1','p1','QC-001')`);
  await q(`insert into inspection_items(id, inspection_id, ord, loc, chk, res) values
           ('a','i1',0,'C-3','ระยะหุ้มเหล็ก','fix'), ('b','i1',1,'B-2','ระดับคาน','ok'), ('c','i1',2,'S2','รอยร้าว','bad')`);
});
ok((await one(null, `select owner_id from inspections where id='i1'`)).owner_id === U.foreman, 'creator becomes owner');
await fails(U.headman, `insert into inspections(id, project_id) values ('ih','p1')`, [], 'headman cannot create documents');
await fails(U.viewer, `insert into inspections(id, project_id) values ('iv','p1')`, [], 'viewer cannot create documents');
await fails(U.foreman2, `insert into inspections(id, project_id, owner_id) values ('ix','p1',$1)`, [U.foreman], 'cannot create a document in someone else\'s name');
for (const u of ['foreman2', 'pm', 'headman', 'viewer', 'ceo']) {
  ok((await rows(U[u], `update inspections set summary='hack' where id='i1' returning id`)).length === 0, `${u} cannot edit owner's header`);
  ok((await rows(U[u], `update inspection_items set note='hack' where id='a' returning id`)).length === 0, `${u} cannot edit owner's items`);
}
await fails(U.foreman2, `insert into inspection_items(id, inspection_id, res) values ('x','i1','fix')`, [], 'non-owner cannot add items');
ok((await rows(U.foreman2, `delete from inspections where id='i1' returning id`)).length === 0, 'non-owner cannot delete document');
ok((await rows(U.foreman, `update inspections set summary='ok' where id='i1' returning rev`))[0].rev === 1, 'owner edits header (rev bumps)');
await fails(U.foreman, `update inspections set owner_id=$1 where id='i1'`, [U.foreman2], 'owner cannot give the document away directly');

console.log('\n[everyone in project sees, nobody outside]');
for (const u of ['pm', 'foreman2', 'headman', 'viewer', 'ceo', 'admin'])
  ok((await rows(U[u], `select id from inspection_items`)).length === 3, `${u} sees all items of i1`);
ok((await rows(U.outsider, `select id from inspections`)).length === 0, 'outsider sees nothing');

console.log('\n[assignment by owner only]');
await fails(U.foreman, `update inspection_items set assignee_id=$1 where id='a'`, [U.outsider], 'cannot assign to non-member');
await as(U.foreman, () => q(`update inspection_items set assignee_id=$1, due_date='2026-12-01' where id='a'`, [U.headman]));
ok((await item('a')).status === 'assigned', 'owner assigns → assigned');
ok((await rows(U.pm, `update inspection_items set assignee_id=$1 where id='c' returning id`, [U.headman])).length === 0, 'pm cannot assign on someone else\'s document');

console.log('\n[headman: report fixed, then recheck rules]');
ok((await rows(U.headman, `select * from my_tasks()`)).length === 1, 'my_tasks shows assigned item');
await fails(U.headman, `select report_fixed('c')`, [], 'cannot report fixed on unassigned item');
ok((await one(U.headman, `select report_fixed('a', array['p1/i1/after/h1.jpg'], 'แก้แล้ว') r`)).r === 'ok', 'headman reports fixed');
ok((await item('a')).status === 'fixed', 'status fixed (not closed)');
ok((await one(U.headman, `select report_fixed('a') r`)).r === 'already_fixed', 'reporting twice is harmless (offline retry)');

console.log('\n[recheck by any project member]');
await fails(U.ceo, `select recheck_item('a','ok')`, [], 'CEO (not a member) cannot recheck');
await fails(U.outsider, `select recheck_item('a','ok')`, [], 'outsider cannot recheck');
await fails(U.viewer, `select recheck_item('b','ok')`, [], 'items that passed first time need no recheck');
ok((await one(U.viewer, `select recheck_item('a','bad','ยังไม่ได้ระยะ', array['p1/i1/after/v1.jpg']) r`)).r === 'ok', 'viewer rechecks: fail');
let a = await item('a');
ok(a.status === 'rejected' && a.rres === 'bad' && a.rnote === 'ยังไม่ได้ระยะ' && a.rchk_by === U.viewer && a.after.length === 2, 'rejected, legacy rres=bad, who/photos recorded');
const seenBeforeFix = a.rchk_at;   // someone looked at the rejected item, then went offline
await as(U.headman, () => q(`select report_fixed('a', array['p1/i1/after/h2.jpg'])`));
ok((await item('a')).rchk_at.getTime() === seenBeforeFix.getTime(), 'report_fixed does not count as a recheck');
ok((await one(U.headman, `select recheck_item('a','ok','', '{}', $1) r`, [seenBeforeFix])).r === 'ok', 'headman may recheck (as chosen), using view from before the fix');
a = await item('a');
ok(a.status === 'approved' && a.rres === 'ok' && a.rchk_by === U.headman, 'approved by headman, recorded as headman');

console.log('\n[offline conflict: two rechecks of the same item]');
const seen = (await item('c')).rchk_at;  // null: never rechecked
ok((await one(U.pm, `select recheck_item('c','bad','PM: ไม่ผ่าน','{}',$1) r`, [seen])).r === 'ok', 'first recheck to reach server applies');
const late = await one(U.foreman2, `select recheck_item('c','ok','F2: ผ่าน','{}',$1) r`, [seen]);
ok(late.r === 'conflict', 'second recheck with stale view → conflict');
const c = await item('c');
ok(c.rres === 'bad' && c.rnote === 'PM: ไม่ผ่าน', 'late result did NOT overwrite');
const conf = await rows(U.foreman, `select actor, to_value, note from item_events where item_id='c' and kind='recheck_conflict'`);
ok(conf.length === 1 && conf[0].actor === U.foreman2 && conf[0].note === 'F2: ผ่าน', 'late result kept in history for review');
ok((await one(U.foreman2, `select recheck_item('c','ok','F2 อีกครั้ง','{}',$1) r`, [c.rchk_at])).r === 'ok', 'after seeing latest state, recheck applies');

console.log('\n[owner edits vs recheck on same item]');
await as(U.foreman, () => q(`update inspection_items set note='เพิ่มหมายเหตุ' where id='c'`));
const c2 = await item('c');
ok(c2.note === 'เพิ่มหมายเหตุ' && c2.rres === 'ok' && c2.rnote === 'F2 อีกครั้ง', 'owner note + other\'s recheck both survive');

console.log('\n[deleted item]');
await as(U.foreman, () => q(`insert into inspection_items(id, inspection_id, res) values ('d','i1','fix')`));
await as(U.foreman, () => q(`delete from inspection_items where id='d'`));
ok((await one(U.viewer, `select recheck_item('d','ok') r`)).r === 'gone', 'recheck of deleted item → gone');
ok((await rows(U.pm, `select kind from item_events where item_id='d' order by id`)).map(r => r.kind).join() === 'created,deleted', 'deletion kept in history');

console.log('\n[legacy form path for the owner]');
await as(U.foreman, () => q(`update inspection_items set rres='' where id='c'`));
ok((await item('c')).status === 'open', 'owner clears recheck → open');
await as(U.foreman, () => q(`update inspection_items set rres='ok' where id='c'`));
const c3 = await item('c');
ok(c3.status === 'approved' && c3.rchk_by === U.foreman, 'owner sets rres=ok in old form → approved, stamped');

console.log('\n[transfer by PM]');
await fails(U.foreman, `select transfer_inspection('i1',$1)`, [U.foreman2], 'owner (foreman) cannot transfer');
await fails(U.pm, `select transfer_inspection('i1',$1)`, [U.headman], 'cannot transfer to a headman');
await as(U.pm, () => q(`select transfer_inspection('i1',$1)`, [U.foreman2]));
ok((await rows(U.foreman, `update inspections set summary='x' where id='i1' returning id`)).length === 0, 'old owner can no longer edit');
ok((await rows(U.foreman2, `update inspections set summary='y' where id='i1' returning id`)).length === 1, 'new owner edits');
ok((await rows(U.viewer, `select kind from inspection_events where inspection_id='i1'`)).length === 1, 'transfer recorded');

console.log('\n[owner removed from project loses edit]');
await as(U.pm, () => q(`delete from project_members where project_id='p1' and user_id=$1`, [U.foreman2]));
ok((await rows(U.foreman2, `update inspections set summary='z' where id='i1' returning id`)).length === 0, 'removed owner cannot edit');
ok((await rows(U.foreman2, `select id from inspections`)).length === 0, 'removed owner cannot see');
await as(U.pm, () => q(`insert into project_members(project_id, user_id, role) values ('p1',$1,'foreman')`, [U.foreman2]));

console.log('\n[storage: uploader-keyed photos (migration 0002)]');
const up = (u, path) => as(u, () => q(`insert into storage.objects(bucket_id, name) values ('inspection-photos', $1) returning id`, [path]));
const fPath = `${U.foreman2}/f1.jpg`, hPath = `${U.headman}/h9.jpg`, loose = `${U.foreman2}/unused.jpg`;
ok((await up(U.foreman2, fPath)).rows.length === 1, 'user uploads into own folder');
ok((await up(U.headman, hPath)).rows.length === 1, 'headman uploads into own folder');
await as(U.foreman2, () => q(`insert into storage.objects(bucket_id, name) values ('inspection-photos',$1)`, [loose]));
await fails(U.headman, `insert into storage.objects(bucket_id, name) values ('inspection-photos',$1)`, [`${U.foreman2}/x.jpg`], 'cannot upload into someone else\'s folder');
await fails(U.outsider, `insert into storage.objects(bucket_id, name) values ('inspection-photos','p1/x.jpg')`, [], 'cannot upload outside own folder');
ok((await rows(U.viewer, `select name from storage.objects`)).length === 0, 'unreferenced photos are private to uploader');
await as(U.foreman2, () => q(`update inspection_items set before = array[$1] where id='a'`, [fPath]));
await as(U.headman, () => q(`update inspection_items set after = array[$1] where id='a' returning id`, [hPath])); // ignored: headman not owner
ok((await rows(U.headman, `select recheck_item('c','bad','', array[$1]::text[], (select rchk_at from inspection_items where id='c')) r`, [hPath]))[0].r === 'ok', 'headman attaches own photo through recheck');
const seenBy = async (u) => (await rows(u, `select name from storage.objects order by name`)).map(r => r.name);
ok((await seenBy(U.viewer)).join() === [fPath, hPath].sort().join(), 'member sees photos referenced by project items (not the unused one)');
ok((await seenBy(U.foreman2)).length === 3, 'uploader always sees own photos');
ok((await seenBy(U.outsider)).length === 0, 'outsider sees no photos');
ok((await rows(U.headman, `delete from storage.objects where name=$1 returning id`, [fPath])).length === 0, 'cannot delete someone else\'s photo');
ok((await rows(U.foreman2, `delete from storage.objects where name=$1 returning id`, [loose])).length === 1, 'can delete own photo');

console.log('\n[folders & my_projects (migration 0002)]');
await as(U.foreman2, () => q(`insert into folders(id, name) values ('f1','Tower A ชั้น 1-5')`));
ok((await rows(U.foreman2, `select id from folders`)).length === 1, 'owner sees own folder');
ok((await rows(U.pm, `select id from folders`)).length === 0, 'folders are private');
await fails(U.pm, `insert into folders(id, name, owner_id) values ('f2','x',$1)`, [U.foreman2], 'cannot create folder for someone else');
const mp = await rows(U.headman, `select * from my_projects()`);
ok(mp.length === 1 && mp[0].id === 'p1' && mp[0].role === 'headman', 'my_projects returns membership with role');
ok((await rows(U.outsider, `select * from my_projects()`)).length === 0, 'outsider has no projects');

console.log('\n[LINE notifications (migration 0003)]');
const notes = async () => (await q(`select user_id, kind, title, body from notifications order by id`)).rows;
const before = (await notes()).length;
await as(U.foreman, async () => {
  await q(`insert into inspections(id, project_id, docno) values ('n1','p1','QC-N1')`);
  await q(`insert into inspection_items(id, inspection_id, ord, loc, chk, res, assignee_id, due_date) values ('n1.a','n1',0,'เสา C-1','ระยะหุ้ม','fix',$1,'2026-01-05')`, [U.headman]);
  await q(`insert into inspection_items(id, inspection_id, ord, loc, res) values ('n1.b','n1',1,'คาน','ok')`);
});
let N = (await notes()).slice(before);
ok(N.length === 1 && N[0].user_id === U.headman && N[0].kind === 'assign', 'assigning (on insert) notifies the assignee only');
ok(/Tower A · QC-N1/.test(N[0].body) && /เสา C-1 · ระยะหุ้ม/.test(N[0].body) && /05\/01\/2026/.test(N[0].body) && /โดย FOREMAN/.test(N[0].body), 'message names project, document, item, due date and who: ' + JSON.stringify(N[0].body));
await as(U.foreman, () => q(`update inspection_items set note='x' where id='n1.a'`));
ok((await notes()).length === before + 1, 'editing other fields sends nothing');
await as(U.headman, () => q(`select report_fixed('n1.a', '{}', 'เสร็จแล้วครับ')`));
N = (await notes()).slice(before);
ok(N.length === 2 && N[1].user_id === U.foreman && N[1].kind === 'fixed' && /เสร็จแล้วครับ/.test(N[1].body) && /โดย HEADMAN/.test(N[1].body), 'headman "แจ้งแก้แล้ว" notifies the document owner');
await as(U.pm, () => q(`select recheck_item('n1.a','bad','ยังไม่ได้', '{}', (select rchk_at from inspection_items where id='n1.a'))`));
N = (await notes()).slice(before);
ok(N.length === 3 && N[2].user_id === U.headman && N[2].kind === 'rejected' && /ยังไม่ได้/.test(N[2].body), 'failed recheck notifies the assignee');
await as(U.headman, () => q(`select report_fixed('n1.a', '{}', '')`));
await as(U.headman, () => q(`select recheck_item('n1.a','ok','', '{}', (select rchk_at from inspection_items where id='n1.a'))`));
N = (await notes()).slice(before);
ok(!N.slice(3).some(n => n.user_id === U.headman && n.kind === 'approved'), 'no message about your own recheck');
await as(U.foreman, () => q(`update inspection_items set assignee_id=$1 where id='n1.a'`, [U.foreman]));
ok(!(await notes()).slice(before).some(n => n.kind === 'assign' && n.user_id === U.foreman), 'assigning to yourself sends nothing');
await as(U.foreman, async () => {
  await q(`insert into inspection_items(id, inspection_id, ord, loc, res, assignee_id, due_date) values ('n1.c','n1',2,'พื้น','bad',$1,'2020-01-01'),('n1.d','n1',3,'ผนัง','fix',$1,'2020-01-02')`, [U.headman]);
});
const dg = (await q(`select queue_overdue_digest() n`)).rows[0].n;
const D = (await notes()).filter(n => n.kind === 'overdue');
ok(dg === 1 && D.length === 1 && D[0].user_id === U.headman && /เลยกำหนด 2 รายการ/.test(D[0].title) && /พื้น/.test(D[0].body) && /ผนัง/.test(D[0].body), 'morning digest: one message per person listing overdue items');

console.log('\n[LINE linking + privacy]');
ok((await rows(U.headman, `select * from notifications`)).every(n => n.user_id === U.headman), 'people only read their own notifications');
await fails(U.headman, `insert into notifications(user_id, kind, title) values ($1,'assign','x')`, [U.pm], 'app cannot write notifications');
const st = await one(U.headman, `select line_link_start() s`);
ok(/^\d{6}$/.test(st.s.code) && st.s.linked === false, 'app gets a 6-digit link code');
ok((await one(null, `select line_link_complete($1, 'Uabc') n`, [st.s.code])).n === 'HEADMAN', 'LINE webhook completes linking with the code');
ok((await one(null, `select line_link_complete($1, 'Uzzz') n`, [st.s.code])).n === null, 'a code works only once');
ok((await one(U.headman, `select line_status() s`)).s.linked === true, 'app sees "linked"');
await fails(U.pm, `select line_user_id from profiles where id=$1`, [U.headman], 'teammates cannot read LINE ids');
await fails(U.pm, `update profiles set line_user_id='Uhack' where id=$1`, [U.pm], 'LINE id cannot be set from the app');
ok((await rows(U.pm, `select display_name from profiles where id=$1`, [U.headman])).length === 1, 'teammates still see names');
await fails(U.headman, `select * from claim_notifications(10)`, [], 'app cannot claim the send queue');
const cl = (await q(`select * from claim_notifications(100)`)).rows;
ok(cl.length >= 6 && cl.filter(r => r.user_id === U.headman).every(r => r.line_user_id === 'Uabc'), 'sender gets the batch with LINE ids');
ok((await q(`select * from claim_notifications(100)`)).rows.length === 0, 'claimed rows are not handed out twice');
await q(`select finish_notifications($1::bigint[], null)`, [cl.map(r => r.id)]);
ok((await q(`select count(*)::int n from notifications where sent_at is null`)).rows[0].n === 0, 'finished rows marked sent');
await as(U.headman, () => q(`select line_unlink()`));
ok((await one(U.headman, `select line_status() s`)).s.linked === false, 'unlink works');

console.log('\n[inspection requests (migration 0004)]');
const nb = (await q(`select count(*)::int n from notifications`)).rows[0].n;
const tomorrow = new Date(Date.now() + 86400000).toISOString();
const mkReq = (u, extra = '') => as(u, () => q(`insert into inspection_requests(project_id, title, loc, inspector_id, scheduled_at, next_step, inspection_id${extra ? ', note' : ''})
   values ('p1','ตรวจเหล็กเสริม คาน-พื้น','ชั้น 3 โซน A',$1,$2,'เทคอนกรีตพื้นชั้น 3','n1'${extra ? `, '${extra}'` : ''}) returning id, status`, [U.pm, tomorrow]));
const r1 = (await mkReq(U.foreman)).rows[0];
ok(r1.status === 'requested', 'foreman creates a request (status requested)');
await fails(U.headman, `insert into inspection_requests(project_id, title, inspector_id, scheduled_at) values ('p1','x',$1,$2)`, [U.pm, tomorrow], 'headman cannot request');
await fails(U.foreman, `insert into inspection_requests(project_id, title, inspector_id, scheduled_at) values ('p1','x',$1,$2)`, [U.outsider, tomorrow], 'inspector must be a project member');
await fails(U.foreman, `insert into inspection_requests(project_id, title, inspector_id, scheduled_at) values ('p1','x',$1,$2)`, [U.foreman, tomorrow], 'cannot pick yourself as inspector');
await fails(U.foreman, `insert into inspection_requests(project_id, title, inspector_id, scheduled_at, requested_by) values ('p1','x',$1,$2,$3)`, [U.pm, tomorrow, U.foreman2], 'cannot request in someone else\'s name');
await fails(U.foreman, `insert into inspection_requests(project_id, title, inspector_id, scheduled_at) values ('p2','x',$1,$2)`, [U.pm, tomorrow], 'cannot request in another project');
ok((await rows(U.outsider, `select id from inspection_requests`)).length === 0, 'outsider sees no requests');
ok((await rows(U.viewer, `select id from inspection_requests`)).length === 1, 'project members see requests');
await fails(U.foreman, `update inspection_requests set status='passed' where id=$1`, [r1.id], 'no direct updates (must use the function)');
let N2 = (await notes()).slice(nb);
ok(N2.length === 1 && N2[0].user_id === U.pm && N2[0].kind === 'request' && /ตรวจเหล็กเสริม คาน-พื้น · ชั้น 3 โซน A/.test(N2[0].body) && /เทคอนกรีตพื้นชั้น 3/.test(N2[0].body) && /จุดหยุดตรวจ/.test(N2[0].title), 'inspector notified with work, place, time and next step');
await fails(U.foreman2, `select answer_inspection_request($1,'pass')`, [r1.id], 'someone else cannot record the result');
await fails(U.foreman, `select answer_inspection_request($1,'pass')`, [r1.id], 'requester cannot pass their own request');
ok((await one(U.pm, `select answer_inspection_request($1,'accept') r`, [r1.id])).r === 'ok', 'inspector accepts');
const later = new Date(Date.now() + 2 * 86400000).toISOString();
ok((await one(U.foreman, `select answer_inspection_request($1,'reschedule','', '{}', $2) r`, [r1.id, later])).r === 'ok', 'requester reschedules');
ok((await one(null, `select status from inspection_requests where id=$1`, [r1.id])).status === 'requested', 'moved request goes back to "requested"');
ok((await one(U.pm, `select answer_inspection_request($1,'fail','ระยะหุ้มไม่พอ 2 จุด') r`, [r1.id])).r === 'ok', 'inspector records fail');
ok((await one(U.pm, `select answer_inspection_request($1,'fail') r`, [r1.id])).r === 'already', 'double tap answers "already"');
ok((await one(U.pm, `select answer_inspection_request($1,'pass') r`, [r1.id])).r === 'closed', 'closed request cannot change');
N2 = (await notes()).slice(nb);
ok(N2.some(n => n.kind === 'request_accepted' && n.user_id === U.foreman), 'requester told it was accepted');
ok(N2.filter(n => n.kind === 'request_moved').map(n => n.user_id).join() === U.pm, 'reschedule tells the other party only');
const res = N2.find(n => n.kind === 'request_result');
ok(res && res.user_id === U.foreman && res.title === 'ตรวจไม่ผ่าน' && /ยังเริ่มไม่ได้: เทคอนกรีตพื้นชั้น 3/.test(res.body) && /ระยะหุ้มไม่พอ/.test(res.body), 'fail result tells the requester the next step is still blocked');
const r2 = (await mkReq(U.foreman, 'แก้แล้ว ขอตรวจใหม่')).rows[0];
await as(U.pm, () => q(`select answer_inspection_request($1,'pass','ผ่าน', array[$2]::text[])`, [r2.id, `${U.pm}/res1.jpg`]));
N2 = (await notes()).slice(nb);
ok(N2.some(n => n.kind === 'request_result' && n.title === 'ตรวจผ่าน' && /เริ่มงานถัดไปได้: เทคอนกรีตพื้นชั้น 3/.test(n.body)), 'pass result unlocks the next step');
await as(U.pm, () => q(`insert into storage.objects(bucket_id, name) values ('inspection-photos', $1)`, [`${U.pm}/res1.jpg`]));
ok((await rows(U.viewer, `select name from storage.objects where name=$1`, [`${U.pm}/res1.jpg`])).length === 1, 'result photos visible to the project');
const r3 = (await mkReq(U.foreman)).rows[0];
await fails(U.foreman2, `select answer_inspection_request($1,'cancel')`, [r3.id], 'others cannot cancel');
ok((await one(U.foreman, `select answer_inspection_request($1,'cancel') r`, [r3.id])).r === 'ok', 'requester cancels');
ok((await notes()).slice(nb).some(n => n.kind === 'request_cancelled' && n.user_id === U.pm), 'inspector told about the cancellation');
await as(U.foreman, () => q(`insert into inspection_requests(project_id, title, inspector_id, scheduled_at) values ('p1','ตรวจแบบหล่อ',$1, now())`, [U.pm]));
ok((await q(`select queue_inspection_reminders() n`)).rows[0].n === 1 && (await notes()).some(n => n.kind === 'request_today' && n.user_id === U.pm && /ตรวจแบบหล่อ/.test(n.body)), 'morning reminder lists today\'s appointments');

console.log('\n[005 form documents, team templates, project zones]');
await as(U.foreman, () => q(`insert into form_docs(id, project_id, form_id, title, data) values ('fd1','p1','daily','รายงานประจำวัน','{"v":1}')`));
ok((await rows(U.viewer, `select id from form_docs where id='fd1'`)).length === 1, 'project member sees the document');
ok((await rows(U.outsider, `select id from form_docs where id='fd1'`)).length === 0, 'outsider does not');
ok((await rows(U.foreman2, `update form_docs set title='x' where id='fd1' returning id`)).length === 0, 'another member cannot change it');
await fails(U.outsider, `insert into form_docs(id, project_id, data) values ('fd2','p1','{}')`, [], 'outsider cannot add to the project');
await fails(U.foreman, `insert into form_docs(id, project_id, owner_id, data) values ('fd3','p1',$1,'{}')`, [U.foreman2], 'cannot write as someone else');
ok((await one(U.foreman, `update form_docs set deleted_at=now() where id='fd1' returning id`)).id === 'fd1', 'owner soft-deletes');
await as(U.foreman, () => q(`insert into form_templates(id, project_id, name, data) values ('ft1','p1','ตรวจกันซึมของทีม','{"widgets":[]}')`));
ok((await rows(U.headman, `select id from form_templates where id='ft1'`)).length === 1, 'team sees the template');
ok((await rows(U.pm, `update form_templates set name='ตรวจกันซึม v2' where id='ft1' returning id`)).length === 1, 'PM can edit a team template');
ok((await rows(U.headman, `update form_templates set name='x' where id='ft1' returning id`)).length === 0, 'headman cannot');
ok((await one(U.pm, `select set_project_zones('p1', array['ชั้น 1',' ชั้น 2 ','','ชั้น 1']) z`)).z.length === 2, 'PM sets zones (trimmed, unique)');
await fails(U.headman, `select set_project_zones('p1', array['x'])`, [], 'headman cannot set zones');
ok((await rows(U.viewer, `select zones from my_projects() where id='p1'`))[0].zones.length === 2, 'my_projects returns the zones');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
