// Runs the Phase 1 migration in PGlite (real Postgres compiled to WASM) with
// minimal stand-ins for Supabase's auth/storage schemas, then checks every
// role's permissions and the item workflow.
//
//   npm i @electric-sql/pglite
//   node supabase/tests/rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'migrations');

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
  foreman: '00000000-0000-0000-0000-000000000002',
  headman: '00000000-0000-0000-0000-000000000003',
  headman2: '00000000-0000-0000-0000-000000000004',
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
async function rows(user, sql, p) { return (await as(user, () => q(sql, p))).rows; }

await db.exec(STUBS);
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
  console.log('applied', f);
}

// seed users (profiles created by trigger)
for (const [k, id] of Object.entries(U)) {
  await q(`insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${k}@example.com`, { full_name: k.toUpperCase() }]);
}
await q(`update profiles set org_role='ceo' where id=$1`, [U.ceo]);     // SQL editor (no uid) may set roles
await q(`update profiles set org_role='admin' where id=$1`, [U.admin]);

console.log('\n[profiles]');
ok((await q(`select count(*)::int n from profiles`)).rows[0].n === 7, 'trigger created a profile per auth user');
await fails(U.pm, `update profiles set org_role='ceo' where id=$1`, [U.pm], 'staff cannot promote themselves');
ok((await rows(U.pm, `update profiles set display_name='PM Somchai' where id=$1 returning id`, [U.pm])).length === 1, 'user can rename self');

console.log('\n[projects & members]');
await fails(U.pm, `insert into projects(id, name) values ('p1','Tower A')`, [], 'staff cannot create projects');
await fails(U.ceo, `insert into projects(id, name) values ('p1','Tower A')`, [], 'CEO is read-only (cannot create projects)');
ok((await rows(U.admin, `insert into projects(id, name, site) values ('p1','Tower A','Bangna') returning id`)).length === 1, 'admin creates project');
await as(U.admin, () => q(`insert into projects(id, name) values ('p2','Mall B')`));
await as(U.admin, () => q(`insert into project_members(project_id, user_id, role) values ('p1',$1,'pm')`, [U.pm]));
await as(U.pm, () => q(`insert into project_members(project_id, user_id, role) values ('p1',$1,'foreman'),('p1',$2,'headman'),('p1',$3,'headman')`, [U.foreman, U.headman, U.headman2]));
ok(true, 'pm adds foreman + headmen to own project');
await fails(U.foreman, `insert into project_members(project_id, user_id, role) values ('p1',$1,'viewer')`, [U.outsider], 'foreman cannot add members');
await fails(U.pm, `insert into project_members(project_id, user_id, role) values ('p2',$1,'foreman')`, [U.pm], 'pm cannot add members to a project they are not in');
ok((await rows(U.ceo, `select id from projects`)).length === 2, 'CEO sees all projects');
ok((await rows(U.pm, `select id from projects`)).length === 1, 'PM sees only own project');
ok((await rows(U.outsider, `select id from projects`)).length === 0, 'outsider sees no projects');

console.log('\n[inspections & items by foreman]');
await as(U.foreman, async () => {
  await q(`insert into inspections(id, project_id, docno, meta) values ('i1','p1','QC-001','{"project":"Tower A"}')`);
  await q(`insert into inspection_items(id, inspection_id, ord, loc, chk, res) values
           ('a','i1',0,'C-3 ชั้น 1','ระยะหุ้มเหล็ก','fix'),
           ('b','i1',1,'B-2','ระดับคาน','ok'),
           ('c','i1',2,'Slab 2','รอยร้าว','bad')`);
});
let it = await rows(U.foreman, `select id, project_id, status from inspection_items order by ord`);
ok(it[0].project_id === 'p1', 'item.project_id copied from inspection by trigger');
ok(it[0].status === 'open' && it[1].status === null && it[2].status === 'open', 'status derived: fix/bad → open, ok → none');
await fails(U.foreman, `insert into inspections(id, project_id) values ('i9','p2')`, [], 'foreman cannot write into another project');
await fails(U.headman, `insert into inspections(id, project_id) values ('i8','p1')`, [], 'headman cannot create inspections');

await as(U.foreman, () => q(`update inspection_items set assignee_id=$1, due_date='2026-12-01' where id='a'`, [U.headman]));
await as(U.foreman, () => q(`update inspection_items set assignee_id=$1 where id='c'`, [U.headman2]));
it = await rows(U.foreman, `select status from inspection_items where id='a'`);
ok(it[0].status === 'assigned', 'assigning moves open → assigned');
const ev = await rows(U.foreman, `select kind from item_events where item_id='a' order by id`);
ok(ev.map(e => e.kind).join(',') === 'created,status,assign,due', 'audit trail recorded created/status/assign/due');

