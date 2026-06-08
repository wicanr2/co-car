// CSV 匯出純函數 — 接駁車預約明細(可單元測試)

export interface ReservationRow {
  date?: string;
  empId: string;
  name: string;
  department?: string | null;
  departure: string;   // 'HH:MM'
  returnNote?: string | null;
  status?: 'active' | 'cancelled';
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  createdAt?: string | null;
}

// 產生帶 UTF-8 BOM 的 CSV 字串(Excel 友善),欄位用雙引號包覆
export function reservationsToCsv(rows: ReservationRow[]): string {
  const includeDate = rows.some((r) => r.date);
  const headers = [
    ...(includeDate ? ['去程日期'] : []),
    '工號',
    '姓名',
    '部門',
    '發車班次',
    '回程備註',
    '狀態',
    '預約時間',
    '取消時間',
    '取消者',
  ];
  const body = [
    headers,
    ...rows.map((r) => [
      ...(includeDate ? [r.date ?? ''] : []),
      r.empId,
      r.name,
      r.department ?? '',
      r.departure,
      r.returnNote ?? '',
      r.status === 'cancelled' ? '已取消' : '有效',
      r.createdAt ? new Date(r.createdAt).toLocaleTimeString('zh-TW', { hour12: false }) : '',
      r.cancelledAt ? new Date(r.cancelledAt).toLocaleString('zh-TW', { hour12: false }) : '',
      r.cancelledBy ?? '',
    ]),
  ]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return '﻿' + body;
}

// 瀏覽器端觸發下載(僅在 client 呼叫)
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
