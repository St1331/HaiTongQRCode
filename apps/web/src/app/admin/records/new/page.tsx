import { RecordForm } from '../../../../components/record-form';

export default function NewRecordPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">新建档案</p>
          <h1>登记文件信息</h1>
          <p className="muted">保存后记录处于草稿状态，确认无误再发布。</p>
        </div>
      </header>
      <RecordForm />
    </>
  );
}
