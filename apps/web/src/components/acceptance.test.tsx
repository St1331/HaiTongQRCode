import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { StatusBadge } from './status-badge';
import { RecordForm } from './record-form';
import { AdminSessionProvider } from './admin-session';
import VerificationPage from '../app/v/[publicToken]/page';
import { ApiError } from '../lib/api';

const query = vi.hoisted(() => ({
  data: undefined as unknown,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => query }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ publicToken: 'x'.repeat(32) }),
}));

beforeEach(() => {
  query.data = undefined;
  query.error = null;
});

it.each([
  ['DRAFT', '草稿'],
  ['ACTIVE', '有效'],
  ['CHANGED', '已变更'],
  ['VOID', '已作废'],
] as const)('renders readable status %s', (status, label) => {
  const html = renderToStaticMarkup(<StatusBadge status={status} />);
  expect(html).toContain('role="status"');
  expect(html).toContain(label);
});

it.each(['VIEWER', 'EDITOR', 'SUPER_ADMIN'] as const)(
  'shows appropriate form capabilities for %s',
  (role) => {
    const html = renderToStaticMarkup(
      <AdminSessionProvider
        user={{ id: 'id', username: 'user', displayName: '测试用户', role }}
      >
        <RecordForm />
      </AdminSessionProvider>,
    );
    if (role === 'VIEWER') {
      expect(html).toContain('只有查看权限');
      expect(html).not.toContain('<form');
    } else {
      expect(html).toContain('保存为草稿');
      expect(html).toContain('文件编号');
    }
  },
);

it.each([
  [404, '未找到可核验记录'],
  [503, '核验服务维护中'],
  [0, '暂时无法完成核验'],
] as const)(
  'renders public error %s and retry availability',
  (status, heading) => {
    query.error = new ApiError(status, 'TEST_ERROR', '测试错误');
    const html = renderToStaticMarkup(<VerificationPage />);
    expect(html).toContain(heading);
    expect(html.includes('重新查询')).toBe(status !== 404);
  },
);

it.each([
  ['ACTIVE', '已查到有效登记'],
  ['CHANGED', '登记已发生变更'],
  ['VOID', '登记已作废'],
] as const)('renders public %s and escapes user content', (status, heading) => {
  query.data = {
    recordType: 'CONTRACT',
    recordNumber: 'TEST-001',
    title: '<script>alert(1)</script>',
    issuerName: '测试签发方',
    documentVersion: 'V1',
    status,
    businessDate: '2026-09-07',
    updatedAt: '2026-09-07T00:00:00Z',
    counterpartyName: '测试合作方',
  };
  const html = renderToStaticMarkup(<VerificationPage />);
  expect(html).toContain(heading);
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('>金额<');
});
