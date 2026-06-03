'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 無密碼登入:以「工號 + 中文姓名」驗證,姓名即作為登入憑證(與 dinbando 一致)。
  // 先呼叫 ensure:若此 (工號,姓名) 尚未建檔則自動建立(同工號不同名 = 獨立帳號),
  // 取回該帳號的不可變 email,再進行登入。
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empId.trim() || !name.trim()) return;
    setLoading(true);
    setError('');

    const ensure = await fetch('/api/auth/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId: empId.trim(), name: name.trim() }),
    });
    const ej = await ensure.json().catch(() => ({}));
    if (!ensure.ok || !ej.email) {
      setError(ej.error ?? '登入失敗,請稍後再試');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: ej.email,
      password: name.trim(),
    });
    if (error) {
      setError('工號或姓名錯誤');
      setLoading(false);
      return;
    }
    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#e6f4ea] bg-gradient-to-br from-[#e0f2f1] via-[#e8f5e9] to-[#b2ebf2] p-4 relative overflow-hidden font-sans">
      {/* 裝飾性背景(呼應 frontend.md 海報微黏土風格) */}
      <div className="absolute top-10 left-10 w-40 h-40 bg-yellow-200/60 rounded-full mix-blend-multiply filter blur-2xl animate-pulse"></div>
      <div className="absolute bottom-10 right-10 w-56 h-56 bg-teal-200/60 rounded-full mix-blend-multiply filter blur-2xl"></div>
      <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-orange-100/60 rounded-full mix-blend-multiply filter blur-2xl"></div>

      <div className="max-w-md w-full bg-white/90 backdrop-blur-md rounded-[2.5rem] shadow-[0_20px_50px_-12px_rgba(20,184,166,0.3)] p-8 sm:p-10 relative z-10 border border-white/80">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-tr from-teal-100 to-emerald-50 text-teal-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-5 text-4xl shadow-inner transform -rotate-3 hover:rotate-0 transition duration-300">
            🚐
          </div>
          <h2 className="text-3xl font-extrabold text-teal-800 tracking-tight mb-3">夏季專屬接駁車</h2>
          <span className="text-teal-700 mt-2 font-medium bg-teal-50/80 inline-block px-5 py-1.5 rounded-full text-sm shadow-sm border border-teal-100">
            新竹力行路 → 竹南國泰路 ☀️ 高效通勤
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-teal-800 mb-2 ml-1">工號</label>
            <input
              type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} autoFocus
              className="w-full px-5 py-3.5 bg-teal-50/50 border-2 border-teal-100 rounded-2xl focus:ring-0 focus:border-teal-400 outline-none transition text-teal-900 placeholder-teal-300 font-medium"
              placeholder="請輸入您的工號(例:A200112)"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-teal-800 mb-2 ml-1">中文姓名</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-5 py-3.5 bg-teal-50/50 border-2 border-teal-100 rounded-2xl focus:ring-0 focus:border-teal-400 outline-none transition text-teal-900 placeholder-teal-300 font-medium"
              placeholder="請輸入您的姓名"
              required
            />
          </div>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <div className="pt-2">
            <button
              type="submit"
              disabled={!empId.trim() || !name.trim() || loading}
              className="w-full bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 text-white font-bold py-4 px-4 rounded-2xl shadow-lg shadow-teal-500/30 transform transition active:scale-95 focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? '登入中…' : '登入預約系統'}
            </button>
          </div>
        </form>
        <p className="text-xs text-teal-700/60 mt-6 font-medium text-center">告別酷暑,免去高溫外出等車</p>
      </div>
    </div>
  );
}
