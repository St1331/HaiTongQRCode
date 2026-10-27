# HaiTongQRcode API 契约

API 前缀为 `/api/v1`，响应使用 JSON。成功响应为 `{ data, requestId }`，列表额外包含 `pagination`；错误响应为 `{ error: { code, message, details }, requestId }`。

后台会话通过 `HttpOnly` Cookie 传递；登录与 `/auth/me` 返回 CSRF 令牌。所有修改请求必须同时发送 `x-csrf-token` 请求头，浏览器还会携带同值的 CSRF Cookie。生产环境 Cookie 使用 `Secure` 与 `SameSite=Lax`。

登录及其他写请求均拒绝不匹配的 Origin 或 `Sec-Fetch-Site: cross-site`，返回 `403 ORIGIN_REJECTED`；超过 256 KiB 的 JSON 请求返回 `413 PAYLOAD_TOO_LARGE`。登录无需预先取得 CSRF 令牌，其余已认证写请求必须验证 CSRF。

## 认证

| 方法 | 路径                    | 权限   | 用途                   |
| ---- | ----------------------- | ------ | ---------------------- |
| POST | `/auth/login`           | 匿名   | 登录并创建服务端会话   |
| GET  | `/auth/me`              | 已登录 | 当前用户及 CSRF 令牌   |
| POST | `/auth/logout`          | 已登录 | 撤销当前会话           |
| POST | `/auth/change-password` | 已登录 | 修改密码并撤销全部会话 |

## 用户

| 方法       | 路径                              | 权限          |
| ---------- | --------------------------------- | ------------- |
| GET / POST | `/admin/users`                    | `SUPER_ADMIN` |
| PATCH      | `/admin/users/:id`                | `SUPER_ADMIN` |
| POST       | `/admin/users/:id/reset-password` | `SUPER_ADMIN` |

角色为 `SUPER_ADMIN`、`EDITOR`、`VIEWER`。状态为 `ACTIVE`、`DISABLED`。

用户角色与状态修改以事务串行校验最后一个启用的超级管理员；并发降级或禁用也必须保留至少一人，否则返回 `409 LAST_SUPER_ADMIN`。

## 登记记录

| 方法        | 路径                              | 权限          |
| ----------- | --------------------------------- | ------------- |
| GET / POST  | `/admin/records`                  | 查看 / 编辑   |
| GET / PATCH | `/admin/records/:id`              | 查看 / 编辑   |
| POST        | `/admin/records/:id/status`       | 编辑          |
| POST        | `/admin/records/:id/rotate-token` | `SUPER_ADMIN` |
| GET         | `/admin/records/:id/versions`     | 查看          |
| GET         | `/admin/records/:id/qrcode`       | 查看          |
| GET         | `/admin/audit-logs`               | `SUPER_ADMIN` |

列表参数：`page`、`pageSize`（最大 100）、`type`、`status`、`query`、`dateFrom`、`dateTo`、`sortBy` 和 `sortOrder`。编辑、状态转换和令牌轮换必须提交当前正整数 `revision`；冲突返回 HTTP 409 与 `DOCUMENT_CONFLICT`。

记录类型为 `TENDER_DOCUMENT` 或 `CONTRACT`；状态为 `DRAFT`、`ACTIVE`、`CHANGED`、`VOID`。转为 `CHANGED` 或 `VOID` 时必须提供 5～500 字符原因。

业务日期必须是实际存在的 `YYYY-MM-DD` 日历日期；例如 `2026-02-30` 返回 `400 VALIDATION_ERROR`，不会自动折算为三月日期。

## 公众核验

`GET /public/records/:publicToken` 无需登录，只返回公开白名单字段。只有 `ACTIVE`、`CHANGED`、`VOID` 可查询；草稿、软删除、不存在和令牌格式错误统一返回 HTTP 404 与 `RECORD_NOT_FOUND`。成功响应使用 `Cache-Control: no-store`，后台二维码使用 `private, no-store`，避免轮换或作废后缓存继续返回旧内容；依据 ADR-0002。

合同金额由 `PUBLISH_CONTRACT_AMOUNT` 控制，默认不返回。内部说明、数据库 ID、操作者、审计数据和公开令牌均不会出现在公开 DTO 中。

公开接口同时按来源 IP 和公开令牌限流；每分钟阈值分别由 `PUBLIC_IP_RATE_LIMIT` 与 `PUBLIC_TOKEN_RATE_LIMIT` 配置，默认均为 6000，以覆盖 50 RPS 容量基线并保留突发余量。部署方应结合真实流量、Nginx 限流和监控结果调整。
