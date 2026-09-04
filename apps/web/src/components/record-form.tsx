'use client';

import { createRecordSchema, updateRecordSchema } from '@haitong/shared';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';

import { ApiError, apiRequest, type RecordItem } from '../lib/api';
import { useAdminSession } from './admin-session';

interface FormValues {
  recordType: RecordItem['recordType'];
  recordNumber: string;
  title: string;
  issuerName: string;
  documentVersion: string;
  businessDate: string;
  fileSha256: string;
  publicRemark: string;
  internalNote: string;
  tendererName: string;
  agencyName: string;
  projectType: string;
  publishDate: string;
  counterpartyName: string;
  amountDisplay: string;
  signedDate: string;
  validFrom: string;
  validUntil: string;
}

const emptyValues: FormValues = {
  recordType: 'TENDER_DOCUMENT',
  recordNumber: '',
  title: '',
  issuerName: '',
  documentVersion: 'V1.0',
  businessDate: '',
  fileSha256: '',
  publicRemark: '',
  internalNote: '',
  tendererName: '',
  agencyName: '',
  projectType: '',
  publishDate: '',
  counterpartyName: '',
  amountDisplay: '',
  signedDate: '',
  validFrom: '',
  validUntil: '',
};

function defaultValues(record?: RecordItem): FormValues {
  if (!record) return emptyValues;
  const value = (key: keyof RecordItem) => String(record[key] ?? '');
  return {
    recordType: record.recordType,
    recordNumber: record.recordNumber,
    title: record.title,
    issuerName: record.issuerName,
    documentVersion: record.documentVersion,
    businessDate: record.businessDate,
    fileSha256: value('fileSha256'),
    publicRemark: value('publicRemark'),
    internalNote: value('internalNote'),
    tendererName: value('tendererName'),
    agencyName: value('agencyName'),
    projectType: value('projectType'),
    publishDate: value('publishDate'),
    counterpartyName: value('counterpartyName'),
    amountDisplay: value('amountDisplay'),
    signedDate: value('signedDate'),
    validFrom: value('validFrom'),
    validUntil: value('validUntil'),
  };
}

