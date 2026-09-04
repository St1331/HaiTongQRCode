'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { StatusBadge } from '../../../components/status-badge';
import { apiRequest, type RecordItem } from '../../../lib/api';

function RecordsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const currentQuery = searchParameters.get('query') ?? '';
  const currentStatus = searchParameters.get('status') ?? '';
  const currentType = searchParameters.get('type') ?? '';
  const currentDateFrom = searchParameters.get('dateFrom') ?? '';
  const currentDateTo = searchParameters.get('dateTo') ?? '';
  const currentPage = Math.max(1, Number(searchParameters.get('page')) || 1);
  const [query, setQuery] = useState(currentQuery);
  const [status, setStatus] = useState(currentStatus);
  const [type, setType] = useState(currentType);
  const [dateFrom, setDateFrom] = useState(currentDateFrom);
  const [dateTo, setDateTo] = useState(currentDateTo);

  const recordsQuery = useQuery({
    queryKey: [
      'records',
      currentPage,
      currentQuery,
      currentStatus,
      currentType,
      currentDateFrom,
      currentDateTo,
    ],
    queryFn: async () => {
      const parameters = new URLSearchParams({
        page: String(currentPage),
        pageSize: '20',
      });
      if (currentQuery) parameters.set('query', currentQuery);
      if (currentStatus) parameters.set('status', currentStatus);
      if (currentType) parameters.set('type', currentType);
      if (currentDateFrom) parameters.set('dateFrom', currentDateFrom);
      if (currentDateTo) parameters.set('dateTo', currentDateTo);
      return apiRequest<RecordItem[]>(`/admin/records?${parameters}`);
    },
  });

  const records = recordsQuery.data?.data ?? [];
  const total = recordsQuery.data?.pagination?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  function navigate(filters: Record<string, string | number | undefined>) {
    const parameters = new URLSearchParams(searchParameters.toString());
    for (const [name, value] of Object.entries(filters)) {
      if (value === undefined || value === '') parameters.delete(name);
      else parameters.set(name, String(value));
    }
    const suffix = parameters.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  }

  function search(event: FormEvent) {
    event.preventDefault();
    navigate({ query, status, type, dateFrom, dateTo, page: 1 });
  }

  function clearFilters() {
    setQuery('');
    setStatus('');
    setType('');
    setDateFrom('');
    setDateTo('');
    router.replace(pathname);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">业务管理</p>
          <h1>登记记录</h1>
          <p className="muted">
            共 {total} 条文件档案，公开状态始终以系统记录为准。
          </p>
        </div>
        <Link className="button button-primary" href="/admin/records/new">
          ＋ 新建登记
        </Link>
      </header>
      <section className="panel">
        <form className="filters" onSubmit={search}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索编号或标题"
            aria-label="搜索编号或标题"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            aria-label="登记类型"
          >
            <option value="">全部类型</option>
            <option value="TENDER_DOCUMENT">招标文件</option>
            <option value="CONTRACT">合同</option>
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="状态"
          >
            <option value="">全部状态</option>
            <option value="DRAFT">草稿</option>
            <option value="ACTIVE">有效</option>
            <option value="CHANGED">已变更</option>
            <option value="VOID">已作废</option>
          </select>
          <label className="compact-label">
            起始日期
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="compact-label">
            截止日期
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <button className="button button-dark">查询</button>
          <button
            type="button"
            className="button button-ghost"
            onClick={clearFilters}
          >
            清空
          </button>
        </form>
        {recordsQuery.error && (
          <div className="alert alert-error">
            {recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : '加载失败'}{' '}
            <button onClick={() => void recordsQuery.refetch()}>重试</button>
          </div>
        )}
        {recordsQuery.isPending ? (
          <div className="empty-state">正在加载登记记录…</div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <b>暂无匹配记录</b>
            <span>调整筛选条件，或创建第一条登记。</span>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>类型</th>
                    <th>版本</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.title}</strong>
                        <small>{record.recordNumber}</small>
                      </td>
                      <td>
                        {record.recordType === 'CONTRACT' ? '合同' : '招标文件'}
                      </td>
                      <td>{record.documentVersion}</td>
                      <td>
                        <StatusBadge status={record.status} />
                      </td>
                      <td>
                        {new Date(record.updatedAt).toLocaleString('zh-CN')}
                      </td>
                      <td>
                        <Link
                          className="text-link"
                          href={`/admin/records/${record.id}`}
                        >
                          查看 →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="登记记录分页">
              <button
                className="button button-ghost"
                disabled={currentPage <= 1 || recordsQuery.isFetching}
                onClick={() => navigate({ page: currentPage - 1 })}
              >
                上一页
              </button>
              <span>
                第 {currentPage} / {pageCount} 页
              </span>
              <button
                className="button button-ghost"
                disabled={currentPage >= pageCount || recordsQuery.isFetching}
                onClick={() => navigate({ page: currentPage + 1 })}
              >
                下一页
              </button>
            </nav>
          </>
        )}
      </section>
    </>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="empty-state">正在加载登记记录…</div>}>
      <RecordsContent />
    </Suspense>
  );
}
