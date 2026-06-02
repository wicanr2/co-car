'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Save, X, Pencil, ShieldCheck, Ban, RotateCcw,
} from 'lucide-react';
import type { Profile } from '@/types';

// 使用者管理(admin only)。無密碼模式:員工以「工號 + 中文姓名」登入,
// 姓名即登入憑證,故不設密碼欄;改名等同改憑證。寫入經 /api/admin/users。
export default function UserManager() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 新增表單
  const [nEmpId, setNEmpId] = useState('');
  const [nName, setNName] = useState('');
  const [nDept, setNDept] = useState('');
  const [nAdmin, setNAdmin] = useState(false);

  // 編輯中的列
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eDept, setEDept] = useState('');
  const [eAdmin, setEAdmin] = useState(false);

  const flash = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (!res.ok) { setLoading(false); flash('讀取使用者失敗', 'error'); return; }
    const json = await res.json();
    setUsers((json.users as Profile[]) ?? []);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!nEmpId.trim() || !nName.trim()) {
      flash('工號、姓名為必填', 'error'); return;
    }
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId: nEmpId, name: nName, department: nDept, isAdmin: nAdmin }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { flash(json.error ?? '新增失敗', 'error'); return; }
    setNEmpId(''); setNName(''); setNDept(''); setNAdmin(false);
    flash('員工已新增');
    load();
  };

  const startEdit = (u: Profile) => {
    setEditId(u.emp_id);
    setEName(u.name);
    setEDept(u.department ?? '');
    setEAdmin(u.is_admin);
  };

  const saveEdit = async (empId: string) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId, name: eName, department: eDept, isAdmin: eAdmin }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { flash(json.error ?? '更新失敗', 'error'); return; }
    setEditId(null);
    flash('已更新(改名等同改登入憑證;角色變更需該員工重新登入生效)');
    load();
  };

  const toggleActive = async (u: Profile) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId: u.emp_id, active: !(u.active ?? true) }),
    });
    if (!res.ok) { flash('操作失敗', 'error'); return; }
    flash((u.active ?? true) ? '已停用(無法登入)' : '已啟用');
    load();
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-sm';

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
          msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {msg.text}
        </div>
      )}

      {/* 新增員工 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center">
          <UserPlus className="w-5 h-5 mr-2 text-teal-500" /> 新增員工
        </h2>
        <p className="text-xs text-gray-500 mb-4">員工以「工號 + 中文姓名」登入,無需密碼。</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">工號</label>
            <input value={nEmpId} onChange={(e) => setNEmpId(e.target.value)} placeholder="A200112" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">中文姓名</label>
            <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="王小明" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">部門</label>
            <input value={nDept} onChange={(e) => setNDept(e.target.value)} placeholder="系統軟體開發處" className={inputCls} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center text-sm font-medium text-gray-700 gap-1.5">
              <input type="checkbox" checked={nAdmin} onChange={(e) => setNAdmin(e.target.checked)} className="w-4 h-4 accent-teal-600" />
              管理員
            </label>
            <button onClick={create}
              className="ml-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium flex items-center transition-colors">
              <UserPlus className="w-4 h-4 mr-1" /> 新增
            </button>
          </div>
        </div>
      </div>

      {/* 員工清單 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <Users className="w-5 h-5 mr-2 text-teal-500" /> 員工清單
          <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-bold">{users.length}</span>
        </h2>

        {loading ? (
          <div className="text-center py-8 text-gray-400">載入中…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-sm">
                  <th className="pb-2 font-medium">工號</th>
                  <th className="pb-2 font-medium">姓名</th>
                  <th className="pb-2 font-medium">部門</th>
                  <th className="pb-2 font-medium">角色</th>
                  <th className="pb-2 font-medium">狀態</th>
                  <th className="pb-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {users.map((u) => {
                  const editing = editId === u.emp_id;
                  const active = u.active ?? true;
                  return (
                    <tr key={u.emp_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-500">{u.emp_id}</td>
                      <td className="py-3">
                        {editing
                          ? <input value={eName} onChange={(e) => setEName(e.target.value)} className={inputCls} />
                          : <span className="font-medium text-gray-800">{u.name}</span>}
                      </td>
                      <td className="py-3">
                        {editing
                          ? <input value={eDept} onChange={(e) => setEDept(e.target.value)} placeholder="部門" className={inputCls} />
                          : <span className="text-gray-600">{u.department ?? '—'}</span>}
                      </td>
                      <td className="py-3">
                        {editing ? (
                          <label className="flex items-center text-sm gap-1.5">
                            <input type="checkbox" checked={eAdmin} onChange={(e) => setEAdmin(e.target.checked)} className="w-4 h-4 accent-teal-600" />
                            管理員
                          </label>
                        ) : u.is_admin ? (
                          <span className="inline-flex items-center bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full font-bold">
                            <ShieldCheck className="w-3 h-3 mr-1" /> 管理員
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">一般</span>
                        )}
                      </td>
                      <td className="py-3">
                        {active
                          ? <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold">啟用</span>
                          : <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-bold">停用</span>}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-2">
                          {editing ? (
                            <>
                              <button onClick={() => saveEdit(u.emp_id)} title="儲存"
                                className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"><Save className="w-4 h-4" /></button>
                              <button onClick={() => setEditId(null)} title="取消"
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(u)} title="編輯"
                                className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                              <button onClick={() => toggleActive(u)} title={active ? '停用' : '啟用'}
                                className={`p-1.5 rounded-lg transition-colors ${active ? 'text-gray-500 hover:text-red-600 hover:bg-red-50' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'}`}>
                                {active ? <Ban className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
