'use client';

import { useState } from 'react';
import { Bus, Save, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fmtSlot } from '@/lib/date';
import type { ShuttleSlot } from '@/types';

interface Props {
  slots: ShuttleSlot[];
  cutoffHour: number;
  onSaved: (msg: string, type?: 'success' | 'error') => void;
  reload: () => void;
}

// 班次設定(admin only):調整各班次座位上限 / 停駛、以及預約截止時數。
// 寫入經 supabase client + RLS(is_admin claim 放行)。
export default function SlotManager({ slots, cutoffHour, onSaved, reload }: Props) {
  const supabase = createClient();
  const [caps, setCaps] = useState<Record<string, number>>(
    Object.fromEntries(slots.map((s) => [s.departure_time, s.capacity])),
  );
  const [actives, setActives] = useState<Record<string, boolean>>(
    Object.fromEntries(slots.map((s) => [s.departure_time, s.active ?? true])),
  );
  const [cutoff, setCutoff] = useState(cutoffHour);

  const saveSlot = async (t: string) => {
    const { error } = await supabase
      .from('shuttle_slots')
      .update({ capacity: caps[t], active: actives[t], updated_at: new Date().toISOString() })
      .eq('departure_time', t);
    if (error) { onSaved('儲存失敗:' + error.message, 'error'); return; }
    onSaved(`班次 ${fmtSlot(t)} 已更新`);
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
          <Bus className="w-5 h-5 mr-2 text-teal-500" /> 班次與座位上限
        </h2>
        <div className="space-y-3">
          {slots.map((s) => (
            <div key={s.departure_time} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <span className="font-mono font-bold text-teal-700 text-lg w-16">{fmtSlot(s.departure_time)}</span>
              <div className="flex items-center gap-1.5">
                <label className="text-sm text-gray-500">座位</label>
                <input
                  type="number" min={0} max={99}
                  value={caps[s.departure_time]}
                  onChange={(e) => setCaps({ ...caps, [s.departure_time]: Number(e.target.value) })}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <label className="flex items-center text-sm text-gray-600 gap-1.5 ml-2">
                <input
                  type="checkbox"
                  checked={actives[s.departure_time]}
                  onChange={(e) => setActives({ ...actives, [s.departure_time]: e.target.checked })}
                  className="w-4 h-4 accent-teal-600"
                />
                發車
              </label>
              <button
                onClick={() => saveSlot(s.departure_time)}
                className="ml-auto flex items-center gap-1 text-sm bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1.5 rounded-lg font-medium border border-teal-200 transition-colors"
              >
                <Save className="w-4 h-4" /> 儲存
              </button>
            </div>
          ))}
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
