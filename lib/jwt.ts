// 解碼 JWT payload(base64url),取 hook 注入的 emp_id / is_admin
export interface AppClaims {
  emp_id?: string;
  is_admin?: boolean;
}

export function decodeClaims(accessToken: string): AppClaims {
  try {
    const payload = accessToken.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as AppClaims;
  } catch {
    return {};
  }
}
