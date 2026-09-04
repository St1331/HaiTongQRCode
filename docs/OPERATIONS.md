# HaiTongQRcode 部署与运维手册

## 1. 发布前准备

1. 准备正式 HTTPS 域名与证书，在外层网关或负载均衡器终止 TLS。
2. 为 PostgreSQL 创建独立最小权限账号，准备持久化卷和加密备份位置。
3. 生成两个互不相同、至少 32 字符的随机 HMAC 密钥。
4. 将 `PUBLIC_BASE_URL` 设置为正式 HTTPS 地址，并设置 `COOKIE_SECURE=true`。
5. 执行 `pnpm check`、`pnpm test:e2e` 和数据库 migration 演练。

## 2. 容器部署

```powershell
Copy-Item .env.example .env
# 编辑 .env 后启动
docker compose up -d --build
docker compose ps
```

首次启动后按 README 创建超级管理员。上线验证顺序：`/api/v1/health`、`/api/v1/ready`、登录、创建草稿、发布、二维码下载、匿名核验。

## 3. 监控与告警

至少采集以下指标，并为连续 5 分钟异常建立告警：

- API `/api/v1/ready` 可用性、5xx 比例和 P95 延迟。
- 公众查询 404、429 和 5xx 比例。
- PostgreSQL 连接数、慢查询、磁盘使用率和复制状态（如有）。
- 容器重启次数、CPU、内存、磁盘和证书到期时间。
- 最近一次备份时间、文件大小、校验结果和异地复制结果。

建议阈值：可用性低于 99.5%、5xx 超过 1%、公开 API P95 超过 500 ms、磁盘超过 80% 或连续两次备份失败时告警。

## 4. 性能冒烟

先准备一条可公开核验记录，再执行：

```powershell
$env:TARGET_URL='https://正式域名/api/v1/public/records/公开令牌'
$env:TOTAL_REQUESTS='500'
$env:CONCURRENCY='25'
pnpm test:performance
```

默认门禁为 P95 不高于 500 ms、错误率低于 1%。正式容量测试应准备接近 10 万条记录，在与生产规格一致的隔离环境持续施加 50 RPS，并据结果调整应用与 Nginx 限流值。

## 5. 备份与恢复

- 每日全量备份，默认保留 30 天；至少一份经加密后复制到异地存储。
- 备份文件仅允许数据库管理员和恢复责任人读取；传输与静态存储均加密。
- 每月在隔离数据库执行一次真实恢复，并抽查用户、记录、版本和审计数量。

```powershell
./scripts/backup.ps1 -OutputFile ./backups/haitong.dump
./scripts/restore.ps1 -InputFile ./backups/haitong.dump -DatabaseUrl '明确的隔离恢复库连接串'
```

恢复脚本使用 `--clean --if-exists`，会清理目标库中的同名对象，禁止指向未经确认的生产数据库。

## 6. 回滚

1. 发布前生成可恢复备份，并记录当前应用镜像标签和 migration 版本。
2. 应用异常但数据库兼容时，先回滚 Web/API 镜像，不回滚数据。
3. migration 仅在确认其回滚不会丢失生产数据时使用 `db:revert:compiled`。
4. 数据损坏时停止写入，保留现场，由数据库责任人从已验证备份恢复到新实例，再切换连接。

## 7. 真机扫码验收

软件自动化会解码生成的 PNG 并验证目标 URL。正式印刷前仍需由业务验收人员完成以下真机项目并保存记录：

- iOS 系统相机、Android 系统相机、微信扫一扫和至少一个其他扫码工具。
- A4 纸上 25 mm、35 mm、50 mm 三种尺寸。
- 正视、轻微倾斜、正常室内光线和轻微折痕场景。
- 核对记录编号、标题、主体、版本、日期和状态；确认变更与作废警示明确。

真机结果属于部署环境和印刷介质验收，不应使用开发机屏幕截图代替。