export function RecordForm({ record }: { record?: RecordItem }) {
  const router = useRouter();
  const user = useAdminSession();
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: defaultValues(record),
    shouldUnregister: true,
  });
  const watchedType = useWatch({ control, name: 'recordType' });
  const type = record?.recordType ?? watchedType;

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const warnBeforeLink = (event: MouseEvent) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest('a') : null;
      if (
        link?.href.startsWith(window.location.origin) &&
        !window.confirm('当前修改尚未保存，确定离开吗？')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnBeforeLink, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', warnBeforeLink, true);
    };
  }, [isDirty]);

  const submit = handleSubmit(async (values) => {
    const selectedType = record?.recordType ?? values.recordType;
    const present = (value: string) => value.trim() || undefined;
    const nullable = (value: string) =>
      value.trim() || (record ? null : undefined);
    const common = {
      recordNumber: values.recordNumber,
      title: values.title,
      issuerName: values.issuerName,
      documentVersion: values.documentVersion,
      businessDate: values.businessDate,
      fileSha256: nullable(values.fileSha256),
      publicRemark: nullable(values.publicRemark),
      internalNote: nullable(values.internalNote),
    };
    const typed =
      selectedType === 'TENDER_DOCUMENT'
        ? {
            ...common,
            recordType: selectedType,
            tendererName: values.tendererName,
            agencyName: nullable(values.agencyName),
            projectType: values.projectType,
            publishDate: values.publishDate,
          }
        : {
            ...common,
            recordType: selectedType,
            counterpartyName: values.counterpartyName,
            amountDisplay: nullable(values.amountDisplay),
            signedDate: values.signedDate,
            validFrom: present(values.validFrom) ?? (record ? null : undefined),
            validUntil:
              present(values.validUntil) ?? (record ? null : undefined),
          };
    const body = record ? { ...typed, revision: record.revision } : typed;
    const parsed = record
      ? updateRecordSchema.safeParse(body)
      : createRecordSchema.safeParse(body);
    if (!parsed.success) {
      setError('root', {
        type: 'validate',
        message: parsed.error.issues[0]?.message ?? '请检查表单内容',
      });
      return;
    }
    try {
      const result = await apiRequest<RecordItem>(
        record ? `/admin/records/${record.id}` : '/admin/records',
        {
          method: record ? 'PATCH' : 'POST',
          body: JSON.stringify(parsed.data),
        },
      );
      reset(values);
      router.push(`/admin/records/${result.data.id}`);
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.code === 'DOCUMENT_CONFLICT'
          ? '该记录已被其他用户修改，请返回详情页刷新后再编辑。'
          : caught instanceof Error
            ? caught.message
            : '保存失败';
      setError('root', { type: 'server', message });
    }
  });

  function cancel() {
    if (isDirty && !window.confirm('当前修改尚未保存，确定离开吗？')) return;
    reset();
    router.back();
  }

  if (user.role === 'VIEWER') {
    return (
      <div className="alert alert-error" role="alert">
        当前账户只有查看权限，不能新建或编辑登记记录。
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="record-form" noValidate>
      <section className="form-section">
        <div className="section-title">
          <span>01</span>
          <div>
            <h2>基础信息</h2>
            <p>这些字段会用于公众扫码后的信息比对。</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            登记类型
            <select {...register('recordType')} disabled={Boolean(record)}>
              <option value="TENDER_DOCUMENT">招标文件</option>
              <option value="CONTRACT">合同</option>
            </select>
          </label>
          <label>
            文件编号
            <input
              {...register('recordNumber', { required: true })}
              maxLength={100}
              placeholder="如 HT-ZB-2026-001"
            />
          </label>
          <label className="span-2">
            文件标题
            <input {...register('title', { required: true })} maxLength={200} />
          </label>
          <label>
            登记 / 签发主体
            <input
              {...register('issuerName', { required: true })}
              maxLength={200}
            />
          </label>
          <label>
            文件版本
            <input
              {...register('documentVersion', { required: true })}
              maxLength={30}
              placeholder="如 V1.0"
            />
          </label>
          <label>
            关键业务日期
            <input
              {...register('businessDate', { required: true })}
              type="date"
            />
          </label>
          <label>
            文件 SHA-256（可选）
            <input {...register('fileSha256')} maxLength={64} />
          </label>
        </div>
      </section>
      <section className="form-section">
        <div className="section-title">
          <span>02</span>
          <div>
            <h2>{type === 'TENDER_DOCUMENT' ? '招标信息' : '合同信息'}</h2>
            <p>根据登记类型填写对应的关键事实。</p>
          </div>
        </div>
        {type === 'TENDER_DOCUMENT' ? (
          <div className="form-grid">
            <label>
              招标人
              <input {...register('tendererName', { required: true })} />
            </label>
            <label>
              代理机构
              <input {...register('agencyName')} />
            </label>
            <label>
              项目类型
              <input {...register('projectType', { required: true })} />
            </label>
            <label>
              发布日期
              <input
                {...register('publishDate', { required: true })}
                type="date"
              />
            </label>
          </div>
        ) : (
          <div className="form-grid">
            <label>
              合同相对方
              <input {...register('counterpartyName', { required: true })} />
            </label>
            <label>
              金额展示文本（默认不公开）
              <input {...register('amountDisplay')} />
            </label>
            <label>
              签订日期
              <input
                {...register('signedDate', { required: true })}
                type="date"
              />
            </label>
            <label>
              有效期开始
              <input {...register('validFrom')} type="date" />
            </label>
            <label>
              有效期结束
              <input {...register('validUntil')} type="date" />
            </label>
          </div>
        )}
      </section>
      <section className="form-section">
        <div className="section-title">
          <span>03</span>
          <div>
            <h2>补充说明</h2>
            <p>公开备注会显示在核验页，内部说明仅后台可见。</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="span-2">
            公开备注
            <textarea {...register('publicRemark')} maxLength={1000} />
          </label>
          <label className="span-2">
            内部说明
            <textarea {...register('internalNote')} maxLength={2000} />
          </label>
        </div>
      </section>
      {errors.root?.message && (
        <div className="alert alert-error">{errors.root.message}</div>
      )}
      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={cancel}>
          取消
        </button>
        <button className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? '正在保存…' : record ? '保存修改' : '保存为草稿'}
        </button>
      </div>
    </form>
  );
}
