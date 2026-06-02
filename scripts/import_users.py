#!/usr/bin/env python3
"""從 xlsx 匯入使用者到 Supabase(無密碼模式:中文姓名即登入憑證)。
stdlib only。環境變數:SUPABASE_URL、SERVICE_KEY、DOMAIN(預設 test.local)、XLSX。
每位員工:建 auth user(password=姓名,email_confirm)+ upsert profile(is_admin=false)。
"""
import os, json, zipfile, urllib.request, urllib.error
from xml.etree import ElementTree as ET

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SERVICE_KEY']
DOMAIN = os.environ.get('DOMAIN', 'test.local')
XLSX = os.environ.get('XLSX', '訂餐系統使用者@20260602.xlsx')
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def parse_xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in ss:
        shared.append(''.join((t.text or '') for t in si.iter(NS + 't')))
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in sheet.iter(NS + 'row'):
        cells = []
        for c in row.iter(NS + 'c'):
            v = c.find(NS + 'v'); t = c.get('t'); val = ''
            if v is not None and v.text is not None:
                val = shared[int(v.text)] if t == 's' else v.text
            cells.append(val)
        rows.append(cells)
    return rows


def find_user_id(email):
    # 分頁列出 auth users,以 email 反查 id
    st, bd = req('GET', '/auth/v1/admin/users?page=1&per_page=2000')
    if st != 200:
        return None
    data = json.loads(bd)
    users = data.get('users', data) if isinstance(data, dict) else data
    for u in users:
        if (u.get('email') or '').lower() == email.lower():
            return u.get('id')
    return None


def req(method, path, body=None, extra=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if extra:
        h.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


rows = parse_xlsx(XLSX)
header = rows[0]
idx = {n: i for i, n in enumerate(header)}
di = idx.get('部門名稱', 1); ei = idx.get('工號', 2); ni = idx.get('姓名', 3)

ok = exist = fail = 0
for r in rows[1:]:
    if len(r) <= max(ei, ni):
        continue
    emp = (r[ei] or '').strip()
    name = (r[ni] or '').strip()
    dept = (r[di] or '').strip() if di < len(r) else ''
    if not emp or not name:
        continue
    email = f"{emp.lower()}@{DOMAIN}"

    st, bd = req('POST', '/auth/v1/admin/users',
                 {'email': email, 'password': name, 'email_confirm': True,
                  'user_metadata': {'emp_id': emp, 'name': name}})
    created = st in (200, 201)
    if not created and ('already' in bd.lower() or 'registered' in bd.lower() or st == 422):
        # 已存在 → 更新 password=姓名(確保無密碼模式憑證正確)
        uid = find_user_id(email)
        if uid:
            req('PUT', f'/auth/v1/admin/users/{uid}',
                {'password': name, 'email_confirm': True,
                 'user_metadata': {'emp_id': emp, 'name': name}})
        exist += 1
    elif not created:
        print(f'FAIL auth {emp} {name}: {st} {bd[:140]}'); fail += 1; continue

    st, bd = req('POST', '/rest/v1/profiles',
                 {'emp_id': emp, 'name': name, 'department': dept,
                  'is_admin': False, 'email': email, 'active': True},
                 {'Prefer': 'resolution=merge-duplicates'})
    if st not in (200, 201, 204):
        print(f'FAIL profile {emp}: {st} {bd[:140]}'); fail += 1; continue
    if created:
        ok += 1

print(f'DONE  新建={ok}  已存在={exist}  失敗={fail}  資料列={len(rows) - 1}')
