'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { apiRequest } from '../../../lib/api';

interface AuditItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  summary: Record<string, unknown>;
  requestId: string;
  actorDisplayName?: string;
  createdAt: string;
}

interface AuditFilters {
  actor: string;
  action: string;
  dateFrom: string;
  dateTo: string;
}

const labels: Record<string, string> = {
  AUTH_LOGIN: '用户登录',
  AUTH_LOGIN_REJECTED: '登录被拒绝',
  USER_CREATED: '创建用户',
  USER_UPDATED: '修改用户',
  USER_PASSWORD_RESET: '重置密码',
  RECORD_CREATED: '创建登记',
  RECORD_UPDATED: '编辑登记',
  RECORD_STATUS_CHANGED: '变更状态',
  RECORD_TOKEN_ROTATED: '轮换二维码',
  AUTH_PASSWORD_CHANGED: '修改密码',
};

const emptyFilters: AuditFilters = {
  actor: '',
  action: '',
  dateFrom: '',
  dateTo: '',
};

export default function AuditPage() {
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const auditQuery = useQuery({
    queryKey: ['audit-logs', filters, page],
    queryFn: async () => {
      const parameters = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });
      for (const [key, value] of Object.entries(filters)) {
        if (value) parameters.set(key, value);
      }
      return apiRequest<AuditItem[]>(`/admin/audit-logs?${parameters}`);
    },
  });
  const items = auditQuery.data?.data ?? [];
  const total = auditQuery.data?.pagination?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  }

  function update(name: keyof AuditFilters, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">安全追溯</p>
          <h1>审计日志</h1>
          <p className="muted">高风险操作只追加记录，不提供修改和删除。</p>
        </div>
      </header>
      <section className="panel">
        <form className="filters" onSubmit={applyFilters}>
          <input
            value={draft.actor}
            onChange={(event) => update('actor', event.target.value)}
            placeholder="操作者名称或账号"
            aria-label="操作者"
          />
          <select
            value={draft.action}
            onChange={(event) => update('action', event.target.value)}
            aria-label="操作类型"
          >
            <option value="">全部操作</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="compact-label">
            起始日期
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(event) => update('dateFrom', event.target.value)}
            />
          </label>
          <label className="compact-label">
            截止日期
            <input
              type="date"
              value={draft.dateTo}
              onChange={(event) => update('dateTo', event.target.value)}
            />
          </label>
          <button className="button button-dark">筛选</button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => {
              setDraft(emptyFilters);
              setFilters(emptyFilters);
              setPage(1);
            }}
          >
            清空
          </button>
        </form>
      </section>
      {auditQuery.error && (
        <div className="alert alert-error">
          {auditQuery.error instanceof Error
            ? auditQuery.error.message
            : '加载失败'}{' '}
          <button onClick={() => void auditQuery.refetch()}>重试</button>
        </div>
      )}
      <section className="panel">
        {auditQuery.isPending ? (
          <div className="empty-state">正在加载审计日志…</div>
        ) : (
          <div className="audit-list">
            {items.length === 0 ? (
              <div className="empty-state">暂无匹配的审计记录</div>
            ) : (
              items.map((item) => (
                <article key={item.id}>
                  <span className="audit-dot" />
                  <div>
                    <h2>{labels[item.action] ?? item.action}</h2>
                    <p>
                      {item.actorDisplayName ?? '系统 / 未识别用户'} ·{' '}
                      {item.resourceType}
                    </p>
                    <code>{JSON.stringify(item.summary)}</code>
                  </div>
                  <time>
                    {new Date(item.createdAt).toLocaleString('zh-CN')}
                  </time>
                </article>
              ))
            )}
          </div>
        )}
        <nav className="pagination" aria-label="审计日志分页">
          <button
            className="button button-ghost"
            disabled={page <= 1 || auditQuery.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            上一页
          </button>
          <span>
            共 {total} 条 · 第 {page} / {pageCount} 页
          </span>
          <button
            className="button button-ghost"
            disabled={page >= pageCount || auditQuery.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </button>
        </nav>
      </section>
    </>
  );
}
