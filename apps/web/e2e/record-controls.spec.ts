import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!username || !password) throw new Error('Test credentials are required');
  await page.goto('/login');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录工作台' }).click();
  await expect(page).toHaveURL(/\/admin\/records$/);
}

test('登记查询、即时筛选、日期校验、排序、分页、清空和重试', async ({
  page,
}) => {
  await login(page);
  const marker = `FILTER-${randomUUID().slice(0, 8)}`;
  const csrf = await page.evaluate(() => sessionStorage.getItem('ht_csrf'));
  expect(csrf).toBeTruthy();
  const headers = { 'x-csrf-token': csrf! };
  for (let index = 0; index < 12; index++) {
    const response = await page.request.post('/api/v1/admin/records', {
      headers,
      data: {
        recordType: 'CONTRACT',
        recordNumber: `${marker}-${String(index).padStart(2, '0')}`,
        title: `${marker} 筛选测试 ${index}`,
        issuerName: '自动化测试主体',
        documentVersion: 'V1.0',
        businessDate: index < 6 ? '2026-09-01' : '2026-09-07',
        counterpartyName: '测试相对方',
        signedDate: '2026-09-01',
      },
    });
    expect(response.status()).toBe(201);
    if (index % 2 === 0) {
      const record = (await response.json()).data;
      const published = await page.request.post(
        `/api/v1/admin/records/${record.id}/status`,
        {
          headers,
          data: { revision: record.revision, status: 'ACTIVE' },
        },
      );
      expect(published.status()).toBe(200);
    }
  }
  const rows = page.locator('tbody tr');
  const search = page.getByLabel('搜索编号或标题');
  await search.fill(`  ${marker}  `);
  await search.press('Enter');
  await expect(rows).toHaveCount(12);
  await expect(search).toHaveValue(marker);
  await page.getByLabel('状态', { exact: true }).selectOption('ACTIVE');
  await expect(rows).toHaveCount(6);
  await page
    .getByLabel('登记类型', { exact: true })
    .selectOption('TENDER_DOCUMENT');
  await expect(page.getByText('暂无匹配记录')).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('登记类型', { exact: true })).toHaveValue('');
  await expect(rows).toHaveCount(6);
  await page.getByLabel('登记类型', { exact: true }).selectOption('CONTRACT');
  await expect(page).toHaveURL(/type=CONTRACT/);
  await page.getByLabel('起始日期').fill('2026-09-07');
  await expect(rows).toHaveCount(3);
  await page.getByLabel('截止日期').fill('2026-09-01');
  await expect(
    page.getByRole('alert').filter({ hasText: '起始日期不能晚于截止日期' }),
  ).toBeVisible();
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/records$/);
  await expect(search).toHaveValue('');
  await expect(page.getByLabel('状态', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('起始日期')).toHaveValue('');
  await expect(page.getByLabel('截止日期')).toHaveValue('');
  await search.fill(marker);
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(rows).toHaveCount(12);
  await page.getByLabel('排序字段').selectOption('recordNumber');
  await expect(rows.first()).toContainText(`${marker}-11`);
  await page.getByLabel('排序方向').selectOption('asc');
  await expect(rows.first()).toContainText(`${marker}-00`);
  await page.getByLabel('每页条数').selectOption('10');
  await expect(rows).toHaveCount(10);
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`${marker}-10`);
  await page.getByRole('button', { name: '上一页' }).click();
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText(`${marker}-00`);
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/admin/records?') &&
      response.status() === 200,
  );
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await refreshed;
  await page.route('**/api/v1/admin/records?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: '测试服务暂时不可用' },
      }),
    }),
  );
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '测试服务暂时不可用' }),
  ).toBeVisible();
  await expect(page.getByText('暂无匹配记录')).not.toBeVisible();
  await page.unroute('**/api/v1/admin/records?*');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(rows).toHaveCount(10);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.getByLabel('每页条数')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await rows.first().getByRole('link', { name: '查看' }).click();
  await expect(
    page.getByRole('heading', { name: `${marker} 筛选测试 0`, exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '编辑信息' }).click();
  await expect(page.getByLabel('登记类型')).toBeDisabled();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/records\/[0-9a-f-]+$/);
  await page.getByRole('link', { name: '编辑信息' }).click();
  const editedTitle = `${marker} 编辑后即时可见`;
  await page.getByLabel('文件标题').fill(editedTitle);
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(
    page.getByRole('heading', { name: editedTitle, exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /登记记录$/ }).click();
  await search.fill(marker);
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.getByText(editedTitle, { exact: true })).toBeVisible();
});

test('新建表单类型切换和直接进入后取消返回列表', async ({ page }) => {
  await login(page);
  await page.goto('/admin/records/new');
  await page.getByLabel('登记类型').selectOption('CONTRACT');
  await expect(page.getByLabel('合同相对方')).toBeVisible();
  await expect(page.getByLabel('招标人', { exact: true })).not.toBeVisible();
  await page.getByLabel('登记类型').selectOption('TENDER_DOCUMENT');
  await expect(page.getByLabel('招标人', { exact: true })).toBeVisible();
  await expect(page.getByLabel('合同相对方')).not.toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/records$/);
});
