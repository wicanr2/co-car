// 解碼 JWT payload(base64url),取 hook 注入的身分 claims
export interface AppClaims {
  acct?: string;    // account_id = 工號|姓名,預約擁有鍵
  emp_id?: string;  // 工號(顯示用)
  name?: string;    // 中文姓名(顯示用)
  is_admin?: boolean;
}

export function decodeClaims(accessToken: string): AppClaims {
  try {
    const payload = accessToken.split('.')[1];
    const bin = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    // atob 回傳 Latin-1 binary string;中文 claim(name / acct)是 UTF-8,
    // 必須還原成 bytes 再以 UTF-8 解碼,否則會變亂碼且 acct 對不上資料庫
    // (中文姓名的使用者預約會被 RLS 擋掉)。
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(json) as AppClaims;
  } catch {
    return {};
  }
}
