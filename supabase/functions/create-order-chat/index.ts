// create-order-chat — the platform's first server-side component.
//
// WHY THIS EXISTS
//   Telegram *bots* cannot create groups or add users by phone. Only a real
//   user account can. So this function drives a dedicated platform-owned
//   Telegram account ("userbot") over MTProto (GramJS) to create a group for an
//   order's team. It must run server-side because it holds login secrets.
//
// STRATEGY: link-first (robust).
//   Create the group + export an invite link, then best-effort add each
//   participant by phone. Anyone Telegram can't add (no account, privacy block,
//   PeerFloodError) is returned in `unadded_members` so the UI can share the
//   invite link with them. The link is the guarantee; auto-add is a nicety.
//
// AUTH
//   The caller's Supabase JWT is verified, and lab ownership of the order is
//   re-checked server-side with the service role — never trusted from the client.
//
// SECRETS (supabase secrets set ...): TG_API_ID, TG_API_HASH, TG_SESSION.
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// PRIVACY: `unadded_members` carries phone numbers. The order_chats row is
//   readable ONLY by the lab owner / PLATFORM_ADMIN (see 0012 migration RLS).
//   Doctors get the invite link — and nothing else — via the get_order_chat RPC.
//
// ⚠️ RUNTIME NOTE: GramJS-in-Deno transport must be validated on first deploy
//   (see docs/SPEC-lab-staff-telegram.md §Runbook, "If GramJS won't run on Edge").

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { TelegramClient } from 'npm:telegram@2';
import { StringSession } from 'npm:telegram@2/sessions';
import { Api } from 'npm:telegram@2';
import bigInt from 'npm:big-integer@1'; // GramJS's BigInteger type

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

