// ── 員工檔案 ──
export interface Profile {
  account_id?: string;   // = 工號|姓名,身分鍵(改名後變動)
  emp_id: string;
  name: string;
  department?: string | null;
  is_admin: boolean;
  email?: string | null;
  active?: boolean;
  created_at?: string | null;
}

// ── 班次(發車時段 + 座位上限)──
export interface ShuttleSlot {
  departure_time: string; // 'HH:MM:SS'(Postgres time)
  capacity: number;
  active?: boolean;
  sort_order?: number;
}

// ── 接駁車營運設定 ──
export interface ShuttleConfig {
  id: string;
  cutoff_hour: number;
  service_name?: string | null;
  origin?: string | null;
  destination?: string | null;
  map_url?: string | null;
}

// ── 預約 ──
export interface Reservation {
  id?: string;
  account_id: string;      // = 工號|姓名,擁有鍵
  emp_id: string;          // 工號(顯示快照)
  emp_name?: string | null; // 姓名(顯示快照)
  date: string;            // 'YYYY-MM-DD'
  departure_time: string;  // 'HH:MM:SS'
  return_note?: string | null;
  status?: 'active' | 'cancelled';
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancelled_reason?: string | null;
  cancellation_history?: ReservationCancellation[];
  created_at?: string | null;
  // 內嵌 profile(admin 排班視角用)
  profiles?: { name: string; department?: string | null } | null;
}

export interface ReservationCancellation {
  at: string;
  by: string;
  reason?: string | null;
}

// ── 班次可用座位(get_slot_availability RPC 回傳)──
export interface SlotAvailability {
  departure_time: string;
  capacity: number;
  booked: number;
  seats_left: number;
}
