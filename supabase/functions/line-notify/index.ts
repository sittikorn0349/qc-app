// QC App · Edge Function "line-notify"
//
// Two jobs on one URL (deploy with "Verify JWT" OFF):
//  1. LINE webhook (request has x-line-signature): someone sends the 6-digit code from the app
//     to the LINE OA → link their LINE account (line_link_complete). Signature is checked with
//     LINE_CHANNEL_SECRET; unsigned/invalid requests are ignored.
//  2. Anything else = "send what is queued": claims unsent rows from public.notifications and
//     pushes them, one LINE message per person per run (keeps the monthly message quota low).
//     It only ever sends what the database queued, so being callable without a token is harmless.
//
// Secrets (Supabase → Edge Functions → Secrets): LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET.
// SUPABASE_URL and the service key are provided by Supabase automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? '';
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

async function validSignature(body: string, sig: string): Promise<boolean> {
  if (!SECRET || !sig) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function line(path: string, payload: unknown): Promise<string | null> {
  if (!TOKEN) return 'no_token';
  const r = await fetch('https://api.line.me/v2/bot/message/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(payload),
  });
  return r.ok ? null : `line_${r.status}: ${(await r.text()).slice(0, 300)}`;
}
const reply = (token: string, text: string) => line('reply', { replyToken: token, messages: [{ type: 'text', text }] });

async function appUrl(): Promise<string> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'app_url').maybeSingle();
  return data?.value ?? '';
}

async function handleWebhook(body: string) {
  const events = (JSON.parse(body).events ?? []) as any[];
  for (const ev of events) {
    const uid = ev.source?.userId;
    if (ev.type === 'follow' && ev.replyToken) {
      await reply(ev.replyToken, 'สวัสดีครับ นี่คือบอทแจ้งเตือนของ QC App\nเชื่อมบัญชี: เปิดแอป › ปุ่มสถานะมุมล่างซ้าย › "เชื่อม LINE รับแจ้งเตือน" แล้วส่งรหัส 6 หลักมาในแชทนี้');
    } else if (ev.type === 'message' && ev.message?.type === 'text' && uid && ev.replyToken) {
      const m = /(\d{6})/.exec(ev.message.text ?? '');
      if (!m) { await reply(ev.replyToken, 'ส่งรหัส 6 หลักจากแอปเพื่อเชื่อมบัญชี (รหัสใช้ได้ 15 นาที)'); continue; }
      const { data, error } = await db.rpc('line_link_complete', { p_code: m[1], p_line_user: uid });
      await reply(ev.replyToken, error ? 'เชื่อมบัญชีไม่สำเร็จ ลองใหม่อีกครั้ง'
        : data ? `เชื่อมบัญชี ${data} แล้ว ✓\nต่อไปจะได้รับแจ้งเตือนงานแก้และผลตรวจซ้ำที่นี่`
        : 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว ขอรหัสใหม่ในแอปแล้วส่งมาอีกครั้ง');
    }
  }
}

async function flush() {
  const { data: rows, error } = await db.rpc('claim_notifications', { p_limit: 200 });
  if (error) return { error: error.message };
  if (!rows?.length) return { sent: 0 };
  const link = await appUrl();
  const byLine = new Map<string, any[]>(), noLine: number[] = [];
  for (const r of rows as any[]) {
    if (!r.line_user_id) { noLine.push(r.id); continue; }
    (byLine.get(r.line_user_id) ?? byLine.set(r.line_user_id, []).get(r.line_user_id)!).push(r);
  }
  if (noLine.length) await db.rpc('finish_notifications', { p_ids: noLine, p_error: 'no_line' });
  let sent = 0;
  for (const [to, list] of byLine) {
    const parts = list.map((r) => `🔔 ${r.title}\n${r.body}`);
    let text = parts.join('\n\n— — —\n\n');
    if (link) text += `\n\nเปิดแอป: ${link}`;
    if (text.length > 4900) text = text.slice(0, 4850) + '\n…(ดูต่อในแอป)';
    const err = await line('push', { to, messages: [{ type: 'text', text }] });
    await db.rpc('finish_notifications', { p_ids: list.map((r) => r.id), p_error: err });
    if (!err) sent += list.length;
  }
  return { sent, skipped_no_line: noLine.length };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const body = await req.text();
  const sig = req.headers.get('x-line-signature');
  if (sig !== null) {
    if (!(await validSignature(body, sig))) return json({ error: 'bad signature' }, 401);
    try { await handleWebhook(body); } catch (e) { console.error('webhook', e); }
    return json({ ok: true });   // LINE expects 200 quickly
  }
  try { return json(await flush()); } catch (e) { console.error('flush', e); return json({ error: String(e) }, 500); }
});
