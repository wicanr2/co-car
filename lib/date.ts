// 日期 / 班次工具 — 一律以 Asia/Taipei 牆上時間計算。
// 與後端 RLS reservation_open()(也用 Asia/Taipei)一致,
// 因此本機(台北時區)與雲端(Vercel = UTC)行為完全相同,不再差一天。

const TPE = 'Asia/Taipei';

// 把某個瞬間(預設現在)格式化為「台北當地」的 YYYY-MM-DD。
// en-CA locale 直接輸出 YYYY-MM-DD。
export function formatDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TPE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// 台北當地的小時 (0–23)。hourCycle 'h23' 確保午夜為 00 而非 24。
function taipeiHour(date: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: TPE, hour: '2-digit', hourCycle: 'h23',
  }).format(date);
  return parseInt(h, 10);
}

// 純日曆運算:在 YYYY-MM-DD 上加減天數(與時區無關,用 UTC 避免 DST/換日誤差)。
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 今天(台北)
export function today(): string {
  return formatDate();
}

export function isToday(dateStr: string): boolean {
  return dateStr === today();
}

// 最早可預約日:cutoff(預設 17:00 台北)前可約明天,過了只能約後天。
// 對應原型 minBookableDate;以台北牆上時間判斷,與部署環境時區無關。
export function minBookableDate(cutoffHour = 17): string {
  return addDays(today(), taipeiHour() >= cutoffHour ? 2 : 1);
}

// 某去程日是否仍可新增/取消(去程日「前一天」cutoff 整點之前,台北時間)。
// 與後端 RLS reservation_open() 同一套規則,前端 UX 與後端鎖定不會打架。
export function isReservationOpen(dateStr: string, cutoffHour = 17): boolean {
  const cutoffDate = addDays(dateStr, -1);   // 去程日前一天
  const td = today();
  if (td < cutoffDate) return true;          // 還沒到前一天 → 開放
  if (td > cutoffDate) return false;          // 已過前一天 → 截止
  return taipeiHour() < cutoffHour;           // 正好前一天 → 看是否過 cutoff 整點
}

// 班次時間正規化:Postgres time 'HH:MM:SS' → 顯示 'HH:MM'
export function fmtSlot(t: string): string {
  return t.slice(0, 5);
}

export type ReportMode = 'day' | 'week' | 'month';

function localDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function reportRange(dateStr: string, mode: ReportMode): { from: string; to: string; label: string } {
  const base = localDate(dateStr);
  if (mode === 'day') return { from: dateStr, to: dateStr, label: dateStr };

  if (mode === 'week') {
    const start = new Date(base);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const from = formatDate(start);
    const to = formatDate(end);
    return { from, to, label: `${from}_${to}` };
  }

  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const from = formatDate(first);
  const to = formatDate(last);
  return { from, to, label: `${from.slice(0, 7)}` };
}
