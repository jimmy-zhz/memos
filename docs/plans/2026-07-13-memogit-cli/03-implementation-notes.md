# memogit：实现说明与联调记录

状态：阶段 1-3（login / clone / pull）已实现并本地实测跑通；阶段 4（push）待开发。
关联：[[01-memogit-cli]]（需求与方案，已按真实模型修订）、[[02-api-survey-and-estimate]]（API 调研）。

本文档记录**实际写出来的东西**——代码结构、落地时做的关键决策、以及联调过程中踩到
的真实问题，供后续接手 push/附件同步时参考。面向使用者的操作手册见
`docs/manual/05-memogit-cli.md`（英文）。

## 1. 实现状态总览

| 命令 | 状态 | 说明 |
|---|---|---|
| `memogit login` | ✅ 已实现 | 写 server / token 到 `.memogit/config.yaml`（0600） |
| `memogit clone [workspace-title]` | ✅ 已实现 | 全量导出 + git init + baseline commit |
| `memogit pull` | ✅ 已实现 | 增量拉取 + 冲突检测 + commit |
| `memogit push` | ⛔ 未实现 | 阶段 4，含删除→ARCHIVED、push 前冲突检查 |
| `memogit status` | ⛔ 未实现 | 阶段 6 |
| `memogit commit` | ⛔ 未实现 | 阶段 6，仅透传 `git commit` |
| 附件同步 | ⛔ 未实现 | 阶段 5，含 `/file/` 路由 PAT 鉴权 spike |

## 2. 代码结构

独立 Go 二进制，作为 memos 仓库的一个子命令包，直接复用 `proto/gen` 里 buf 生成好的
Connect-Go client，不重新生成 API 类型。

```
cmd/memogit/main.go        cobra 根命令 + login/clone/pull 子命令装配
internal/memogit/
  config.go                .memogit/config.yaml 读写 + 环境变量覆盖（MEMOGIT_SERVER/TOKEN）
  client.go                Connect client + PAT Bearer 拦截器；ListMemos 分页、
                           ListWorkspaces、GetCurrentUser、workspace 解析
  doc.go                   HashContent / CanonicalHash、doc_type 归一、PDF 占位、
                           relations 提取、FileContent（决定文件写什么）
  naming.go                RelPath = folder_path/title.<ext>；路径/文件名清洗与防穿越
  state.go                 sync-state.json 读写；MemoState；PathIndex（路径→uid 反查）
  sync.go                  scopedFilter、writeFile、memoState、exportMemo、
                           relocateAndWrite、pruneEmptyDirs、checkPathCollisions
  repo.go                  FindRoot（向上找 .memogit）、git init/commit、.gitignore
  clone.go                 Clone：解析 workspace → 拉取 → 落盘 → git baseline
  pull.go                  Pull：增量拉取 → 冲突三态 → relocate → commit
  *_test.go                单元测试（13 个用例，无需服务端）
```

## 3. 关键实现决策（落地时定的）

### 3.1 sidecar 元数据模型（重要，区别于需求初稿）
本地文件**只存 memo 的原始 content**，不再套 memogit 自己的 frontmatter。所有元数据
（uid、doc_type、visibility、pinned、timestamps、content_hash、relations）只存
`.memogit/sync-state.json`，以 uid 为 key。

原因：memo 的 content 本身可能已带一段 Obsidian 风格 `---` frontmatter（喂给 gallery
view 的 properties），再套一层会产生两个堆叠的 `---` 块、污染用户的 properties 命名
空间。详见 [[01-memogit-cli]] §5.2。

### 3.2 路径 = folder_path + title + doc_type 扩展名
`RelPath(folderPath, title, docType)` → `<folder_path>/<title><ext>`。扩展名：
MARKDOWN→`.md`、HTML→`.html`、PDF→`.pdf.md`（占位引用，无可编辑正文）、VIEW→`.view.json`。
服务端 `(workspace_id, folder_path, title)` 唯一，所以路径天然唯一，不拼 uid。

### 3.3 CanonicalHash（联调前就预埋，避免假冲突）
`writeFile` 会把内容规整为"去尾换行 + 单个 `\n`"，直接 hash 文件字节会和服务端 content
hash 不相等，导致 pull 误判"本地已改"。因此统一用
`CanonicalHash(s) = HashContent(TrimRight(s, "\n"))`，clone/pull 两端一致，保证未改动
的文件 hash 与基线相等。

