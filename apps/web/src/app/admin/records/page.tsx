'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { StatusBadge } from '../../../components/status-badge';
import { useAdminSession } from '../../../components/admin-session';
import { apiRequest, type RecordItem } from '../../../lib/api';

function RecordsContent() {
  const user = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const currentQuery = searchParameters.get('query') ?? '';
  const currentStatus = searchParameters.get('status') ?? '';
  const currentType = searchParameters.get('type') ?? '';
  const currentDateFrom = searchParameters.get('dateFrom') ?? '';
  const currentDateTo = searchParameters.get('dateTo') ?? '';
  const pageValue = Number(searchParameters.get('page'));
  const currentPage =
    Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const currentPageSize = [10, 20, 50, 100].includes(
    Number(searchParameters.get('pageSize')),
  )
    ? Number(searchParameters.get('pageSize'))
    : 20;
  const currentSortBy = searchParameters.get('sortBy') ?? 'updatedAt';
  const currentSortOrder = searchParameters.get('sortOrder') ?? 'desc';
  const [query, setQuery] = useState(currentQuery);
  const [status, setStatus] = useState(currentStatus);
  const [type, setType] = useState(currentType);
  const [dateFrom, setDateFrom] = useState(currentDateFrom);
  const [dateTo, setDateTo] = useState(currentDateTo);
  const [filterError, setFilterError] = useState('');

  const recordsQuery = useQuery({
    staleTime: 0,
    queryKey: [
      'records',
      currentPage,
      currentQuery,
      currentStatus,
      currentType,
      currentDateFrom,
      currentDateTo,
      currentPageSize,
      currentSortBy,
      currentSortOrder,
    ],
    queryFn: async () => {
      const parameters = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(currentPageSize),
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
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
  const pageCount = Math.max(1, Math.ceil(total / currentPageSize));

  function navigate(filters: Record<string, string | number | undefined>) {
    const parameters = new URLSearchParams(searchParameters.toString());
    for (const [name, value] of Object.entries(filters)) {
      if (value === undefined || value === '') parameters.delete(name);
      else parameters.set(name, String(value));
    }
    const suffix = parameters.toString();
    if (suffix === searchParameters.toString()) {
      void recordsQuery.refetch();
    } else {
      router.push(suffix ? `${pathname}?${suffix}` : pathname, {
        scroll: false,
      });
    }
  }

  function applyFilters(overrides: Record<string, string | number> = {}) {
    const filters = {
      query: query.trim(),
      status,
      type,
      dateFrom,
      dateTo,
      page: 1,
      ...overrides,
    };
    if (
      filters.dateFrom &&
      filters.dateTo &&
      filters.dateFrom > filters.dateTo
    ) {
      setFilterError('起始日期不能晚于截止日期。');
      return;
    }
    setFilterError('');
    navigate(filters);
  }

  function search(event: FormEvent) {
    event.preventDefault();
    applyFilters();
  }

  function clearFilters() {
    setQuery('');
    setStatus('');
    setType('');
    setDateFrom('');
    setDateTo('');
    setFilterError('');
    if (!searchParameters.toString()) void recordsQuery.refetch();
    else router.push(pathname, { scroll: false });
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
        {user.role !== 'VIEWER' && (
          <Link className="button button-primary" href="/admin/records/new">
            ＋ 新建登记
          </Link>
        )}
      </header>
      <section className="panel">
        <form className="filters" onSubmit={search}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索编号或标题"
            aria-label="搜索编号或标题"
            maxLength={200}
          />
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              applyFilters({ type: event.target.value });
            }}
            aria-label="登记类型"
          >
            <option value="">全部类型</option>
            <option value="TENDER_DOCUMENT">招标文件</option>
            <option value="CONTRACT">合同</option>
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              applyFilters({ status: event.target.value });
            }}
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
              onChange={(event) => {
                setDateFrom(event.target.value);
                applyFilters({ dateFrom: event.target.value });
              }}
            />
          </label>
          <label className="compact-label">
            截止日期
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                applyFilters({ dateTo: event.target.value });
              }}
            />
          </label>
          <select
            aria-label="排序字段"
            value={currentSortBy}
            onChange={(event) => applyFilters({ sortBy: event.target.value })}
          >
            <option value="updatedAt">按更新时间</option>
            <option value="createdAt">按创建时间</option>
            <option value="recordNumber">按文件编号</option>
            <option value="businessDate">按业务日期</option>
          </select>
          <select
            aria-label="排序方向"
            value={currentSortOrder}
            onChange={(event) =>
              applyFilters({ sortOrder: event.target.value })
            }
          >
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <button
            type="submit"
            className="button button-dark"
            disabled={recordsQuery.isFetching}
          >
            {recordsQuery.isFetching ? '查询中…' : '查询'}
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={clearFilters}
          >
            清空
          </button>
        </form>
        {filterError && (
          <div className="alert alert-error" role="alert">
            {filterError}
          </div>
        )}
        {recordsQuery.error && (
          <div className="alert alert-error" role="alert">
            {recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : '加载失败'}{' '}
            <button onClick={() => void recordsQuery.refetch()}>重试</button>
          </div>
        )}
        {recordsQuery.isError ? null : recordsQuery.isPending ? (
          <div className="empty-state">正在加载登记记录…</div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <b>暂无匹配记录</b>
            <span>调整筛选条件，或创建第一条登记。</span>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="records-table">
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
          </>
        )}
        {!recordsQuery.isError && !recordsQuery.isPending && (
          <nav
            className="pagination records-pagination"
            aria-label="登记记录分页"
          >
            <select
              aria-label="每页条数"
              value={currentPageSize}
              onChange={(event) =>
                navigate({ pageSize: Number(event.target.value), page: 1 })
              }
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  每页 {size} 条
                </option>
              ))}
            </select>
            {currentPage > pageCount && (
              <button
                className="button button-ghost"
                onClick={() => navigate({ page: 1 })}
              >
                返回第一页
              </button>
            )}
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
        )}
      </section>
    </>
  );
}

function RecordsRoute() {
  const parameters = useSearchParams();
  return <RecordsContent key={parameters.toString()} />;
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="empty-state">正在加载登记记录…</div>}>
      <RecordsRoute />
    </Suspense>
  );
}
