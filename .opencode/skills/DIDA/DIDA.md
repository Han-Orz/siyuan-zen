# DIDA CLI — 滴答清单命令行工具

> 基于 npm 包 [`@suibiji/dida-cli`](https://www.npmjs.com/package/@suibiji/dida-cli)，命令为 `dida`。
> 官方 OpenAPI 文档：<https://developer.dida365.com/docs#/openapi>

时区：东八区（`Asia/Shanghai`），所有时间参数以北京时间（UTC+8）为准。

---

## 安装 & 登录

```sh
npm install -g @suibiji/dida-cli

dida auth login            # OAuth 浏览器登录（推荐）
dida auth token <token>    # 无浏览器环境用 API 口令
dida auth status           # 查看登录状态
dida auth logout           # 登出
```

API 口令获取：滴答清单网页版 → 头像 → 设置 → 账户与安全 → API 口令。

---

## 常用命令

### 项目（清单）

| 命令 | 说明 |
|------|------|
| `dida project list` | 列出所有清单 |
| `dida project get <id>` | 查看清单详情 |
| `dida project data <id>` | 查看清单 + 任务 + 分组 |
| `dida project create --name "名称" [--color "#F18181"] [--view-mode list\|kanban\|timeline] [--kind TASK\|NOTE]` | 创建清单 |
| `dida project update <id> --name "新名"` | 更新清单 |
| `dida project delete <id>` | 删除清单 |
| `dida project group list` | 查看分组（文件夹） |
| `dida project group create --name "名称"` | 创建分组 |
| `dida project group update <id> --name "新名"` | 更新分组 |
| `dida project group delete <id>` | 删除分组 |
| `dida project column list <projectId>` | 查看看板列 |
| `dida project column create <projectId> --name "列名"` | 创建看板列 |

### 任务

| 命令 | 说明 |
|------|------|
| `dida task get <projectId> <taskId>` | 获取任务详情 |
| `dida task create --title "买牛奶" --project <projectId>` | 创建任务 |
| `dida task create --title "开会" --project <id> --priority 5 --due-date "2026-06-09T09:00:00+0800"` | 创建任务（指定优先级与截止时间） |
| `dida task update <taskId> --project <projectId> --title "新标题"` | 更新任务 |
| `dida task complete <projectId> <taskId>` | 完成任务 |
| `dida task delete <projectId> <taskId>` | 删除任务 |
| `dida task move --from <srcProjectId> --to <dstProjectId> --task <taskId>` | 移动任务到其他清单 |
| `dida task completed --projects <projectId> --start-date "2026-06-01T00:00:00+0800" --end-date "2026-06-09T23:59:59+0800"` | 查询已完成任务 |
| `dida task filter --projects <projectId> --priority 3,5 --status 0` | 过滤任务 |
| `dida task comment list <projectId> <taskId>` | 查看任务评论 |
| `dida task comment add <projectId> <taskId> --title "评论"` | 添加评论 |
| `dida task comment delete <projectId> <taskId> <commentId>` | 删除评论 |

### 标签

| 命令 | 说明 |
|------|------|
| `dida tag list` | 列出所有标签 |
| `dida tag create --name urgent --label urgent` | 创建标签 |

### 习惯

| 命令 | 说明 |
|------|------|
| `dida habit list` | 列出所有习惯 |
| `dida habit get <habitId>` | 查看习惯详情 |
| `dida habit create --name "喝水" --repeat "RRULE:FREQ=DAILY;INTERVAL=1" --goal 8 --unit 杯` | 创建习惯 |
| `dida habit update <habitId> --name "新名"` | 更新习惯 |
| `dida habit checkin <habitId> --stamp 20260609 --value 1` | 打卡 |
| `dida habit checkins --habits <habitId> --from 20260601 --to 20260630` | 查询打卡记录 |

### 专注

| 命令 | 说明 |
|------|------|
| `dida focus get <focusId> --type pomodoro` | 获取专注记录 |
| `dida focus list --from "2026-06-01T00:00:00+0800" --to "2026-06-07T23:59:59+0800" --type pomodoro` | 列出专注记录（最大 30 天） |
| `dida focus create --type pomodoro --task-id <taskId> --start-time "2026-06-07T09:00:00+0800" --end-time "2026-06-07T09:25:00+0800" --duration 1500` | 创建专注记录 |
| `dida focus delete <focusId> --type pomodoro` | 删除专注记录 |

### 倒数日

| 命令 | 说明 |
|------|------|
| `dida countdown list` | 列出所有倒数日 |

### JSON 输出

任意命令加 `--json` 输出原始 API JSON，便于脚本处理：

```sh
dida project list --json
dida task get <projectId> <taskId> --json
dida task filter --projects <id> --json
```

### 帮助

```sh
dida --help           # 全局帮助
dida <command> --help # 子命令帮助
```

---

## API 映射

| CLI 命令 | HTTP Endpoint |
|----------|---------------|
| `task get` | `GET /project/{projectId}/task/{taskId}` |
| `task create` | `POST /task` |
| `task update` | `POST /task/{taskId}` |
| `task complete` | `POST /project/{projectId}/task/{taskId}/complete` |
| `task delete` | `DELETE /project/{projectId}/task/{taskId}` |
| `task move` | `POST /task/move` |
| `task completed` | `POST /task/completed` |
| `task filter` | `POST /task/filter` |
| `task comment list` | `GET /project/{projectId}/task/{taskId}/comments` |
| `task comment add` | `POST /project/{projectId}/task/{taskId}/comment` |
| `task comment delete` | `DELETE /project/{projectId}/task/{taskId}/comment/{id}` |
| `project list` | `GET /project` |
| `project get` | `GET /project/{projectId}` |
| `project data` | `GET /project/{projectId}/data` |
| `project create` | `POST /project` |
| `project update` | `POST /project/{projectId}` |
| `project delete` | `DELETE /project/{projectId}` |
| `project group list` | `GET /project/group` |
| `project group create` | `POST /project/group` |
| `project group update` | `POST /project/group/{projectGroupId}` |
| `project group delete` | `DELETE /project/group/{projectGroupId}` |
| `project column list` | `GET /project/{projectId}/column` |
| `project column create` | `POST /project/{projectId}/column` |
| `project column update` | `POST /project/{projectId}/column/{columnId}` |
| `tag list` | `GET /tag` |
| `tag create` | `POST /tag` |
| `habit get` | `GET /habit/{habitId}` |
| `habit list` | `GET /habit` |
| `habit create` | `POST /habit` |
| `habit update` | `POST /habit/{habitId}` |
| `habit checkin` | `POST /habit/{habitId}/checkin` |
| `habit checkins` | `GET /habit/checkins` |
| `focus get` | `GET /focus/{focusId}?type=` |
| `focus list` | `GET /focus?from=&to=&type=` |
| `focus create` | `POST /focus` |
| `focus delete` | `DELETE /focus/{focusId}?type=` |
| `countdown list` | `GET /countdown` |

---

## 参考链接

- npm: <https://www.npmjs.com/package/@suibiji/dida-cli>
- npmx (文档更完整): <https://npmx.dev/package/@suibiji/dida-cli>
- DIDA Open API: <https://developer.dida365.com/docs#/openapi>
- 滴答清单: <https://dida365.com>
