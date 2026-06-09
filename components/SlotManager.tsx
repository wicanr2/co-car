'use client';

import { useState } from 'react';
import { Bus, Save, Clock, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fmtSlot, isReservationOpen } from '@/lib/date';
import type { ShuttleSlot } from '@/types';

interface Props {
  date: string;
  slots: ShuttleSlot[];
  cutoffHour: number;
  onSaved: (msg: string, type?: 'success' | 'error') => void;
  reload: () => void;
}

// 班次設定(admin only):調整各班次座位上限 / 停駛、以及預約截止時數。
// 寫入經 supabase client + RLS(is_admin claim 放行)。
export default function SlotManager({ date, slots, cutoffHour, onSaved, reload }: Props) {
  const supabase = createClient();
  const [times, setTimes] = useState<Record<string, string>>(
    Object.fromEntries(slots.map((s) => [s.departure_time, fmtSlot(s.departure_time)])),
  );
  const [caps, setCaps] = useState<Record<string, number>>(
    Object.fromEntries(slots.map((s) => [s.departure_time, s.capacity])),
  );
  const [actives, setActives] = useState<Record<string, boolean>>(
    Object.fromEntries(slots.map((s) => [s.departure_time, s.active ?? true])),
  );
  const [cutoff, setCutoff] = useState(cutoffHour);
  const [newTime, setNewTime] = useState('');
  const [newCapacity, setNewCapacity] = useState(5);
  const locked = !isReservationOpen(date, cutoffHour);

  const toPgTime = (hhmm: string) => {
    const trimmed = hhmm.trim();
    return /^\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
  };

  const saveSlot = async (t: string) => {
    if (locked) { onSaved('此日期已成為歷史紀錄,不可變動', 'error'); return; }
    const slot = slots.find((s) => s.departure_time === t);
    const departureTime = toPgTime(times[t] ?? fmtSlot(t));
    if (!/^\d{2}:\d{2}:00$/.test(departureTime)) {
      onSaved('請輸入有效班次時間', 'error');
      return;
    }
    if (departureTime !== t) {
      const { count, error: countError } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('date', date)
        .eq('departure_time', t)
        .eq('status', 'active');
      if (countError) { onSaved('檢查預約失敗:' + countError.message, 'error'); return; }
      if ((count ?? 0) > 0) {
        onSaved('已有預約的班次不能直接改時間', 'error');
        return;
      }
    }
    const { error } = await supabase
      .from('daily_shuttle_slots')
      .upsert({
        service_date: date,
        departure_time: departureTime,
        capacity: caps[t],
        active: actives[t],
        sort_order: slot?.sort_order ?? 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'service_date,departure_time' });
    if (error) { onSaved('儲存失敗:' + error.message, 'error'); return; }
    if (departureTime !== t) {
      const { error: deleteError } = await supabase
        .from('daily_shuttle_slots')
        .delete()
        .eq('service_date', date)
        .eq('departure_time', t);
      if (deleteError) { onSaved('移除舊班次失敗:' + deleteError.message, 'error'); return; }
    }
    onSaved(`${date} 班次 ${fmtSlot(departureTime)} 已更新`);
    reload();
  };

  const addSlot = async () => {
    if (locked) { onSaved('此日期已成為歷史紀錄,不可變動', 'error'); return; }
    const departureTime = toPgTime(newTime);
    if (!/^\d{2}:\d{2}:00$/.test(departureTime)) {
      onSaved('請輸入有效班次時間', 'error');
      return;
    }
    const { error } = await supabase
      .from('daily_shuttle_slots')
      .upsert({
        service_date: date,
        departure_time: departureTime,
        capacity: newCapacity,
        active: true,
        sort_order: slots.length + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'service_date,departure_time' });
    if (error) { onSaved('新增失敗:' + error.message, 'error'); return; }
    setNewTime('');
    setNewCapacity(5);
    onSaved(`${date} 班次 ${fmtSlot(departureTime)} 已新增`);
    reload();
  };

  const saveCutoff = async () => {
    const { error } = await supabase
      .from('shuttle_config')
      .update({ cutoff_hour: cutoff, updated_at: new Date().toISOString() })
      .eq('id', 'default');
    if (error) { onSaved('儲存失敗:' + error.message, 'error'); return; }
    onSaved(`截止時間已設為前一天 ${String(cutoff).padStart(2, '0')}:00`);
    reload();
  };

  return (
    <div className="space-y-6">
      {/* 班次容量 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <Bus className="w-5 h-5 mr-2 text-teal-500" /> {date} 班次與座位上限
        </h2>
        {locked && (
          <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            此日期已成為歷史紀錄,班次時間、座位與停駛狀態不可變動。
          </div>
        )}
        <div className="space-y-3">
          {slots.map((s) => (
            <div key={s.departure_time} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 flex-wrap">
              <input
                type="time"
                value={times[s.departure_time] ?? fmtSlot(s.departure_time)}
                onChange={(e) => setTimes({ ...times, [s.departure_time]: e.target.value })}
                disabled={locked}
                className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono font-bold text-teal-700 focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
              />
              <div className="flex items-center gap-1.5">
                <label className="text-sm text-gray-500">座位</label>
                <input
                  type="number" min={0} max={99}
                  value={caps[s.departure_time]}
                  onChange={(e) => setCaps({ ...caps, [s.departure_time]: Number(e.target.value) })}
                  disabled={locked}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              <label className="flex items-center text-sm text-gray-600 gap-1.5 ml-2">
                <input
                  type="checkbox"
                  checked={actives[s.departure_time]}
                  onChange={(e) => setActives({ ...actives, [s.departure_time]: e.target.checked })}
                  disabled={locked}
                  className="w-4 h-4 accent-teal-600 disabled:opacity-50"
                />
                發車
              </label>
              <button
                onClick={() => saveSlot(s.departure_time)}
                disabled={locked}
                className="sm:ml-auto flex items-center gap-1 text-sm bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1.5 rounded-lg font-medium border border-teal-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> 儲存
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 bg-teal-50/60 rounded-xl px-4 py-3 flex-wrap">
          <input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            disabled={locked}
            className="w-28 px-2 py-1.5 border border-teal-200 rounded-lg text-sm font-mono font-bold text-teal-700 focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
          />
          <div className="flex items-center gap-1.5">
            <label className="text-sm text-gray-500">座位</label>
            <input
              type="number" min={0} max={99}
              value={newCapacity}
              onChange={(e) => setNewCapacity(Number(e.target.value))}
              disabled={locked}
              className="w-16 px-2 py-1.5 border border-teal-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>
          <button
            onClick={addSlot}
            disabled={locked}
            className="sm:ml-auto flex items-center gap-1 text-sm bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> 新增班次
          </button>
        </div>
      </div>

      {/* 截止時數 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-teal-500" /> 預約截止時間
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">去程日「前一天」的</span>
          <select
            value={cutoff}
            onChange={(e) => setCutoff(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <span className="text-sm text-gray-600">截止</span>
          <button
            onClick={saveCutoff}
            className="flex items-center gap-1 text-sm bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Save className="w-4 h-4" /> 套用
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          例:設 17 → 去程日前一天 17:00 後無法新增 / 改 / 取消(後端 RLS 以 Asia/Taipei 強制)。
        </p>
      </div>
    </div>
  );
}
