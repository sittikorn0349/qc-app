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

console.log('\n[storage]');
const up = (u, path) => as(u, () => q(`insert into storage.objects(bucket_id, name) values ('inspection-photos', $1) returning id`, [path]));
ok((await up(U.foreman2, 'p1/i1/before/f1.jpg')).rows.length === 1, 'owner uploads before photo');
ok((await up(U.headman, 'p1/i1/after/h9.jpg')).rows.length === 1, 'member uploads after photo');
await fails(U.headman, `insert into storage.objects(bucket_id, name) values ('inspection-photos','p1/i1/before/x.jpg')`, [], 'non-owner cannot upload before photo');
await fails(U.headman, `insert into storage.objects(bucket_id, name) values ('inspection-photos','p2/i1/after/x.jpg')`, [], 'path must match the document\'s project');
await fails(U.outsider, `insert into storage.objects(bucket_id, name) values ('inspection-photos','p1/i1/after/x.jpg')`, [], 'outsider cannot upload');
ok((await rows(U.viewer, `select id from storage.objects`)).length === 2, 'member views photos');
ok((await rows(U.outsider, `select id from storage.objects`)).length === 0, 'outsider sees no photos');
ok((await rows(U.headman, `delete from storage.objects returning id`)).length === 0, 'non-owner cannot delete photos');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
