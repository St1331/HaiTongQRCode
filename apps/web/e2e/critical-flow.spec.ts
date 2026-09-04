import { expect, test, type Dialog } from '@playwright/test';

const username = process.env.E2E_ADMIN_USERNAME ?? 'e2e_admin';
const password = process.env.E2E_ADMIN_PASSWORD ?? 'E2e-admin-password-2026!';

test('管理员登记、发布、二维码展示和公众核验闭环', async ({ page }) => {
  const unique = Date.now();
  const recordNumber = `E2E-${unique}`;
  const title = `浏览器验收招标文件 ${unique}`;

  await page.goto('/login');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录工作台' }).click();
  await expect(page).toHaveURL(/\/admin\/records/);
  await expect(page.getByRole('heading', { name: '登记记录' })).toBeVisible();

  await page
    .getByRole('link', { name: /新建登记/ })
    .first()
    .click();
  await page.getByLabel('文件编号').fill(recordNumber);
  await page.getByLabel('文件标题').fill(title);
  await page.getByLabel('登记 / 签发主体').fill('海通测试签发中心');
  await page.getByLabel('关键业务日期').fill('2026-09-04');
  await page.getByLabel('招标人').fill('海通测试招标人');
  await page.getByLabel('代理机构').fill('海通招标代理');
  await page.getByLabel('项目类型').fill('工程建设');
  await page.getByLabel('发布日期').fill('2026-09-04');
  await page.getByLabel('公开备注').fill('浏览器自动化验收记录');
  await page.getByRole('button', { name: '保存为草稿' }).click();
  await expect(page).toHaveURL(/\/admin\/records\/[0-9a-f-]+$/);
  const detailUrl = page.url();
  await expect(page.getByText(recordNumber).first()).toBeVisible();
  await expect(page.getByAltText(`${recordNumber} 核验二维码`)).toBeVisible();
  await expect(page.getByRole('heading', { name: '历史版本' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '发布为有效' }).click();
  await expect(page.getByRole('status')).toContainText('有效');

  const verificationUrl = await page
    .getByRole('link', { name: '打开核验页' })
    .getAttribute('href');
  expect(verificationUrl).toMatch(/\/v\/[A-Za-z0-9_-]{32}$/);
  const revisedTitle = `${title}（修订）`;
  await page.getByRole('link', { name: '编辑信息' }).click();
  await page.getByLabel('文件标题').fill(revisedTitle);
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByRole('heading', { name: revisedTitle })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开核验页' })).toHaveAttribute(
    'href',
    verificationUrl!,
  );
  await expect(page.getByText('共 3 个公开快照')).toBeVisible();

  await page.goto(verificationUrl!);
  await expect(
    page.getByRole('heading', { name: '已查到有效登记' }),
  ).toBeVisible();
  await expect(page.getByText(revisedTitle)).toBeVisible();
  await expect(page.getByText('请与原文件逐项核对')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.goto(detailUrl);
  let handledDialogs = 0;
  const handleStatusDialogs = async (dialog: Dialog) => {
    handledDialogs += 1;
    await dialog.accept(
      dialog.type() === 'prompt' ? '文件内容已发布新版本' : undefined,
    );
  };
  page.on('dialog', handleStatusDialogs);
  await page.getByRole('button', { name: '标记变更' }).click();
  await expect(page.getByRole('status')).toContainText('已变更');
  expect(handledDialogs).toBe(2);
  page.off('dialog', handleStatusDialogs);

  await page.goto(verificationUrl!);
  await expect(
    page.getByRole('heading', { name: '登记已发生变更' }),
  ).toBeVisible();
  await expect(page.getByText('文件内容已发布新版本')).not.toBeVisible();
});
