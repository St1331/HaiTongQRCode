# HaiTongQRcode

招标文件与合同二维码登记、核验和追溯系统。工作人员登记关键事实并发布后，系统生成唯一二维码；公众扫码即可查看数据库中的最新状态与公开字段。

> 本系统证明文件信息是否在企业系统中登记，不替代电子签章、CA 认证或司法鉴定。核验时仍须逐项比对编号、标题、主体、版本和日期。

## 已实现能力

- 招标文件、合同的创建、编辑、检索、分页和详情。
- `DRAFT → ACTIVE / VOID`、`ACTIVE → CHANGED / VOID`、`CHANGED → ACTIVE / VOID` 状态机。
- 192-bit 随机公开令牌、PNG 二维码、令牌轮换和旧码立即失效。
- 无需登录的移动端核验页；草稿、删除、非法令牌和不存在记录统一返回 404。
- 完整公开快照、乐观锁 revision、状态原因和只追加审计日志。
- 服务端不透明会话、argon2id 密码、登录锁定、CSRF/Origin 校验、RBAC、限流、安全响应头和日志脱敏。
- 用户管理、审计查看、响应式管理端和公开核验端。
- TypeORM migration、PostgreSQL、Docker Compose、Nginx、CI 和备份/恢复脚本。

## 技术结构

```text
apps/web             Next.js 管理端与公开核验页
apps/api             Express API、认证、业务规则和数据访问
packages/shared      前后端共享枚举、Zod Schema 与纯函数
deploy               容器镜像和 Nginx 配置
scripts              验证、备份和恢复脚本
docs                 开发基线、API 契约与 ADR
```

## 最快启动：Docker Compose

要求 Docker Compose v2。复制环境变量并把三个秘密替换为随机值：

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

首次启动后创建超级管理员：

```powershell
$env:ADMIN_USERNAME='admin'
$env:ADMIN_DISPLAY_NAME='系统管理员'
$env:ADMIN_PASSWORD='请使用至少12位的独立强密码'
docker compose exec -e ADMIN_USERNAME -e ADMIN_DISPLAY_NAME -e ADMIN_PASSWORD api pnpm --filter @haitong/api db:seed-admin:compiled
```

浏览器打开 `http://localhost:8080`。正式部署必须在 Nginx 前配置 HTTPS，并把 `PUBLIC_BASE_URL` 改为正式 HTTPS 域名。

## 本地开发

要求 Node.js 24、pnpm 10、PostgreSQL 17 或更高版本。先创建空数据库并配置 `.env`，然后运行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @haitong/api db:migrate
$env:ADMIN_PASSWORD='请使用至少12位的独立强密码'
pnpm --filter @haitong/api db:seed-admin
pnpm dev
```

- Web：`http://localhost:3000`
- API：`http://localhost:3001/api/v1`
- 健康检查：`http://localhost:3001/api/v1/health`
- 就绪检查（含数据库）：`http://localhost:3001/api/v1/ready`

开发环境由 Next.js 把 `/api/*` 代理到 API；生产环境由 Nginx 同源转发。

## 验证与运维

```powershell
pnpm check
pnpm test:e2e
./scripts/verify.ps1
./scripts/backup.ps1 -OutputFile ./backups/haitong.dump
./scripts/restore.ps1 -InputFile ./backups/haitong.dump
```

`test:e2e` 需要 Web、API、PostgreSQL 和测试管理员已启动；CI 会自动准备这些依赖。性能冒烟与真机扫码步骤见部署与运维手册。

恢复命令会清理目标数据库中的同名对象，只能对明确的恢复目标执行。上线前至少进行一次隔离环境真实恢复演练。

## 文档

- [开发基线](docs/开发基线文档.md)
- [API 契约](docs/API.md)
- [首期产品决策](docs/adr/0001-initial-product-decisions.md)
- [部署与运维手册](docs/OPERATIONS.md)

## 默认产品决策

业务时区为 `Asia/Shanghai`；编号首期允许重复并通过列表提示识别；合同金额默认不公开；代理机构和项目类型使用自由文本；设计容量为 10 万条登记、50 个后台账号。所有生产密钥、正式域名和管理员密码必须由部署环境提供，仓库不包含默认密码。
