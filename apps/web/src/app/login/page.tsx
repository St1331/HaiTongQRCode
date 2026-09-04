'use client';

import { loginSchema, type LoginInput } from '@haitong/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { apiRequest, type CurrentUser } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>();

  const submit = handleSubmit(async (values) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setError('root', {
        type: 'validate',
        message: parsed.error.issues[0]?.message ?? '请检查登录信息',
      });
      return;
    }
    try {
      await apiRequest<CurrentUser>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      router.replace('/admin/records');
    } catch (caught) {
      setError('root', {
        type: 'server',
        message: caught instanceof Error ? caught.message : '登录失败',
      });
    }
  });

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand brand-dark" aria-label="返回首页">
          <span className="brand-mark">海</span>
          <span>HaiTong QR</span>
        </Link>
        <p className="eyebrow">管理工作台</p>
        <h1>欢迎回来</h1>
        <p className="muted">登录后登记文件、发布核验信息并管理二维码。</p>
        <form onSubmit={submit} className="stack-form" noValidate>
          <label>
            用户名
            <input
              {...register('username', { required: true })}
              autoComplete="username"
              minLength={3}
            />
          </label>
          <label>
            密码
            <input
              {...register('password', { required: true })}
              type="password"
              autoComplete="current-password"
              minLength={10}
            />
          </label>
          {errors.root?.message && (
            <div className="alert alert-error">{errors.root.message}</div>
          )}
          <button className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? '正在登录…' : '登录工作台'}
          </button>
        </form>
      </section>
      <aside className="auth-aside">
        <span className="security-ring">✓</span>
        <h2>一物一码，公开可核验</h2>
        <p>
          二维码只承载随机查询地址。扫码后请逐项核对编号、标题、主体、版本与日期。
        </p>
      </aside>
    </main>
  );
}