### 3.4 只拉自己的 memo（creator scoping）
memos 的 `PROTECTED`/`PUBLIC` 可见性设计使得任意登录用户都能读到别人分享的 memo
（PAT 鉴权不改变这一点）。所以 clone/pull 显式加 `creator == "<username>"`（先
`GetCurrentUser` 拿 username），否则会把别人公开的 memo 混进本地知识库。这是产品语义
需要，不是权限绕过。

### 3.5 workspace 绑定
一个 checkout 目录对应一个 workspace。`clone Life` 按 title 精确匹配（服务端无 title
查询，客户端 `ListWorkspaces` 后匹配），解析出的 `workspaces/{uid}` 写入 config，
pull 复用。多 workspace 且未指定 title 时报错列出候选，绝不猜测。

### 3.6 冲突三态（pull 侧）
- 服务端变 + 本地未变 → 覆盖本地（relocate 若路径变）。
- 两边都变 → `⚠` 跳过，留人工。
- 本地文件被删 → `!` 跳过，留给 push 处理。
- PDF 特判：文件是生成的占位 stub 不是 content，不参与冲突检测，直接采纳服务端。

### 3.7 防御性文件名处理
`sanitizeSegment` 去掉 `<>:"/\|?*` 和控制字符、拒绝纯点名（`.`/`..`）；
`sanitizeFolderPath` 逐段清洗 + `path.Clean` 兜底防 `../` 穿越；CJK（中文）title
通过 `unicode.IsLetter` 保留。两个不同 title 清洗后若撞同名，`checkPathCollisions`
在 clone 时报错而非静默覆盖。

## 4. 联调中发现的真实问题（2026-07-16 本地实测）

### 4.1 端口不是默认 5230
该实例用 `go run ./cmd/memos --port 8081` 启动，后端在 **8081**，前端 Vite 在 3001。
memogit 要连的是**后端端口**（8081），不是前端。定位办法：
`lsof -nP -iTCP -sTCP:LISTEN | grep -i memos` 或 `ps aux | grep memos`。

### 4.2 localhost 解析到 IPv6，端口错时报 connection refused
后端 socket 是 IPv6 `*:8081`。macOS 上 `localhost` 优先解析到 `::1`。若 server 地址
端口填错（如默认 5230），会报 `dial tcp [::1]:5230: connect: connection refused`——
这是端口不对，不是 IPv6 问题。确认真实端口后用 `http://localhost:8081` 即可连上
（IPv6 socket，`localhost`→`::1` 正常工作）。

### 4.3 clone 返回 0 条 memo —— 疑似旧数据未关联 workspace（待确认）
`clone Default` 鉴权/解析都成功，但导出 0 条。初步判断：`workspace_id` / `folder_path`
/ `doc_type` 是本 fork 新加字段，实例里**迁移前创建的旧 memo 可能 `workspace_id` 为
空/0**，不落在任何具名 workspace 下，因此按 `workspace=workspaces/{uid}` 过滤查不到。

**验证方法**（待补测）：
- 不带 workspace、只带 `creator` filter 查 ListMemos，若有数据 → 实锤是 workspace
  关联问题，非 memogit 逻辑错误。
- 若确认，需要在 clone 增加"包含未分类文档 / 不限定 workspace"的模式，或先在服务端把
  旧数据迁移到某个 workspace。此项作为待办跟进。

## 5. 测试覆盖

`internal/memogit/*_test.go`，13 个用例，纯逻辑、无需服务端，`go test ./internal/memogit/`：
- RelPath 各 doc_type 扩展名 + CJK + 保留字符 + 防穿越 + 空 title 回退
- sidecar 逐字节还原（content 自带 frontmatter 不被二次包裹）
- PDF 占位含 attachment 引用
- checkPathCollisions 撞名报错
- CanonicalHash 忽略尾换行
- sync-state 存取 + PathIndex 反查
- writeFile 换行规整、pruneEmptyDirs 清理空目录

联调层面（连真实服务端）：login/clone/pull 已在本地 8081 实例跑通鉴权与 workspace 解析；
数据导出待 §4.3 的 workspace 关联问题澄清后再完整验证。

## 6. 后续（阶段 4 起）

1. **阶段 4 push**：路径→uid 反查（PathIndex 已就绪）、新建走 CreateMemo、修改走
   UpdateMemo（`update_mask=[content]`）、删除→ARCHIVED、push 前冲突检查。
2. **阶段 5 附件**：`/file/{attachment}/{filename}` 路由 PAT 鉴权 spike → PDF/图片下载。
3. **阶段 6**：`status`（本地 git diff + 未同步态合并展示）、`commit` 透传。
4. **§4.3 的 workspace 关联问题**：确认并决定是否加"未分类文档"导出模式。