console.log('\n[headman view]');
ok((await rows(U.headman, `select id from inspections`)).length === 0, 'headman cannot read whole inspections');
ok((await rows(U.headman, `select id from inspection_items`)).map(r => r.id).join() === 'a', 'headman sees only their assigned item');
const tasks = await rows(U.headman, `select * from my_tasks()`);
ok(tasks.length === 1 && tasks[0].project_name === 'Tower A' && tasks[0].docno === 'QC-001', 'my_tasks() returns item with project + doc context');
ok((await rows(U.headman, `update inspection_items set status='approved' where id='a' returning id`)).length === 0, 'headman direct UPDATE affects nothing');
await fails(U.headman, `select review_item('a', true)`, [], 'headman cannot approve');
await fails(U.headman, `select report_fixed('c')`, [], 'headman cannot report someone else\'s item');
await as(U.headman, () => q(`select report_fixed('a', array['p1/i1/after/a1.jpg'], 'แก้ระยะหุ้มแล้ว')`));
it = await rows(U.foreman, `select status, after, fixed_note, fixed_at, rres from inspection_items where id='a'`);
ok(it[0].status === 'fixed' && it[0].after[0] === 'p1/i1/after/a1.jpg' && it[0].fixed_note === 'แก้ระยะหุ้มแล้ว' && it[0].fixed_at, 'report_fixed sets fixed + appends after photo + note');
await fails(U.headman, `select report_fixed('a')`, [], 'cannot report fixed twice');

console.log('\n[review by foreman]');
await as(U.foreman, () => q(`select review_item('a', false, 'ยังไม่ได้ระยะ')`));
it = await rows(U.foreman, `select status, rres, rnote from inspection_items where id='a'`);
ok(it[0].status === 'rejected' && it[0].rres === 'bad' && it[0].rnote === 'ยังไม่ได้ระยะ', 'reject → status rejected, legacy rres=bad');
ok((await rows(U.headman, `select * from my_tasks()`)).length === 1, 'rejected item is back on headman list');
await as(U.headman, () => q(`select report_fixed('a', array['p1/i1/after/a2.jpg'])`));
await as(U.foreman, () => q(`select review_item('a', true)`));
it = await rows(U.foreman, `select status, rres, rdate, after from inspection_items where id='a'`);
ok(it[0].status === 'approved' && it[0].rres === 'ok' && /^\d{4}-\d{2}-\d{2}$/.test(it[0].rdate) && it[0].after.length === 2, 'approve → approved, rres=ok, rdate set, both after photos kept');
ok((await rows(U.headman, `select * from my_tasks()`)).length === 0, 'approved item leaves headman list');

console.log('\n[legacy form compatibility]');
await as(U.foreman, () => q(`update inspection_items set rres='ok' where id='c'`));
ok((await rows(U.foreman, `select status from inspection_items where id='c'`))[0].status === 'approved', 'old form setting rres=ok → approved');
await as(U.foreman, () => q(`update inspection_items set rres='' where id='c'`));
ok((await rows(U.foreman, `select status from inspection_items where id='c'`))[0].status === 'assigned', 'clearing rres → back to assigned');
await as(U.foreman, () => q(`update inspection_items set res='ok' where id='c'`));
ok((await rows(U.foreman, `select status from inspection_items where id='c'`))[0].status === null, 'changing result to ok removes it from workflow');
const rev = await rows(U.foreman, `update inspections set summary='x' where id='i1' returning rev`);
ok(rev[0].rev === 1, 'inspection rev increments on update');
await fails(U.foreman, `update inspections set project_id='p2' where id='i1'`, [], 'inspection cannot move project');

console.log('\n[viewer / CEO / outsider]');
await as(U.pm, () => q(`insert into project_members(project_id, user_id, role) values ('p1',$1,'viewer')`, [U.outsider]));
ok((await rows(U.outsider, `select id from inspections`)).length === 1, 'viewer reads inspections');
await fails(U.outsider, `insert into inspection_items(id, inspection_id) values ('z','i1')`, [], 'viewer cannot write items');
ok((await rows(U.ceo, `select id from inspection_items`)).length === 3, 'CEO reads all items');
ok((await rows(U.ceo, `update inspection_items set note='x' returning id`)).length === 0, 'CEO cannot edit items');
await as(U.pm, () => q(`delete from project_members where project_id='p1' and user_id=$1`, [U.outsider]));
ok((await rows(U.outsider, `select id from inspection_items`)).length === 0, 'removed member loses access immediately');

console.log('\n[storage policies]');
const ins = (u, path) => as(u, () => q(`insert into storage.objects(bucket_id, name) values ('inspection-photos', $1) returning id`, [path]));
await as(U.foreman, () => q(`insert into inspection_items(id, inspection_id, res, assignee_id) values ('d','i1','fix',$1)`, [U.headman]));
ok((await ins(U.foreman, 'p1/i1/before/f1.jpg')).rows.length === 1, 'foreman uploads before photo');
ok((await ins(U.headman, 'p1/i1/after/h1.jpg')).rows.length === 1, 'assigned headman uploads after photo');
await fails(U.headman, `insert into storage.objects(bucket_id, name) values ('inspection-photos','p1/i1/before/h2.jpg')`, [], 'headman cannot upload into before/');
await fails(U.headman2, `insert into storage.objects(bucket_id, name) values ('inspection-photos','p1/i1/after/h3.jpg')`, [], 'headman with no open item in that inspection cannot upload');
ok((await rows(U.headman, `select name from storage.objects`)).length === 2, 'headman can view photos of inspection they work on');
ok((await rows(U.outsider, `select name from storage.objects`)).length === 0, 'outsider sees no photos');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
