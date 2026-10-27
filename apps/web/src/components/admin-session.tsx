'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { CurrentUser } from '../lib/api';

const AdminSessionContext = createContext<CurrentUser | null>(null);

export function AdminSessionProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: ReactNode;
}) {
  return (
    <AdminSessionContext.Provider value={user}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession(): CurrentUser {
  const user = useContext(AdminSessionContext);
  if (!user) throw new Error('Admin session is not available.');
  return user;
}
