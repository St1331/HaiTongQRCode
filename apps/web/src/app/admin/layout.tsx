'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { apiRequest, type CurrentUser } from '../../lib/api';
import { AdminSessionProvider } from '../../components/admin-session';

const links = [
  { href: '/admin/records', label: '登记记录', glyph: '▤' },
  { href: '/admin/records/new', label: '新建登记', glyph: '＋' },
  { href: '/admin/account', label: '账户安全', glyph: '◈' },
  { href: '/admin/users', label: '用户管理', glyph: '♙', admin: true },
  { href: '/admin/audit', label: '审计日志', glyph: '⌕', admin: true },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void apiRequest<CurrentUser>('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => {
        setFailed(true);
        router.replace('/login');
      });
  }, [router]);

  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    sessionStorage.removeItem('ht_csrf');
    router.replace('/login');
  }

  if (!user) {
    return (
      <main className="loading-page">
        {failed ? '正在跳转…' : '正在验证登录状态…'}
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">海</span>
          <span>HaiTong QR</span>
        </Link>
        <nav aria-label="管理导航">
          {links
            .filter((link) => !link.admin || user.role === 'SUPER_ADMIN')
            .map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={pathname === link.href ? 'active' : ''}
              >
                <span>{link.glyph}</span> {link.label}
              </Link>
            ))}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{user.displayName.slice(0, 1)}</span>
          <div>
            <strong>{user.displayName}</strong>
            <small>{user.role}</small>
          </div>
          <button onClick={logout} title="退出登录">
            ↗
          </button>
        </div>
      </aside>
      <AdminSessionProvider user={user}>
        <main className="admin-main">{children}</main>
      </AdminSessionProvider>
    </div>
  );
}
