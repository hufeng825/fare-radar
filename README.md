# 候鸟 · 低价机票雷达

轻量静态网页，零前端依赖。页面本地可运行，GitHub Pages 可托管，Python 标准库采集。

在线地址：https://hufeng825.github.io/fare-radar/

仓库：https://github.com/hufeng825/fare-radar

## 当前状态

已完成页面、筛选、往返配对、缓存采集脚本、自动部署工作流和单元测试。
**已完成真实采集：2026-10-26 17:05（北京时间），1,778 条缓存报价，27 个航线方向有数据；所有查询成功。已部署 GitHub Pages，云端首轮采集同样成功。无模拟价格。**
无 Token 时页面提供全部配置航线的 Google Flights 搜索入口，按城市/地区筛选；这些链接是手动询价，不是自动监测，Google 服务在部分网络环境可能无法访问。

## 本地运行

在本项目目录运行（需要 Python 3；npm 仅作为快捷入口）：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory public
```

访问 http://127.0.0.1:4173 。也可 `npm start`。不能直接双击 HTML，因为页面通过 fetch 读取 JSON。

测试：`npm test`（需要 Node 20+ 与 Python 3）。

## 航线和筛选

- 杭州 ↔ 东京、大阪、名古屋、福冈、札幌、冲绳、香港、首尔、釜山、济州。
- 上海 ↔ 上述 6 座日本城市。SHA 为城市代码，数据提供商决定机场覆盖，不能保证每个机场都有缓存。
- 合计 32 个单向城市组合；这是监测配置，不保证每条都有直飞服务。
- 单程默认人民币 800 元以内，可改为 300 / 500 等。往返要求每一程都在单程预算内，按两程总价排序。
- 默认出发窗口 90 天，可一键选择未来 7 天、1 / 3 / 6 个月（30 / 90 / 180 天），或自定义日期；快捷选择会在当前浏览器保留。默认停留 3–14 天，可调整。返回国内同一城市，暂不支持杭州出发上海返回。
- 默认只看直飞；只展示供应商发现时间 48 小时以内的报价。刷新页面只读取已采集快照。
- 税费、行李和支付手续费需在实际购票页确认。往返是独立单程组合；无购票、自动下单功能。邮件和微信推送见下文。

## 零费用数据方案与限制

使用 Travelpayouts / Aviasales Data API；需要自行注册账号并在 Profile 获取 API Token。Token 是接口凭据，不等同于购买 API 服务；应在注册时核对当时条款与访问权限，不必为了此项目购买服务。

官方说明：https://support.travelpayouts.com/hc/en-us/articles/203956083-Requirements-for-Aviasales-data-API-access
API 文档：https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API

票价来自用户搜索缓存，不是实时扫描航空公司，不保证春秋、乐桃等低价票或中国出发航线覆盖。免费数据能否满足实际需求，需要 Token 接入后先实测。无结果不能解释为没有低价；接口不含可靠的税费/行李细目。

本地采集时用安全的终端环境变量注入 TRAVELPAYOUTS_TOKEN，然后运行 `python3 scripts/collect.py`。不要把 Token 写到源码、public、命令历史或聊天。浏览器从不接触 Token。

脚本逐月查询未来 180 天，约 192–224 个请求，每次有短暂间隔和有限重试；缓存日期/转机数同组保留最低价。全部请求失败则退出非零，不覆盖本地旧文件；部分失败则输出明确的 partial 状态，不用旧报价补齐。

## GitHub Pages 部署

1. 新建一个公开仓库，例如 `fare-radar`（GitHub Free 的 Pages 使用公开仓库）。
2. 上传本目录全部内容，**包括隐藏的 `.github/workflows/pages.yml`**，根目录应直接有 public、scripts、package.json，默认分支使用 main。请勿上传外层 outputs 目录。
3. 仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions。
4. 若已获取 Token：Settings → Secrets and variables → Actions → New repository secret，名称为 `TRAVELPAYOUTS_TOKEN`，值粘贴 Token。
5. Actions → Update fares and deploy Pages → Run workflow。无 Token 也可部署，但只能用搜索入口。
6. 成功后以部署任务返回的实际 page_url 为准，通常为 https://你的用户名.github.io/fare-radar/ 。

工作流每 6 小时（UTC 的 00:23、06:23、12:23、18:23；北京时间 08:23、14:23、20:23、02:23）尝试采集并部署。GitHub 调度可能延迟；公开仓库长期无活动可能停用定时任务，请在 Actions 检查。不是实时盯盘。

采集输出仅进入本次部署产物，不提交回 Git。整次采集失败时工作流失败、保留上次线上部署；页面会提示超过 24 小时的旧快照，且仍隐藏发现时间超过 48 小时的报价。不要在失败后把旧 JSON 的 updated_at 改成当前时间。

GitHub Pages 官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

## 文件结构

- public：可直接部署的静态站点，所有路径为相对路径，支持 GitHub 项目子路径。
- public/data/config.json：城市与监测航线。
- public/data/fares.json：公开缓存报价，不含凭据。
- scripts/collect.py：服务端/Actions 采集脚本。
- .github/workflows/pages.yml：测试、采集与 Pages 部署。
- tests：筛选/配对和数据规范化测试；测试价格仅存在测试文件，不展示在页面。

要修改航线可编辑 config.json。没有后台数据库、广告、埋点或付费依赖；筛选偏好仅存当前浏览器 localStorage。


## 邮件 + 微信自动推送

当前为**微信通道测试已由用户确认手机实际收到；应用已发送首份 20 条真实低价摘要，微信接口返回成功。邮件由用户选择稍后配置；GitHub 定时运行已上线，首次云端流程成功，去重记录已从本地迁移**。全部在 GitHub Actions 后台发送，电脑关机后仍可运行；无需公开收件地址。

### 默认提醒策略

`notifications.json` 与网页筛选偏好分开：网页里的预算变更只影响浏览器，后台按 notifications.json 的城市、单程/往返、日期、每程和总价预算运行。当前为 2027 全年杭州/上海 ⇄ 大阪、往返 ≤ ¥1600、每程 ≤ ¥800、停留 3–14 天。

- 每个渠道每次最多合并 20 条机会，每天（北京时间）最多 4 次摘要。测试消息也占次数；微信官方免费额度目前为每天 5 条，额度变化以服务方为准。
- 首次发现符合条件的报价才通知。相同城市方向、日期、转机数不重复；相对已发送价降低至少 ¥30 时再通知。两条渠道各自记账，单个渠道失败不会把另一个已成功渠道重发。
- 只处理 24 小时内采集的快照、48 小时内发现的报价。报价消失不发“售罄”提醒。
- 支持出境单程、返程单程和往返组合；往返同时检查停留天数、每程预算与合计预算，摘要附去程和返程的中文人民币链接。
- 持久去重记录放在仓库 `notification-state` 分支，只有报价键的哈希、价格、日期、计数，不含邮箱、Token、SendKey。不要删除或手改去重分支；删除后会重发。它不属于 Pages 部署内容。
- 发送失败不记为成功，下一轮重试；发送成功但状态写入失败、或网络超时而供应商已受理时，下一轮仍可能重复，不能保证严格恰好一次投递。供应商接受请求不等于手机实际收到，需真实验收。

### 邮件：QQ 邮箱 SMTP

1. 登录 QQ 邮箱，在头像 → 设置 → 账号与安全 → 安全设置，开启 POP/IMAP/SMTP 服务并生成专用授权码。
2. 将以下值存到仓库 Settings → Secrets and variables → Actions → Secrets：

| Secret | 内容 |
| --- | --- |
| `SMTP_USER` | 发件 QQ 邮箱地址 |
| `SMTP_PASSWORD` | 邮箱生成的授权码，**不是 QQ 密码** |
| `EMAIL_TO` | 收件邮箱，可与发件邮箱相同 |

默认主机 smtp.qq.com、SSL 端口 465。其他邮箱可在 Actions Variables 配置 SMTP_HOST、SMTP_PORT（仅支持隐式 TLS 的 SMTP SSL）。不要把凭据放到 public 或通知配置文件。

官方授权码说明：https://help.mail.qq.com/detail/106/985

### 微信：Server酱 Turbo

1. 在 https://sct.ftqq.com 登录，按引导绑定微信推送通道并关注所需公众号。
2. 获取 SCT 开头的 SendKey，存为仓库 Actions Secret：`SERVERCHAN_SENDKEY`。不要发到聊天或源码。
3. 不同通道的免费权限/通知展示不同，需按账号实际页面确认。脚本支持 Turbo SCT SendKey，不支持 SC3 Key。

官方文档：https://sct.ftqq.com/docs/ 。微信摘要通过 Server酱传递；邮件通过自己的 SMTP 邮箱发送。

### 上线与实机验收

- 工作流需要 `contents: write` 来维护去重分支；脚本会先验证可写再发送。若仓库组织策略或分支保护拦截，请检查 Actions 权限；不要跳过持久化。
- Actions → Update fares and deploy Pages → Run workflow，勾选 `test_notifications`，会向已配置渠道发送一条“通道测试”（不含虚构票价）。该流程仍执行页面部署，且需要 Pages 已配置成功。
- 只有邮箱实际收到测试信、微信实际收到通知后，才算两个渠道配置完成。没有任何渠道凭据时任务会明确跳过，不代表已经发送。
- 未勾选测试时，只推送真正符合规则的新缓存价；初始 fares.json 为空时不会发低价消息。
- 本地可在安全环境变量中配置相同凭据后运行 `python3 scripts/notify.py --state .notification-state/state.json --test`。去重状态请保留；不要与 GitHub 端同时启用本地定时推送，二者状态独立会重复。

购票核实链接及新微信摘要中的 Google Flights 链接均显式指定 `hl=zh-CN&curr=CNY&gl=CN`，优先显示简体中文和人民币；供应商最终结算币种及价格以购票页为准。网页浏览日期不会改变后台规则；在页面「监控航线与推送设置」填写并通过 GitHub 确认保存后，后台才会更新。


## 网页配置监控（无需网页保存 Token）

页面「监控航线与推送设置」支持城市、目的地、出发日、往返类型、停留天数、总价/每程预算、降价阈值、每日摘要上限、每份数量、每航线数量、暂停和推送渠道开关。可选「明年全年」或今天起两年内的自定义范围。网页浏览仍覆盖基础 180 天；监控选中航线会额外采集至所需返程日期。

1. 在页面修改规则，可用「预览符合规则的机票」先查看当前缓存。
2. 点击「保存到云端 · GitHub 确认」，打开带完整配置的 GitHub Issue 草稿。
3. 登录仓库主人账号，点击 Create issue。只有主人本人创建/编辑的同标题配置单才会触发应用。
4. Actions 验证所有字段后更新 main 分支 notifications.json，并在同一流程重新采集、发布和推送。自动提交使用 GITHUB_TOKEN，不会再触发第二轮 push 工作流。
5. 回网页点「读取云端设置」查看已保存规则；只编辑表单、预览或关闭草稿不会改变后台。配置会公开，表单里不应放任何邮箱或凭据。

Issue 标题为「候鸟配置：更新监控规则」。JSON 仅作为数据解析，未知字段、非法日期/金额、非主人提交会被拒绝。定时任务每次读取最新 main 配置，避免使用排队时的旧设置；配置变更不清空去重历史或每日发送计数。没有符合大阪往返预算的缓存组合时不发送济州等其他路线。
