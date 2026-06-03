// (工號, 姓名) ↔ account_id / email 映射。
//
// account_id = 工號|姓名,是預約擁有鍵,可由 (工號,姓名) 純函數推導。
// email 則是「不可變的 opaque 值」,只在帳號建立時挑一次、之後不再改:
//   - 優先用 legacyEmail(工號@domain),與既有雲端資料格式一致(無痕);
//   - 僅當同工號已被別的姓名占用時,才退到 disambigEmail(工號.hex(姓名)@domain)。
// 登入端不靠公式推 email,而是用 account_id 查 profile 取回既存 email。
//
// 本機/測試:預設網域 test.local;正式可用 NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN 覆蓋。
const DOMAIN = process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN ?? 'test.local';

export function accountId(empId: string, name: string): string {
  return `${empId.trim()}|${name.trim()}`;
}

// 舊格式:工號@domain(與既有雲端 auth 帳號一致)
export function legacyEmail(empId: string): string {
  return `${empId.trim().toLowerCase()}@${DOMAIN}`;
}

// 撞名退路:工號.hex(姓名)@domain(中文姓名 → UTF-8 byte 的小寫 hex)
export function disambigEmail(empId: string, name: string): string {
  const hex = Array.from(new TextEncoder().encode(name.trim()))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${empId.trim().toLowerCase()}.${hex}@${DOMAIN}`;
}

// 向後相容別名:等同 legacyEmail(舊呼叫點仍可使用)
export const empIdToEmail = legacyEmail;
