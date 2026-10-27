'use client';

import {
  changePasswordSchema,
  type ChangePasswordInput,
} from '@haitong/shared';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { apiRequest } from '../../../lib/api';

interface PasswordForm extends ChangePasswordInput {
  confirmPassword: string;
}

export default function AccountPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>();

  const submit = handleSubmit(async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      setError('confirmPassword', { message: '两次输入的新密码不一致' });
      return;
    }
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      setError('root', {
        message: parsed.error.issues[0]?.message ?? '请检查密码',
      });
      return;
    }
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      sessionStorage.removeItem('ht_csrf');
      window.alert('密码已修改，请使用新密码重新登录。');
      router.replace('/login');
    } catch (caught) {
      setError('root', {
        message: caught instanceof Error ? caught.message : '密码修改失败',
      });
    }
  });

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">账户安全</p>
          <h1>修改密码</h1>
          <p className="muted">修改成功后，当前账户的全部会话都会被撤销。</p>
        </div>
      </header>
      <section className="panel compact-panel">
        <form className="stack-form account-form" onSubmit={submit} noValidate>
          <label>
            当前密码
            <input
              {...register('currentPassword', { required: true })}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label>
            新密码
            <input
              {...register('newPassword', { required: true })}
              type="password"
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <label>
            再次输入新密码
            <input
              {...register('confirmPassword', { required: true })}
              type="password"
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          {errors.confirmPassword?.message && (
            <div className="alert alert-error">
              {errors.confirmPassword.message}
            </div>
          )}
          {errors.root?.message && (
            <div className="alert alert-error">{errors.root.message}</div>
          )}
          <button className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? '正在修改…' : '修改密码并退出'}
          </button>
        </form>
      </section>
    </>
  );
}
