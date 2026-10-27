import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import 'antd/dist/reset.css';
import './globals.css';

import { AppProviders } from '../components/app-providers';

export const metadata: Metadata = {
  title: 'HaiTongQRcode',
  description: '招标文件与合同二维码登记、核验和追溯系统',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
