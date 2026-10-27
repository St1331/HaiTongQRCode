import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
if (!username || !password)
  throw new Error('E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD are required');

async function login(page: Page, user = username!, secret = password!) {
  await page.goto('/login');
  await page.getByLabel('用户名').fill(user);
  await page.getByLabel('密码').fill(secret);
  await page.getByRole('button', { name: '登录工作台' }).click();
  await expect(page).toHaveURL(/\/admin\/records$/);
}

async function fillContract(page: Page) {
  await page.goto('/admin/records/new');
  await page.getByLabel('登记类型').selectOption('CONTRACT');
  await page.getByLabel('文件编号').fill(`E2E-${randomUUID()}`);
  await page.getByLabel('文件标题').fill('合同浏览器验收');
  await page.getByLabel('登记 / 签发主体').fill('测试签发中心');
  await page.getByLabel('关键业务日期').fill('2026-09-07');
  await page.getByLabel('合同相对方').fill('测试合作方');
  await page.getByLabel('签订日期').fill('2026-09-07');
  await page.getByLabel('金额展示文本').fill('500万元');
}

test('合同发布、冲突保护、作废及二维码轮换', async ({ page, context }) => {
  await login(page);
  await fillContract(page);
  await page.getByRole('button', { name: '保存为草稿' }).click();
  await expect(page).toHaveURL(/\/admin\/records\/[0-9a-f-]+$/);
  const detail = page.url();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '发布为有效' }).click();
  await expect(page.getByRole('status')).toContainText('有效');
  const oldLink = await page
    .getByRole('link', { name: '打开核验页' })
    .getAttribute('href');
  const oldImage = await page
    .getByRole('img', { name: /核验二维码/ })
    .getAttribute('src');
  const publicPage = await context.newPage();
  await publicPage.goto(oldLink!);
  await expect(
    publicPage.getByRole('heading', { name: '已查到有效登记' }),
  ).toBeVisible();
  await expect(publicPage.getByText('500万元')).not.toBeVisible();

  const concurrent = await context.newPage();
  await page.goto(`${detail}/edit`);
  await concurrent.goto(`${detail}/edit`);
  await expect(page.getByLabel('文件标题')).toHaveValue('合同浏览器验收');
  await expect(concurrent.getByLabel('文件标题')).toHaveValue('合同浏览器验收');
  await concurrent.getByLabel('文件标题').fill('另一个窗口已修订');
  await concurrent.getByRole('button', { name: '保存修改' }).click();
  await expect(concurrent).toHaveURL(detail);
  await page.getByLabel('文件标题').fill('不应覆盖的新内容');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '已被其他用户修改' }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.goto(detail);
  await expect(
    page.getByRole('heading', { name: '另一个窗口已修订' }),
  ).toBeVisible();
  await publicPage.reload();
  await expect(publicPage.getByText('另一个窗口已修订')).toBeVisible();

  page.on('dialog', (dialog) =>
    dialog.accept(dialog.type() === 'prompt' ? '测试合同停止使用' : undefined),
  );
  await page.getByRole('button', { name: '作废', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已作废');
  await publicPage.reload();
  await expect(
    publicPage.getByRole('heading', { name: '登记已作废' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '轮换公开二维码' }).click();
  await expect(
    page.getByRole('link', { name: '打开核验页' }),
  ).not.toHaveAttribute('href', oldLink!);
  await expect(
    page.getByRole('img', { name: /核验二维码/ }),
  ).not.toHaveAttribute('src', oldImage!);
  await publicPage.reload();
  await expect(
    publicPage.getByRole('heading', { name: '未找到可核验记录' }),
  ).toBeVisible();
  const newLink = await page
    .getByRole('link', { name: '打开核验页' })
    .getAttribute('href');
  await publicPage.goto(newLink!);
  await expect(
    publicPage.getByRole('heading', { name: '登记已作废' }),
  ).toBeVisible();
});

test('必填校验、未保存离开保护和防重复提交', async ({ page }) => {
  await login(page);
  await page.goto('/admin/records/new');
  await page.getByRole('button', { name: '保存为草稿' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '必填字段' }),
  ).toBeVisible();
  await fillContract(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(/\/new$/);
  let posts = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/records', async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      await gate;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: '保存为草稿' }).click();
  await expect(page.getByRole('button', { name: '正在保存…' })).toBeDisabled();
  release!();
  await expect(page).toHaveURL(/\/admin\/records\/[0-9a-f-]+$/);
  expect(posts).toBe(1);
});

test('Viewer 只读展示及过期会话退出后台', async ({
  page,
  playwright,
  baseURL,
}) => {
  if (!baseURL) throw new Error('E2E baseURL is required');
  const admin = await playwright.request.newContext({ baseURL });
  try {
    const auth = await admin.post('/api/v1/auth/login', {
      data: { username, password },
    });
    expect(auth.ok()).toBe(true);
    const { csrfToken } = (await auth.json()) as { csrfToken: string };
    const viewer = `viewer_${randomUUID().slice(0, 8)}`;
    const created = await admin.post('/api/v1/admin/users', {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        username: viewer,
        displayName: '只读验收',
        password,
        role: 'VIEWER',
      },
    });
    expect(created.status()).toBe(201);
    await login(page, viewer, password);
    await expect(page.getByRole('link', { name: /新建登记/ })).toHaveCount(0);
    await page.goto('/admin/records/new');
    await expect(
      page.getByRole('alert').filter({ hasText: '只有查看权限' }),
    ).toBeVisible();
    await page.context().clearCookies();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await admin.dispose();
  }
});

test('公开页支持维护、网络错误重试和移动文本放大', async ({ page }) => {
  const token = 'x'.repeat(32);
  await page.route('**/api/v1/public/records/*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/html',
      body: '<h1>Maintenance</h1>',
    }),
  );
  await page.goto(`/v/${token}`);
  await expect(
    page.getByRole('heading', { name: '核验服务维护中' }),
  ).toBeVisible({ timeout: 15000 });
  await page.unroute('**/api/v1/public/records/*');
  await page.route('**/api/v1/public/records/*', (route) => route.abort());
  await page.getByRole('button', { name: '重新查询' }).click();
  await expect(
    page.getByRole('heading', { name: '暂时无法完成核验' }),
  ).toBeVisible({ timeout: 15000 });
  await page.unroute('**/api/v1/public/records/*');
  await page.route('**/api/v1/public/records/*', (route) =>
    route.fulfill({
      json: {
        data: {
          recordType: 'CONTRACT',
          recordNumber: 'MOBILE-001',
          title: '移动核验测试',
          issuerName: '测试机构',
          documentVersion: 'V1',
          status: 'VOID',
          businessDate: '2026-09-07',
          updatedAt: '2026-09-07T00:00:00Z',
        },
        requestId: 'req_test',
      },
    }),
  );
  await page.getByRole('button', { name: '重新查询' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '登记已作废' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
