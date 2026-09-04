'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { StatusBadge } from '../../../../components/status-badge';
import { useAdminSession } from '../../../../components/admin-session';
import { API_BASE, apiRequest, type RecordItem } from '../../../../lib/api';

interface RecordVersion {
  versionNo: number;
  snapshot: { status?: string; title?: string; documentVersion?: string };
  changeReason?: string;
  createdAt: string;
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null | undefined;
}) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAdminSession();
  const [record, setRecord] = useState<RecordItem>();
  const [versions, setVersions] = useState<RecordVersion[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [recordResult, versionResult] = await Promise.all([
        apiRequest<RecordItem>(`/admin/records/${id}`),
        apiRequest<RecordVersion[]>(`/admin/records/${id}/versions`),
      ]);
      setRecord(recordResult.data);
      setVersions(versionResult.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  }, [id]);
  useEffect(() => {
    void Promise.all([
      apiRequest<RecordItem>(`/admin/records/${id}`),
      apiRequest<RecordVersion[]>(`/admin/records/${id}/versions`),
    ])
      .then(([recordResult, versionResult]) => {
        setRecord(recordResult.data);
        setVersions(versionResult.data);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : '加载失败'),
      );
  }, [id]);

  async function changeStatus(status: RecordItem['status']) {
    if (!record) return;
    const reason =
      status === 'CHANGED' || status === 'VOID'
        ? window.prompt(
            `请输入${status === 'VOID' ? '作废' : '变更'}原因（至少 5 个字符）`,
          )
        : undefined;
    if ((status === 'CHANGED' || status === 'VOID') && !reason) return;
    if (!window.confirm('状态变更会立即反映到公众核验页，确定继续吗？')) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<RecordItem>(
        `/admin/records/${id}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ revision: record.revision, status, reason }),
        },
      );
      setRecord(result.data);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '状态变更失败');
    } finally {
      setBusy(false);
    }
  }

  async function rotateToken() {
    if (
      !record ||
      !window.confirm(
        '轮换后旧二维码将立即失效。仅在二维码疑似泄露时执行，确定继续吗？',
      )
    )
      return;
    setBusy(true);
    try {
      const result = await apiRequest<RecordItem>(
        `/admin/records/${id}/rotate-token`,
        { method: 'POST', body: JSON.stringify({ revision: record.revision }) },
      );
      setRecord(result.data);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '令牌轮换失败');
    } finally {
      setBusy(false);
    }
  }

  if (error && !record)
    return (
      <div className="alert alert-error">
        {error} <button onClick={() => void load()}>重试</button>
      </div>
    );
  if (!record) return <div className="empty-state">正在加载文件档案…</div>;
  const transitions =
    record.status === 'DRAFT'
      ? ['ACTIVE', 'VOID']
      : record.status === 'ACTIVE'
        ? ['CHANGED', 'VOID']
        : record.status === 'CHANGED'
          ? ['ACTIVE', 'VOID']
          : [];
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {record.recordType === 'CONTRACT' ? '合同' : '招标文件'} ·{' '}
            {record.recordNumber}
          </p>
          <h1>{record.title}</h1>
          <div className="headline-meta">
            <StatusBadge status={record.status} />
            <span>修订 #{record.revision}</span>
          </div>
        </div>
        <div className="header-actions">
          {user.role !== 'VIEWER' && (
            <Link
              className="button button-ghost"
              href={`/admin/records/${id}/edit`}
            >
              编辑信息
            </Link>
          )}
          {user.role !== 'VIEWER' &&
            transitions.map((status) => (
              <button
                key={status}
                disabled={busy}
                className={
                  status === 'VOID'
                    ? 'button button-danger'
                    : 'button button-dark'
                }
                onClick={() =>
                  void changeStatus(status as RecordItem['status'])
                }
              >
                {status === 'ACTIVE'
                  ? '发布为有效'
                  : status === 'CHANGED'
                    ? '标记变更'
                    : '作废'}
              </button>
            ))}
        </div>
      </header>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="detail-layout">
        <section className="panel detail-panel">
          <h2>登记信息</h2>
          <div className="detail-grid">
            <Field label="文件编号" value={record.recordNumber} />
            <Field label="文件版本" value={record.documentVersion} />
            <Field label="登记 / 签发主体" value={record.issuerName} />
            <Field label="关键业务日期" value={record.businessDate} />
            {record.recordType === 'TENDER_DOCUMENT' ? (
              <>
                <Field label="招标人" value={record.tendererName} />
                <Field label="代理机构" value={record.agencyName} />
                <Field label="项目类型" value={record.projectType} />
                <Field label="发布日期" value={record.publishDate} />
              </>
            ) : (
              <>
                <Field label="合同相对方" value={record.counterpartyName} />
                <Field label="金额展示文本" value={record.amountDisplay} />
                <Field label="签订日期" value={record.signedDate} />
                <Field
                  label="有效期"
                  value={[record.validFrom, record.validUntil]
                    .filter(Boolean)
                    .join(' 至 ')}
                />
              </>
            )}
          </div>
          <div className="note-block">
            <span>公开备注</span>
            <p>{record.publicRemark || '暂无公开备注'}</p>
          </div>
          <div className="note-block internal">
            <span>内部说明</span>
            <p>{record.internalNote || '暂无内部说明'}</p>
          </div>
          {record.fileSha256 && (
            <div className="hash">
              <span>文件 SHA-256</span>
              <code>{record.fileSha256}</code>
            </div>
          )}
        </section>
        <aside className="panel qr-panel">
          <p className="eyebrow">公开核验二维码</p>
          <div className="qr-record-label">
            <strong>{record.recordNumber}</strong>
            <span>{record.title}</span>
          </div>
          <div className="qr-frame">
            {/* The protected endpoint must receive the browser session cookie directly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_BASE}/admin/records/${id}/qrcode`}
              alt={`${record.recordNumber} 核验二维码`}
            />
          </div>
          <p className="muted small">
            打印或嵌入文件前，请使用手机扫码检查公开信息。
          </p>
          <a
            href={record.verificationUrl}
            target="_blank"
            rel="noreferrer"
            className="button button-primary full"
          >
            打开核验页
          </a>
          <a
            href={`${API_BASE}/admin/records/${id}/qrcode`}
            download
            className="button button-ghost full"
          >
            下载 PNG
          </a>
          <button
            type="button"
            className="button button-ghost full"
            onClick={() => window.print()}
          >
            打印预览
          </button>
          {user.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => void rotateToken()}
              disabled={busy}
              className="text-danger"
            >
              轮换公开二维码
            </button>
          )}
        </aside>
      </div>
      <section className="panel version-panel">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">信息追溯</p>
            <h2>历史版本</h2>
          </div>
          <span className="muted">共 {versions.length} 个公开快照</span>
        </div>
        {versions.length === 0 ? (
          <div className="empty-state">暂无历史版本</div>
        ) : (
          <ol className="version-list">
            {versions.map((version) => (
              <li key={version.versionNo}>
                <span className="version-number">V{version.versionNo}</span>
                <div>
                  <strong>
                    {version.snapshot.title ?? record.title} ·{' '}
                    {version.snapshot.documentVersion ?? record.documentVersion}
                  </strong>
                  <p>{version.changeReason || '公开信息更新'}</p>
                </div>
                <time>
                  {new Date(version.createdAt).toLocaleString('zh-CN')}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