type Participant = { name: string; phone: string; role: 'staff' | 'doctor' | 'lab' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // --- env ---
  const apiId = Number(Deno.env.get('TG_API_ID'));
  const apiHash = Deno.env.get('TG_API_HASH') ?? '';
  const tgSession = Deno.env.get('TG_SESSION') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!apiId || !apiHash || !tgSession || !supabaseUrl || !serviceKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  // --- parse ---
  let orderId: string | undefined;
  try {
    orderId = (await req.json())?.order_id;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!orderId) return json({ error: 'order_id_required' }, 400);

  // --- authn: who is calling? ---
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const caller = userData?.user;
  if (userErr || !caller) return json({ error: 'unauthenticated' }, 401);

  // --- service-role client for all data access (bypasses RLS; we authorize manually) ---
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // --- load order + lab, re-check lab ownership server-side ---
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, order_code, lab_id, doctor_id, doctor_snapshot')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) return json({ error: 'order_lookup_failed' }, 500);
  if (!order) return json({ error: 'order_not_found' }, 404);

  const { data: lab } = await admin
    .from('labs')
    .select('id, public_name, owner_user_id, contact_phone')
    .eq('id', order.lab_id)
    .maybeSingle();
  if (!lab) return json({ error: 'lab_not_found' }, 404);

  const { data: callerRow } = await admin
    .from('users')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();
  const isOwner = lab.owner_user_id === caller.id;
  const isAdmin = callerRow?.role === 'PLATFORM_ADMIN';
  if (!isOwner && !isAdmin) return json({ error: 'forbidden' }, 403);

  // --- idempotency: chat already exists? ---
  const { data: existing } = await admin
    .from('order_chats')
    .select('telegram_chat_id, invite_link, unadded_members')
    .eq('order_id', orderId)
    .maybeSingle();
  if (existing) {
    return json({
      invite_link: existing.invite_link,
      chat_id: existing.telegram_chat_id,
      unadded_members: existing.unadded_members ?? [],
    });
  }

  // --- collect participants (assigned staff + doctor + lab) ---
  const { data: assignments } = await admin
    .from('order_staff_assignments')
    .select('lab_staff(first_name, last_name, phone, archived_at)')
    .eq('order_id', orderId);

  const participants: Participant[] = [];
  for (const a of assignments ?? []) {
    const s = (a as { lab_staff: { first_name: string; last_name: string; phone: string; archived_at: string | null } | null }).lab_staff;
    if (s && !s.archived_at && s.phone) {
      participants.push({ name: `${s.first_name} ${s.last_name}`.trim(), phone: s.phone, role: 'staff' });
    }
  }
  if (participants.length === 0) {
    return json({ error: 'no_assigned_staff' }, 400);
  }

  // doctor phone: order.doctor_id -> doctor_profiles.user_id -> users.phone
  const { data: docProfile } = await admin
    .from('doctor_profiles')
    .select('user_id')
    .eq('id', order.doctor_id)
    .maybeSingle();
  if (docProfile?.user_id) {
    const { data: docUser } = await admin
      .from('users')
      .select('first_name, last_name, phone')
      .eq('id', docProfile.user_id)
      .maybeSingle();
    const snap = (order.doctor_snapshot ?? {}) as { first_name?: string; last_name?: string };
    const docName =
      `${docUser?.first_name ?? snap.first_name ?? ''} ${docUser?.last_name ?? snap.last_name ?? ''}`.trim() ||
      'Doctor';
    if (docUser?.phone) {
      participants.push({ name: docName, phone: docUser.phone, role: 'doctor' });
    } else {
      // Doctor has no phone (users.phone is nullable) — link-only join.
      // Recorded as unadded below so the UI can share the link with them.
      participants.push({ name: docName, phone: '', role: 'doctor' });
    }
  }

  // lab contact
  if (lab.contact_phone) {
    participants.push({ name: lab.public_name, phone: lab.contact_phone, role: 'lab' });
  }

  const title = `Order ${order.order_code} — ${lab.public_name}`.slice(0, 120);

  // --- MTProto: resolve phones -> create group -> export invite ---
  const client = new TelegramClient(new StringSession(tgSession), apiId, apiHash, {
    connectionRetries: 3,
  });

  const unadded: { name: string; phone: string | null; reason: string }[] = [];

  try {
    await client.connect();

    // Resolve each participant's phone to a Telegram user (best effort, sequential).
    const resolvedUsers: Api.TypeInputUser[] = [];
    let clientId = 0;
    for (const p of participants) {
      if (!p.phone) {
        unadded.push({ name: p.name, phone: null, reason: 'no_phone' });
        continue;
      }
      try {
        const res = await client.invoke(
          new Api.contacts.ImportContacts({
            contacts: [
              new Api.InputPhoneContact({
                clientId: bigInt(clientId++),
                phone: p.phone,
                firstName: p.name || p.phone,
                lastName: '',
              }),
            ],
          }),
        );
        const user = res.users?.[0];
        if (user && 'id' in user) {
          resolvedUsers.push(
            new Api.InputUser({
              userId: user.id,
              accessHash: (user as { accessHash?: ReturnType<typeof bigInt> }).accessHash ?? bigInt(0),
            }),
          );
        } else {
          unadded.push({ name: p.name, phone: p.phone, reason: 'not_on_telegram' });
        }
      } catch (_e) {
        // PeerFloodError, privacy restriction, etc. → fall back to invite link.
        unadded.push({ name: p.name, phone: p.phone, reason: 'add_failed' });
      }
    }

    if (resolvedUsers.length === 0) {
      // Nobody could be added by phone → we can't form a useful group.
      await client.disconnect();
      return json({ invite_link: null, chat_id: null, unadded_members: unadded }, 200);
    }

    // Create the group with everyone we could resolve.
    const created = await client.invoke(
      new Api.messages.CreateChat({ users: resolvedUsers, title }),
    );

    // Extract the new chat id from the updates payload.
    const chats = (created as unknown as { chats?: Array<{ id: bigint }>; updates?: { chats?: Array<{ id: bigint }> } });
    const chat = chats.chats?.[0] ?? chats.updates?.chats?.[0];
    if (!chat) throw new Error('chat_id_missing_from_response');
    const chatId = chat.id;

    // Export an invite link for everyone who couldn't be added directly.
    const invite = await client.invoke(
      new Api.messages.ExportChatInvite({ peer: new Api.InputPeerChat({ chatId }) }),
    );
    const inviteLink = (invite as unknown as { link?: string }).link ?? '';

    await client.disconnect();

    // --- persist (service role; RLS has no client INSERT policy) ---
    const chatIdNum = Number(chatId);
    const { error: insErr } = await admin.from('order_chats').insert({
      order_id: orderId,
      telegram_chat_id: chatIdNum,
      invite_link: inviteLink,
      unadded_members: unadded,
      created_by_user_id: caller.id,
    });
    if (insErr) {
      // Race: another request created it first — return that.
      const { data: raced } = await admin
        .from('order_chats')
        .select('telegram_chat_id, invite_link, unadded_members')
        .eq('order_id', orderId)
        .maybeSingle();
      if (raced) {
        return json({
          invite_link: raced.invite_link,
          chat_id: raced.telegram_chat_id,
          unadded_members: raced.unadded_members ?? [],
        });
      }
      return json({ error: 'persist_failed' }, 500);
    }

    return json({ invite_link: inviteLink, chat_id: chatIdNum, unadded_members: unadded });
  } catch (e) {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
    return json({ error: 'telegram_failed', detail: String((e as Error)?.message ?? e) }, 502);
  }
});
