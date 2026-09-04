import { z } from 'zod';

const DEVELOPMENT_SESSION_SECRET = 'development-session-hmac-secret-change-me';
const DEVELOPMENT_IP_SECRET = 'development-ip-hmac-secret-change-me-now';

const envSchema = z
  .object({
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://haitong:haitong@localhost:5432/haitong_qrcode'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
    SESSION_HMAC_SECRET: z.string().min(32).default(DEVELOPMENT_SESSION_SECRET),
    IP_HMAC_SECRET: z.string().min(32).default(DEVELOPMENT_IP_SECRET),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(480),
    SESSION_ABSOLUTE_MINUTES: z.coerce
      .number()
      .int()
      .min(10)
      .max(10080)
      .default(1440),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    PUBLIC_IP_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(60)
      .max(60_000)
      .default(6000),
    PUBLIC_TOKEN_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(60)
      .max(60_000)
      .default(6000),
    PUBLISH_CONTRACT_AMOUNT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production') {
      if (value.SESSION_HMAC_SECRET === DEVELOPMENT_SESSION_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['SESSION_HMAC_SECRET'],
          message: '生产环境必须配置独立会话密钥',
        });
      }
      if (value.IP_HMAC_SECRET === DEVELOPMENT_IP_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['IP_HMAC_SECRET'],
          message: '生产环境必须配置独立 IP HMAC 密钥',
        });
      }
      if (
        value.PUBLIC_BASE_URL.startsWith('https://') &&
        !value.COOKIE_SECURE
      ) {
        context.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'HTTPS 生产环境必须启用 Secure Cookie',
        });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const result = envSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
