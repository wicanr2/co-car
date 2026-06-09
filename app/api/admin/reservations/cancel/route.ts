import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decodeClaims } from '@/lib/jwt';
import { isReservationOpen } from '@/lib/date';

async function getAdminAcct(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const claims = decodeClaims(session.access_token);
  return claims.is_admin ? claims.acct ?? claims.emp_id ?? user.id : null;
}

export async function POST(req: Request) {
  const adminAcct = await getAdminAcct();
  if (!adminAcct) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reservationId = String(body.reservationId ?? '').trim();
  const accountId = String(body.accountId ?? '').trim();
  const date = String(body.date ?? '').trim();
  if (!reservationId && (!accountId || !date)) {
    return NextResponse.json({ error: '缺少預約帳號或日期' }, { status: 400 });
  }

  const admin = createAdminClient();
  let q = admin
    .from('reservations')
    .select('cancellation_history, date')
    .eq('status', 'active')
    .limit(1);
  q = reservationId
    ? q.eq('id', reservationId)
    : q.eq('account_id', accountId).eq('date', date);

  const { data: rows, error: readError } = await q;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
  const current = rows?.[0];
  if (!current) return NextResponse.json({ error: '找不到有效預約' }, { status: 404 });

  const { data: cfg } = await admin
    .from('shuttle_config')
    .select('cutoff_hour')
    .eq('id', 'default')
    .maybeSingle();
  if (!isReservationOpen(current.date, cfg?.cutoff_hour ?? 17)) {
    return NextResponse.json({ error: '此日期已成為歷史紀錄,不可變動' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const reason = body.reason ? String(body.reason).trim() : null;
  const cancellationHistory = Array.isArray(current.cancellation_history)
    ? current.cancellation_history
    : [];

  let update = admin
    .from('reservations')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: adminAcct,
      cancelled_reason: reason,
      cancellation_history: [...cancellationHistory, { at: now, by: adminAcct, reason }],
      updated_at: now,
    });
  update = reservationId
    ? update.eq('id', reservationId)
    : update.eq('account_id', accountId).eq('date', date).eq('status', 'active');

  const { error } = await update;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
