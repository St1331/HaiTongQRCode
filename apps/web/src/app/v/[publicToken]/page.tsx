'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { StatusBadge } from '../../../components/status-badge';
import { ApiError, apiRequest } from '../../../lib/api';

interface PublicRecord {
  recordType: 'TENDER_DOCUMENT' | 'CONTRACT';
  recordNumber: string;
  title: string;
  issuerName: string;
  documentVersion: string;
  status: 'ACTIVE' | 'CHANGED' | 'VOID';
  businessDate: string;
  updatedAt: string;
  publicRemark?: string;
  fileSha256?: string;
  tendererName?: string;
  agencyName?: string;
  projectType?: string;
  publishDate?: string;
  counterpartyName?: string;
  amountDisplay?: string;
  signedDate?: string;
  validFrom?: string;
  validUntil?: string;
}

function PublicField({
  label,
  value,
}: {
  label: string;
  value?: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="public-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function VerificationPage() {
  const { publicToken } = useParams<{ publicToken: string }>();
  const verificationQuery = useQuery({
    queryKey: ['public-record', publicToken],
    queryFn: async () =>
      (await apiRequest<PublicRecord>(`/public/records/${publicToken}`)).data,
    retry: (attempts, error) =>
      !(error instanceof ApiError && error.status === 404) && attempts < 2,
  });
  if (verificationQuery.error) {
    const status =
      verificationQuery.error instanceof ApiError
        ? verificationQuery.error.status
        : 0;
    const heading =
      status === 404
        ? '未找到可核验记录'
        : status === 503
          ? '核验服务维护中'
          : '暂时无法完成核验';
    const guidance =
      status === 404
        ? '请确认二维码完整，并联系文件签发方核实。'
        : '请检查网络后重试；如持续失败，请联系文件签发方。';
    return (
      <main className="verify-page">
        <section className="verify-card not-found">
          <div className="verify-icon">?</div>
          <p className="eyebrow">核验结果</p>
          <h1>{heading}</h1>
          <p>{verificationQuery.error.message}</p>
          <p className="verify-warning">{guidance}</p>
          {status !== 404 && (
            <button
              className="button button-primary"
              onClick={() => void verificationQuery.refetch()}
            >
              重新查询
            </button>
          )}
        </section>
      </main>
    );
  }
  if (!verificationQuery.data)
    return (
      <main className="verify-page">
        <section className="verify-card">
          <div className="empty-state">正在安全查询登记信息…</div>
        </section>
      </main>
    );
  const record = verificationQuery.data;
  const warning =
    record.status === 'ACTIVE'
      ? '本记录当前有效，请继续逐项核对下方字段。'
      : record.status === 'CHANGED'
        ? '本文件已发生变更，请向签发方索取最新版本。'
        : '本文件已作废，请勿继续作为有效文件使用。';
  return (
    <main className={`verify-page verify-${record.status.toLowerCase()}`}>
      <nav className="verify-nav">
        <Link href="/" className="brand brand-dark">
          <span className="brand-mark">海</span>
          <span>HaiTong QR</span>
        </Link>
        <span>公开核验中心</span>
      </nav>
      <section className="verify-card">
        <div className="verify-result">
          <div className="verify-icon">
            {record.status === 'ACTIVE' ? '✓' : '!'}
          </div>
          <div>
            <p className="eyebrow">企业登记信息</p>
            <h1>
              {record.status === 'ACTIVE'
                ? '已查到有效登记'
                : record.status === 'CHANGED'
                  ? '登记已发生变更'
                  : '登记已作废'}
            </h1>
            <StatusBadge status={record.status} />
          </div>
        </div>
        <div className="verify-warning">{warning}</div>
        <h2>{record.title}</h2>
        <p className="record-number">
          {record.recordNumber} · {record.documentVersion}
        </p>
        <div className="public-grid">
          <PublicField
            label="文件类型"
            value={record.recordType === 'CONTRACT' ? '合同' : '招标文件'}
          />
          <PublicField label="登记 / 签发主体" value={record.issuerName} />
          <PublicField label="关键业务日期" value={record.businessDate} />
          {record.recordType === 'TENDER_DOCUMENT' ? (
            <>
              <PublicField label="招标人" value={record.tendererName} />
              <PublicField label="代理机构" value={record.agencyName} />
              <PublicField label="项目类型" value={record.projectType} />
              <PublicField label="发布日期" value={record.publishDate} />
            </>
          ) : (
            <>
              <PublicField label="合同相对方" value={record.counterpartyName} />
              <PublicField label="金额" value={record.amountDisplay} />
              <PublicField label="签订日期" value={record.signedDate} />
              <PublicField
                label="有效期"
                value={[record.validFrom, record.validUntil]
                  .filter(Boolean)
                  .join(' 至 ')}
              />
            </>
          )}
        </div>
        {record.publicRemark && (
          <div className="public-note">
            <span>公开备注</span>
            <p>{record.publicRemark}</p>
          </div>
        )}
        {record.fileSha256 && (
          <div className="hash">
            <span>文件 SHA-256 摘要</span>
            <code>{record.fileSha256}</code>
          </div>
        )}
        <footer className="verify-footer">
          <b>请与原文件逐项核对</b>
          <p>
            二维码可被复制。本页证明登记信息与当前状态，不替代电子签章、CA
            认证或司法鉴定。
          </p>
          <small>
            最后更新：{new Date(record.updatedAt).toLocaleString('zh-CN')}
          </small>
        </footer>
      </section>
    </main>
  );
}
