// Offline test (stubs fetch + Deno.serve):  echo {"nodeModulesDir":"auto"} > deno.json; deno run --allow-all test.ts file://$PWD/index.ts
// Harness: stub Deno.serve + fetch, import the function, drive both paths.
let handler: (r: Request) => Promise<Response>;
(Deno as any).serve = (h: any) => { handler = h; };
const calls: any[] = [];
const queue = [
  { id: 1, user_id: 'u1', line_user_id: 'Uaaa', title: 'มีงานแก้มอบหมายให้คุณ', body: 'Tower A · QC-1\nเสา C-1', created_at: '' },
  { id: 2, user_id: 'u1', line_user_id: 'Uaaa', title: 'ตรวจซ้ำยังไม่ผ่าน', body: 'Tower A · QC-1\nคาน', created_at: '' },
  { id: 3, user_id: 'u2', line_user_id: null, title: 'x', body: '', created_at: '' },
  { id: 4, user_id: 'u3', line_user_id: 'Ubad', title: 'y', body: '', created_at: '' },
];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const body = init?.body ? JSON.parse(init.body) : (input.body ? await new Response(input.body).json() : null);
  calls.push({ url, body });
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/rpc/claim_notifications')) return J(calls.filter(c => c.url.includes('claim')).length === 1 ? queue : []);
  if (url.includes('/rpc/finish_notifications')) return J(null);
  if (url.includes('/rpc/line_link_complete')) return J(body.p_code === '123456' ? 'HEADMAN' : null);
  if (url.includes('/app_settings')) return J({ value: 'https://example.test/app' });
  if (url.includes('api.line.me')) return body.to === 'Ubad' ? new Response('blocked', { status: 400 }) : J({});
  return J({ unexpected: url }, 500);
}) as any;
Deno.env.set('SUPABASE_URL', 'https://x.supabase.co'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc');
Deno.env.set('LINE_CHANNEL_ACCESS_TOKEN', 'tok'); Deno.env.set('LINE_CHANNEL_SECRET', 'sec');
await import(Deno.args[0]);
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m); };

const r1 = await (await handler!(new Request('http://f', { method: 'POST', body: '{}' }))).json();
const pushes = calls.filter(c => c.url.endsWith('/push'));
ok(pushes.length === 2, 'one push per LINE user (2 users with LINE)');
const p1 = pushes.find(p => p.body.to === 'Uaaa');
ok(!!p1 && /มีงานแก้มอบหมายให้คุณ/.test(p1.body.messages[0].text) && /ตรวจซ้ำยังไม่ผ่าน/.test(p1.body.messages[0].text) && /เปิดแอป: https:\/\/example.test\/app/.test(p1.body.messages[0].text), 'two notifications combined into one message with app link');
const fin = calls.filter(c => c.url.includes('finish_notifications')).map(c => c.body);
ok(fin.some(b => b.p_ids.join() === '3' && b.p_error === 'no_line'), 'person without LINE marked no_line');
ok(fin.some(b => b.p_ids.join() === '1,2' && b.p_error === null), 'sent rows finished');
ok(fin.some(b => b.p_ids.join() === '4' && /^line_400/.test(b.p_error)), 'LINE error recorded for retry');
ok(r1.sent === 2 && r1.skipped_no_line === 1, 'summary ' + JSON.stringify(r1));

async function sign(body: string, secret = 'sec') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))));
}
const ev = (text: string) => JSON.stringify({ events: [{ type: 'message', replyToken: 'rt', source: { userId: 'Uline' }, message: { type: 'text', text } }] });
const n0 = calls.length;
const bad = await handler!(new Request('http://f', { method: 'POST', body: ev('123456'), headers: { 'x-line-signature': await sign(ev('123456'), 'wrong') } }));
ok(bad.status === 401 && !calls.slice(n0).some(c => c.url.includes('line_link_complete')), 'forged webhook rejected');
let b = ev('รหัส 123456');
await handler!(new Request('http://f', { method: 'POST', body: b, headers: { 'x-line-signature': await sign(b) } }));
const link = calls.slice(n0).find(c => c.url.includes('line_link_complete'));
ok(link?.body.p_code === '123456' && link?.body.p_line_user === 'Uline', 'code + LINE userId passed to line_link_complete');
const rep = calls.slice(n0).filter(c => c.url.endsWith('/reply')).pop();
ok(/เชื่อมบัญชี HEADMAN แล้ว/.test(rep?.body.messages[0].text), 'user gets a confirmation reply');
b = ev('999999'); const n1 = calls.length;
await handler!(new Request('http://f', { method: 'POST', body: b, headers: { 'x-line-signature': await sign(b) } }));
ok(/หมดอายุ/.test(calls.slice(n1).filter(c => c.url.endsWith('/reply')).pop()?.body.messages[0].text), 'wrong code explained');
const r2 = await (await handler!(new Request('http://f', { method: 'POST', body: '{}' }))).json();
ok(r2.sent === 0, 'empty queue sends nothing');
console.log(`\n${pass} passed, ${fail} failed`); Deno.exit(fail ? 1 : 0);
