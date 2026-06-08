'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bus, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Users,
  UserCircle, LogOut, Lock, Download, CalendarDays, Armchair, XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { decodeClaims } from '@/lib/jwt';
import { addDays, minBookableDate, isReservationOpen, fmtSlot, today, reportRange, type ReportMode } from '@/lib/date';
import { reservationsToCsv, downloadCsv } from '@/lib/csv';
import RouteMap from '@/components/RouteMap';
import SlotManager from '@/components/SlotManager';
import UserManager from '@/components/UserManager';
import type { ShuttleSlot, ShuttleConfig, Reservation, SlotAvailability } from '@/types';

interface Me { acct: string; empId: string; name: string; isAdmin: boolean }
type View = 'book' | 'schedule' | 'slots' | 'users';

export default function ReservationApp() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ShuttleConfig | null>(null);
  const [slots, setSlots] = useState<ShuttleSlot[]>([]);
  const [view, setView] = useState<View>('book');
  const [currentDate, setCurrentDate] = useState(minBookableDate());

  const [availability, setAvailability] = useState<SlotAvailability[]>([]);
  const [myRes, setMyRes] = useState<Reservation | null>(null);
  const [allRes, setAllRes] = useState<Reservation[]>([]);
  const [reportMode, setReportMode] = useState<ReportMode>('day');

  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [returnNote, setReturnNote] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const cutoffHour = config?.cutoff_hour ?? 17;
  const minDate = useMemo(() => minBookableDate(cutoffHour), [cutoffHour]);
  const open = isReservationOpen(currentDate, cutoffHour);

  // ── 初始:身分 + 設定 + 班次 ──
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      const claims = decodeClaims(session.access_token);
      const meta = session.user.user_metadata ?? {};
      setMe({
        acct: claims.acct ?? '',
        empId: claims.emp_id ?? meta.emp_id ?? '',
        name: claims.name ?? meta.name ?? claims.emp_id ?? '',
        isAdmin: !!claims.is_admin,
      });

      const [{ data: cfg }, { data: sl }] = await Promise.all([
        supabase.from('shuttle_config').select('*').eq('id', 'default').single(),
        supabase.from('shuttle_slots').select('*').eq('active', true).order('sort_order'),
      ]);
      if (cfg) setConfig(cfg as ShuttleConfig);
      if (sl) setSlots(sl as ShuttleSlot[]);
      setLoading(false);
    })();
  }, [supabase, router]);

  // ── 載入某日:剩餘座位 + 我的預約 (+ admin 全部) ──
  const loadDay = useCallback(async (date: string, isAdmin: boolean, acct: string) => {
    const tasks: PromiseLike<unknown>[] = [
      supabase.rpc('get_slot_availability', { p_date: date }),
      supabase.from('reservations')
        .select('id, account_id, emp_id, emp_name, date, departure_time, return_note, status, cancelled_at, cancelled_by, cancellation_history, created_at')
        .eq('account_id', acct).eq('date', date).eq('status', 'active').maybeSingle(),
    ];
    if (isAdmin) {
      tasks.push(
        supabase.from('reservations')
          .select('id, account_id, emp_id, emp_name, date, departure_time, return_note, status, cancelled_at, cancelled_by, created_at, profiles(name, department)')
          .eq('date', date).order('departure_time'),
      );
    }
    const results = await Promise.all(tasks);
    const avail = (results[0] as { data: SlotAvailability[] | null }).data;
    const mine = (results[1] as { data: Reservation | null }).data;
    setAvailability(avail ?? []);
    setMyRes(mine ?? null);
    if (isAdmin) {
      const all = (results[2] as { data: Reservation[] | null }).data;
      setAllRes(all ?? []);
    }
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (me) loadDay(currentDate, me.isAdmin, me.acct); }, [me, currentDate, loadDay]);

  // ── Realtime:當日預約變動即時更新 ──
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`res-${currentDate}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `date=eq.${currentDate}` },
        () => loadDay(currentDate, me.isAdmin, me.acct))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me, currentDate, supabase, loadDay]);

  // 切日時重置選取(同步 setState,屬刻意行為)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedSlot(''); setReturnNote(''); }, [currentDate]);

  const seatsLeftOf = (t: string) => availability.find((a) => a.departure_time === t)?.seats_left ?? null;
  const activeRes = useMemo(() => allRes.filter((r) => (r.status ?? 'active') === 'active'), [allRes]);

  // ── 員工:送出 / 取消 ──
  const submit = async () => {
    if (!me || !selectedSlot) { showToast('請選擇發車班次', 'error'); return; }
    const { error } = await supabase.from('reservations').insert({
      account_id: me.acct, emp_id: me.empId, emp_name: me.name,
      date: currentDate, departure_time: selectedSlot,
      return_note: returnNote.trim() || null,
      status: 'active', cancelled_at: null, cancelled_by: null, cancelled_reason: null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      const m = error.message.includes('額滿') ? '該班次已額滿' :
        /policy|row-level/i.test(error.message) ? '已過預約截止時間' : ('預約失敗:' + error.message);
      showToast(m, 'error'); return;
    }
    showToast('✅ 預約成功!');
    loadDay(currentDate, me.isAdmin, me.acct);
  };

  const cancel = async () => {
    if (!me || !myRes?.id) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('reservations').update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: me.acct,
      cancellation_history: [...(myRes.cancellation_history ?? []), { at: now, by: me.acct }],
      updated_at: now,
    }).eq('id', myRes.id);
    if (error) { showToast(/policy|row-level/i.test(error.message) ? '已過截止時間,無法取消' : '取消失敗', 'error'); return; }
    showToast('已取消預約');
    loadDay(currentDate, me.isAdmin, me.acct);
  };

  const cancelAsAdmin = async (reservation: Reservation) => {
    const res = await fetch('/api/admin/reservations/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId: reservation.id, accountId: reservation.account_id, date: reservation.date }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(json.error ?? '取消失敗', 'error'); return; }
    showToast('已取消預約');
    loadDay(currentDate, me?.isAdmin ?? false, me?.acct ?? '');
  };

  const exportCsv = async () => {
    const range = reportRange(currentDate, reportMode);
    const { data, error } = await supabase
      .from('reservations')
      .select('id, account_id, emp_id, emp_name, date, departure_time, return_note, status, cancelled_at, cancelled_by, created_at, profiles(name, department)')
      .gte('date', range.from)
      .lte('date', range.to)
      .order('date', { ascending: true })
      .order('departure_time', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) { showToast('報表匯出失敗', 'error'); return; }
    const reportRows = (data as unknown as Reservation[]) ?? [];
    if (reportRows.length === 0) { showToast('目前沒有預約可匯出', 'error'); return; }
    const csv = reservationsToCsv(reportRows.map((r) => ({
      empId: r.emp_id, name: r.profiles?.name ?? r.emp_name ?? r.emp_id, department: r.profiles?.department,
      date: reportMode === 'day' ? undefined : r.date,
      departure: fmtSlot(r.departure_time), returnNote: r.return_note,
      status: r.status ?? 'active', cancelledAt: r.cancelled_at, cancelledBy: r.cancelled_by, createdAt: r.created_at,
    })));
    const label = reportMode === 'day' ? currentDate : range.label;
    downloadCsv(`接駁預約${reportMode === 'day' ? '每日' : reportMode === 'week' ? '每週' : '每月'}報表_${label}.csv`, csv);
    showToast('CSV 匯出成功!');
  };

  const logout = async () => { await supabase.auth.signOut(); router.push('/login'); router.refresh(); };

  if (loading || !me || !config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#e6f4ea]">
        <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-teal-700 font-medium">載入中…</p>
      </div>
    );
  }

  const tabs: { key: View; label: string }[] = me.isAdmin
    ? [{ key: 'book', label: '預約' }, { key: 'schedule', label: '排班' }, { key: 'slots', label: '班次' }, { key: 'users', label: '使用者' }]
    : [{ key: 'book', label: '預約' }];

  // 排班視角(admin 看每日乘客名單)可瀏覽任意日期 — 包含已過截止的明天、
  // 甚至過去的紀錄;只有「預約」視角才受最早可約日(cutoff)限制。
  const inSchedule = view === 'schedule';
  const atLowerBound = !inSchedule && currentDate <= minDate;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e0f2f1] via-[#e8f5e9] to-[#b2ebf2] pb-20 md:pb-10 font-sans">
      {/* 頂部導航 */}
      <header className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">🚐</span>
            <span className="font-bold text-teal-800 text-base sm:text-lg truncate">{config.service_name}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center text-teal-700 bg-teal-50 px-3 py-1.5 rounded-full text-sm">
              <UserCircle className="w-4 h-4 mr-2" />{me.name} ({me.empId})
            </div>
            {tabs.length > 1 && (
              <div className="flex bg-teal-50 p-1 rounded-lg">
                {tabs.map((t) => (
                  <button key={t.key} onClick={() => setView(t.key)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === t.key ? 'bg-white shadow-sm text-teal-600' : 'text-teal-500 hover:text-teal-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="登出">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center bg-gray-800 text-white px-4 py-3 rounded-xl shadow-lg">
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-2 text-green-400" /> : <AlertCircle className="w-5 h-5 mr-2 text-red-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 日期選擇器(僅 book / schedule 視角需要) */}
        {(view === 'book' || view === 'schedule') && (
          <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
            <button onClick={() => !atLowerBound && setCurrentDate(addDays(currentDate, -1))} disabled={atLowerBound}
              className="p-2 hover:bg-teal-50 rounded-full transition-colors text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-center flex-1">
              <h2 className="text-xl font-bold text-teal-800 flex items-center justify-center gap-2">
                <CalendarDays className="w-5 h-5" />{currentDate}
              </h2>
              {inSchedule ? (
                <button onClick={() => setCurrentDate(today())}
                  className="text-sm mt-1 font-medium text-teal-500 hover:text-teal-700">
                  回到今天({today()})
                </button>
              ) : (
                <button onClick={() => setCurrentDate(minDate)}
                  className="text-sm mt-1 font-medium text-teal-500 hover:text-teal-700">
                  最近可約日({minDate})
                </button>
              )}
            </div>
            <button onClick={() => setCurrentDate(addDays(currentDate, 1))}
              className="p-2 hover:bg-teal-50 rounded-full transition-colors text-teal-600">
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* ── 預約視角 ── */}
        {view === 'book' && (
          <div className="space-y-6">
            {/* 內嵌路線小地圖(直接顯示,不需跳頁) */}
            <RouteMap
              origin={config.origin ?? '新竹力行路'}
              destination={config.destination ?? '竹南國泰路'}
              mapUrl={config.map_url ?? '#'}
            />

            {!open && (
              <div className="flex items-center bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm border border-amber-100">
                <Lock className="w-4 h-4 mr-2" /> 此日已過預約截止(前一天 {String(cutoffHour).padStart(2, '0')}:00),無法新增 / 取消
              </div>
            )}

            {myRes ? (
              <div className="bg-white rounded-[2rem] shadow-sm p-8 text-center border border-teal-100">
                <div className="w-16 h-16 bg-gradient-to-tr from-teal-100 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-teal-600" />
                </div>
                <h3 className="text-lg font-bold text-teal-900 mb-1">您已預約本日接駁車</h3>
                <p className="text-teal-700 font-medium text-2xl my-3 font-mono">{fmtSlot(myRes.departure_time)} 發車</p>
                <p className="text-gray-500 text-sm mb-1">{config.origin} → {config.destination}</p>
                {myRes.return_note && <p className="text-gray-500 text-sm mb-4">回程備註:{myRes.return_note}</p>}
                {open && (
                  <button onClick={cancel} className="mt-2 text-red-600 hover:bg-red-50 px-5 py-2 rounded-xl font-medium transition-colors">
                    取消預約
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] shadow-sm p-6 sm:p-8 border border-teal-100">
                <h3 className="text-lg font-bold text-teal-800 mb-1 flex items-center gap-2">
                  <Bus className="w-5 h-5" /> 選擇發車班次
                </h3>
                <p className="text-gray-400 text-sm mb-5">{config.origin} → {config.destination}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  {slots.map((s) => {
                    const left = seatsLeftOf(s.departure_time);
                    const full = left !== null && left <= 0;
                    const picked = selectedSlot === s.departure_time;
                    return (
                      <button key={s.departure_time} type="button"
                        disabled={!open || full}
                        onClick={() => setSelectedSlot(s.departure_time)}
                        className={`relative rounded-2xl border-2 p-4 text-center transition-all
                          ${picked ? 'border-teal-500 bg-teal-50 ring-4 ring-teal-100' : 'border-teal-100 bg-teal-50/30 hover:border-teal-300'}
                          ${(!open || full) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}>
                        <div className="text-2xl font-bold font-mono text-teal-800">{fmtSlot(s.departure_time)}</div>
                        <div className="mt-2 flex items-center justify-center gap-1 text-xs font-medium">
                          <Armchair className="w-3.5 h-3.5 text-teal-400" />
                          {full ? <span className="text-red-500">已額滿</span>
                            : <span className="text-teal-600">剩 {left ?? s.capacity} / {s.capacity} 位</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <label className="block text-sm font-bold text-teal-800 mb-2">回程備註(選填)</label>
                <input
                  type="text" value={returnNote} onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="例:約 18:30 回程 / 回程不搭"
                  disabled={!open}
                  className="w-full px-5 py-3 bg-teal-50/50 border-2 border-teal-100 rounded-2xl focus:ring-0 focus:border-teal-400 outline-none transition text-teal-900 placeholder-teal-300 font-medium disabled:opacity-50 mb-5"
                />

                <button onClick={submit} disabled={!open || !selectedSlot}
                  className="w-full bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-teal-500/30 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                  送出預約
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 排班視角(admin) ── */}
        {view === 'schedule' && me.isAdmin && (
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
              <h2 className="text-lg font-bold text-gray-800 flex items-center">
                <Users className="w-5 h-5 mr-2 text-teal-500" /> 當日乘客名單
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={reportMode}
                  onChange={(e) => setReportMode(e.target.value as ReportMode)}
                  className="text-sm bg-white border border-teal-200 text-teal-800 px-3 py-1.5 rounded-lg font-medium outline-none"
                >
                  <option value="day">每日</option>
                  <option value="week">每週</option>
                  <option value="month">每月</option>
                </select>
                <button onClick={exportCsv}
                  className="flex items-center text-sm bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1.5 rounded-lg font-medium border border-teal-200 transition-colors">
                  <Download className="w-4 h-4 mr-1" /> 匯出報表
                </button>
              </div>
            </div>

            {slots.map((s) => {
              const list = activeRes.filter((r) => r.departure_time === s.departure_time);
              return (
                <div key={s.departure_time} className="mb-5 last:mb-0">
                  <div className="flex items-center justify-between bg-teal-50 rounded-t-xl px-4 py-2.5">
                    <span className="font-mono font-bold text-teal-800">{fmtSlot(s.departure_time)} 發車</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${list.length >= s.capacity ? 'bg-red-100 text-red-600' : 'bg-white text-teal-600'}`}>
                      {list.length} / {s.capacity} 位
                    </span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-gray-400 text-sm px-4 py-3 border border-t-0 border-gray-100 rounded-b-xl">尚無人預約</p>
                  ) : (
                    <table className="w-full text-sm border border-t-0 border-gray-100 rounded-b-xl overflow-hidden">
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.account_id} className="border-b border-gray-50 last:border-0">
                            <td className="px-4 py-2 font-medium text-gray-500 w-24">{r.emp_id}</td>
                            <td className="px-2 py-2 font-medium text-gray-800">{r.profiles?.name ?? r.emp_name ?? '—'}</td>
                            <td className="px-2 py-2 text-gray-400">{r.profiles?.department ?? ''}</td>
                            <td className="px-4 py-2 text-gray-500 text-right">{r.return_note ?? ''}</td>
                            <td className="px-4 py-2 text-right w-20">
                              <button
                                onClick={() => cancelAsAdmin(r)}
                                className="inline-flex items-center justify-center text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg font-medium transition-colors"
                                title="取消預約"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 班次設定(admin) ── */}
        {view === 'slots' && me.isAdmin && (
          <SlotManager slots={slots} cutoffHour={cutoffHour} onSaved={showToast}
            reload={async () => {
              const { data: sl } = await supabase.from('shuttle_slots').select('*').eq('active', true).order('sort_order');
              if (sl) setSlots(sl as ShuttleSlot[]);
              const { data: cfg } = await supabase.from('shuttle_config').select('*').eq('id', 'default').single();
              if (cfg) setConfig(cfg as ShuttleConfig);
              loadDay(currentDate, me.isAdmin, me.acct);
            }} />
        )}

        {/* ── 使用者管理(admin) ── */}
        {view === 'users' && me.isAdmin && <UserManager />}
      </main>
    </div>
  );
}
