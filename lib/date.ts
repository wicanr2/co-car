// 日期 / 班次工具 — 從 frontend.md 原型抽出(可單元測試)

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 在某 YYYY-MM-DD 上加減天數
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function today(): string {
  return formatDate(new Date());
}

export function isToday(dateStr: string): boolean {
  return dateStr === today();
}

// 最早可預約日:cutoff(預設 17:00)前可約明天,過了只能約後天。
// 對應原型 minBookableDate;以瀏覽器本地時區(使用者在台北)判斷。
export function minBookableDate(cutoffHour = 17): string {
  const now = new Date();
  const t = new Date();
  t.setDate(now.getDate() + (now.getHours() >= cutoffHour ? 2 : 1));
  return formatDate(t);
}

// 某去程日是否仍可新增/取消(去程日「前一天」cutoff 之前)。
// 前端即時 UX 用;真正鎖定靠後端 RLS reservation_open()(Asia/Taipei)。
export function isReservationOpen(dateStr: string, cutoffHour = 17): boolean {
  const cutoff = new Date(dateStr);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(cutoffHour, 0, 0, 0);
  return new Date() < cutoff;
}

// 班次時間正規化:Postgres time 'HH:MM:SS' → 顯示 'HH:MM'
export function fmtSlot(t: string): string {
  return t.slice(0, 5);
}
