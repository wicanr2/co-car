// 工號 ↔ email 映射(工號當 email prefix)
// 本機/測試:預設網域 test.local;正式可用 NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN 覆蓋
const DOMAIN = process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN ?? 'test.local';

export function empIdToEmail(empId: string): string {
  return `${empId.trim().toLowerCase()}@${DOMAIN}`;
}
