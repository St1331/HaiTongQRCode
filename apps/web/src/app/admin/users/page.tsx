'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { apiRequest } from '../../../lib/api';

interface UserItem {
  id: string;
  username: string;
  displayName: string;
  role: 'SUPER_ADMIN' | 'EDITOR' | 'VIEWER';
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt?: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    try {
      setError('');
      setUsers((await apiRequest<UserItem[]>('/admin/users')).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  }, []);
  useEffect(() => {
    void apiRequest<UserItem[]>('/admin/users')
      .then(({ data }) => setUsers(data))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : '加载失败'),
      );
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: form.get('username'),
          displayName: form.get('displayName'),
          password: form.get('password'),
          role: form.get('role'),
        }),
      });
      setShowForm(false);
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建失败');
    }
  }
  async function toggle(user: UserItem) {
    if (
      !window.confirm(
        `确定${user.status === 'ACTIVE' ? '停用' : '启用'} ${user.displayName}？`,
      )
    )
      return;
    try {
      await apiRequest(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
        }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '修改失败');
    }
  }

  async function changeRole(user: UserItem, role: UserItem['role']) {
    if (role === user.role) return;
    if (!window.confirm(`确定将 ${user.displayName} 的角色改为 ${role}？`))
      return;
    try {
      await apiRequest(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '角色修改失败');
    }
  }

  async function resetPassword(user: UserItem) {
    const password = window.prompt(
      `请输入 ${user.displayName} 的新密码（至少 12 个字符）`,
    );
    if (!password) return;
    if (password.length < 12) {
      setError('新密码至少需要 12 个字符');
      return;
    }
    if (!window.confirm('重置密码会撤销该用户的全部会话，确定继续吗？')) return;
    try {
      await apiRequest(`/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setError('');
      window.alert('密码已重置，该用户需要重新登录。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '密码重置失败');
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">系统设置</p>
          <h1>用户管理</h1>
          <p className="muted">创建后台账户并按最小权限原则分配角色。</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => setShowForm(!showForm)}
        >
          ＋ 创建用户
        </button>
      </header>
      {error && <div className="alert alert-error">{error}</div>}
      {showForm && (
        <section className="panel compact-panel">
          <form className="inline-create" onSubmit={create}>
            <label>
              用户名
              <input name="username" required minLength={3} />
            </label>
            <label>
              显示名称
              <input name="displayName" required />
            </label>
            <label>
              初始密码
              <input name="password" type="password" required minLength={12} />
            </label>
            <label>
              角色
              <select name="role">
                <option value="VIEWER">只读人员</option>
                <option value="EDITOR">编辑人员</option>
                <option value="SUPER_ADMIN">超级管理员</option>
              </select>
            </label>
            <button className="button button-dark">保存</button>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户</th>
                <th>角色</th>
                <th>状态</th>
                <th>最后登录</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.displayName}</strong>
                    <small>@{user.username}</small>
                  </td>
                  <td>
                    <select
                      value={user.role}
                      aria-label={`修改 ${user.displayName} 的角色`}
                      onChange={(event) =>
                        void changeRole(
                          user,
                          event.target.value as UserItem['role'],
                        )
                      }
                    >
                      <option value="VIEWER">只读人员</option>
                      <option value="EDITOR">编辑人员</option>
                      <option value="SUPER_ADMIN">超级管理员</option>
                    </select>
                  </td>
                  <td>
                    <span
                      className={`status ${user.status === 'ACTIVE' ? 'status-active' : 'status-void'}`}
                    >
                      ● {user.status === 'ACTIVE' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString('zh-CN')
                      : '从未登录'}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="text-link"
                        onClick={() => void resetPassword(user)}
                      >
                        重置密码
                      </button>
                      <button
                        className="text-link"
                        onClick={() => void toggle(user)}
                      >
                        {user.status === 'ACTIVE' ? '停用' : '启用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
