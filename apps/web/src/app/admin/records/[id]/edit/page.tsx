'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { RecordForm } from '../../../../../components/record-form';
import { apiRequest, type RecordItem } from '../../../../../lib/api';

export default function EditRecordPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<RecordItem>();
  const [error, setError] = useState('');
  useEffect(() => {
    void apiRequest<RecordItem>(`/admin/records/${id}`)
      .then(({ data }) => setRecord(data))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : '加载失败'),
      );
  }, [id]);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!record) return <div className="empty-state">正在加载…</div>;
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">编辑档案</p>
          <h1>{record.title}</h1>
          <p className="muted">
            当前修订号 {record.revision}，系统会阻止并发覆盖。
          </p>
        </div>
      </header>
      <RecordForm record={record} />
    </>
  );
}
