# 校园工具箱

本地优先的校园工具集合：卡证通（证件照制作）与作业提醒（本机后端）。证件照处理完全在浏览器本地完成，照片不会上传服务器；作业提醒仅在本机保存加密凭证，支持一键汇总学习通全部课程作业，也支持按用户粘贴的课程页 URL 拉取。

## 运行

本机未安装全局 Node.js / Python，项目使用便携版 Node（`E:\Qoder_Projects\.tools\node`）与便携版 Python（`E:\Qoder_Projects\.tools\python`）。

**最简单的方式：双击 `start-dev.cmd`**，它会启动服务并用系统默认浏览器打开
http://127.0.0.1:5173/。关闭那个命令行窗口即停止服务。

注意：编辑器 / 聊天工具内置的「链接预览」无法渲染本地地址，请用系统浏览器
（Chrome / Edge）打开。

手动启动（Git Bash）：

```bash
export PATH="/e/Qoder_Projects/.tools/node:$PATH"
cd /e/Qoder_Projects/toolbox
npm install
npm run dev
```

### 作业提醒启动步骤

1. **安装依赖**：在项目根目录执行 `npm install`，再安装后端依赖
   `E:\Qoder_Projects\.tools\python\python.exe -m pip install -r backend/requirements.txt`
   （或已把便携版 Python 加入 PATH 时执行 `python -m pip install -r backend/requirements.txt`）。
2. **启动后端**：双击 `start-backend.cmd`，或手动执行
   `cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000`。
   后端只监听本机，不对局域网开放。
3. **启动前端**：双击 `start-dev.cmd`，或执行 `npm run dev`，打开
   `http://127.0.0.1:5173/#/homework`。连接状态显示「后端已连接」即通信正常。
4. **首次绑定**：在「学习通凭证」卡片输入学习通手机号与密码，点击「绑定」。
   凭证仅以 Fernet 加密形式保存在 `backend/data/cookies.enc`。
5. **一键拉取全部课程**：点击「拉取全部课程」，后端会读取学习通课程列表、逐门发现作业列表并汇总去重，
   通常 10–30 秒。部分课程失败不影响其他课程，页面会列出失败课程并可「刷新」重试。
6. **粘贴 URL 拉取单门课程**：在学习通网页版进入某门课程，复制课程页地址栏 URL（也可以复制
   作业列表页 URL），粘贴到「课程页或作业列表页 URL」后点击「拉取」。提交课程页时
   后端会自动从页面里的 `workEnc` 找到该课程的作业列表。结果按紧急程度排序，24 小时内
   的未交作业会标红并显示「紧急」；刷新页面会自动恢复上次同步结果。

Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`，因此前端可直接请求
`/api/health`、`/api/chaoxing/*` 与 `/api/homework/*`。后端未启动时页面显示
「未连接」、启动命令与安装提示，不会白屏；单门接口请求 15 秒超时，全部课程拉取
最长等待 120 秒。

手动启动（Git Bash）：

```bash
export PATH="/e/Qoder_Projects/.tools/python:$PATH"
cd /e/Qoder_Projects/toolbox
python -m pip install -r backend/requirements.txt
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

其他命令：

```bash
npm run build   # 类型检查 + 生产构建
npm run lint    # oxlint
```

## 页面结构

- `/#/` 启动页：校园工具箱门户，入口卡片指向卡证通与作业提醒，预留更多工具位
- `/#/kazhengtong` 卡证通：证件照制作流程
- `/#/homework` 作业提醒：后端连接、学习通凭证绑定、一键拉取全部课程或粘贴单门课程 URL、按课程折叠作业并在右下角展开、自动恢复上次同步与固定免责声明（阶段 5）

使用 hash 路由，不需要服务器重写规则，静态部署也能直接工作。

### 响应式布局

- 移动端保持单列，按流程从上到下排列。
- 桌面端（≥ 1024px）切换为左右工作台，页面最大宽度 1120px 并居中：
  - 卡证通：上传 / 预览在左，提示与结果信息在右；规格页左侧为规格、尺寸、底色与规格说明，右侧为证件照预览与合规报告。
  - 作业提醒：左侧为后端连接、凭证与固定免责声明，右侧为作业列表；课程卡片按两列排布，展开某一课程时该卡片横跨两列显示完整作业。

## 当前进度

- 阶段 1（已完成）：项目骨架、启动页与路由、流程步骤指示器、照片选择/拍照、类型与大小校验、本地预览、隐私提示
- 阶段 2（已完成）：人像抠图。使用 MediaPipe Selfie Segmentation（TF.js U²-Net 的降级方案），WASM 与模型随站点本地托管，照片不离开浏览器；支持重新抠图、透明棋盘格预览，以及在 AI 不可用时按背景颜色快速抠图
- 阶段 3（已完成）：规格预设 + 背景替换 + 裁剪压缩。内置四六级 CET、学生证 / 校园卡、简历 / 实习、二寸通用四类规格；支持尺寸与底色切换（预设底色外提供自定义调色盘，四六级在纯白 / 浅蓝外补充蓝色）；用 MediaPipe FaceDetector 定位人脸后按证件照构图智能裁剪，并在浏览器内输出尺寸精确、体积达标的 JPG（可下载）
- 阶段 4（已完成）：合规校验 + 最终预览下载。逐项校验像素（严格相等）、底色（采样上边缘与上半部侧边，容差 ±8）、文件大小（minKB–maxKB）、格式（image/jpeg / .jpg），展示四行合规报告；全部通过才启用下载（文件名 `证件照_规格_时间戳.jpg`）；提供「重新制作」按钮，重置流程但保留规格选择
- 作业提醒阶段 1（已完成）：FastAPI 后端骨架与 `/api/health`、Vite `/api` 代理、首页入口与连接状态页
- 作业提醒阶段 2（已完成）：学习通凭证绑定（模拟登录）与本地加密存储；支持绑定、状态查询、解绑
- 作业提醒阶段 3（已完成）：粘贴课程页或作业列表页 URL 拉取作业、解析标题 / 截止时间 / 状态、按紧急程度排序展示、最近结果缓存
- 作业提醒阶段 4（已完成）：进入页面自动恢复上次同步、15 秒请求超时与可读错误提示、空状态 / 离线状态完善、解绑二次确认、固定解析免责声明、后端拆分为路由与服务模块、作业条目组件化
- 作业提醒阶段 5（已完成）：一键拉取全部课程。从学习通课程列表自动发现课程、逐门解析作业列表、跨课程去重并汇总；部分课程失败单独提示且不影响其他课程；批量结果与课程范围写入本地缓存，单门 URL 拉取继续保留；同一门课程默认折叠为最紧急的一条，右下角「展开全部」可查看该课程完整作业（未交置顶）

流程步骤已精简为 4 步：上传照片 → 人像抠图 → 规格与合成（选规格 / 底色 / 裁剪压缩）→ 合规下载。

首次抠图需加载约 13 MB 的本地 WASM 运行时（之后走浏览器缓存）；人像分割模型约 244 KB，人脸检测模型约 225 KB。快速抠图只适合纯色 / 简洁背景，边缘细节弱于 AI。

规格常量集中在 `src/lib/specs.ts`：四六级 295×413 / 20–100 KB / 白或浅蓝（RGB 180,220,230）；学生证 295×413 / 10–200 KB / 300 dpi；简历 295×413 或 413×626 / ≤ 200 KB；二寸通用 413×626 或 413×579 / 100–200 KB。所有规格均可在预设底色之外用调色盘自选任意底色（四六级的蓝色与自定义底色仅供特殊要求）。JPG 压缩会从质量 100% 逐级下调，直到满足体积上限；无法满足最低体积时会在合规报告中标注不通过。

### 作业提醒（阶段 1 已完成）

本轮只做前后端骨架与通信验证：FastAPI 仅监听 `127.0.0.1:8000`，提供 `GET /api/health`（返回 `{"status": "ok", "service": "homework-reminder"}`），CORS 允许 `http://localhost:5173` 与 `http://127.0.0.1:5173`；前端通过 Vite `/api` 代理访问，`/#/homework` 展示加载中 / 已连接 / 未连接三种状态，未连接时给出启动命令。登录与作业抓取留待后续阶段。

### 作业提醒阶段 2：学习通凭证绑定（已完成）

- `POST /api/chaoxing/bind`：接收 `{"phone": "...", "password": "..."}`，密码按学习通网页端规则做 AES-CBC（key 与 iv 均为 `u2oh6Vu^HWe4_AES`）加密后再 Base64 编码，随表单发送到 `https://passport2.chaoxing.com/fanyalogin`，并携带常用 User-Agent、`Referer: https://passport2.chaoxing.com/` 与 Origin。成功后至少校验并保存 `_uid`、`uid`、`fid`、`_d` 等 Cookie。
- `GET /api/chaoxing/status`：尝试解密本地凭证，返回 `{"bound": true|false}`。
- `POST /api/chaoxing/unbind`：删除本机凭证文件。
- 存储：Cookie 用 Fernet 加密写入 `backend/data/cookies.enc`，密钥首次绑定时自动生成到 `backend/data/secret.key`；`backend/.gitignore` 忽略 `data/`。后端日志不输出明文密码或完整 Cookie。
- 错误码：`INVALID_CREDENTIALS`（手机号或密码错误）、`NEED_CAPTCHA`（学习通要求验证码 / 风控，提示手动登录，不做绕过）、`NETWORK_ERROR`（网络或服务不可用）。
- 前端在「学习通凭证」卡片提供绑定 / 解绑、加载状态与可读错误提示，并在页面显著位置注明：凭证仅加密存储在本地，不会上传至任何第三方服务器；本工具只读，不包含自动提交作业功能。
- 测试用 `.tools/mock_chaoxing.py` 模拟学习通登录端，环境变量 `CHAOXING_LOGIN_URL` 可覆盖登录地址；`.tools/verify-chaoxing.mjs` 覆盖成功绑定、密码错误、验证码、网络错误、后端重启持久化与解绑。默认仍指向官方地址。
- 阶段 2 只做绑定与凭证存储，不含作业抓取或自动提交功能。

### 作业提醒阶段 3：作业拉取与列表（已完成）

- `POST /api/homework/fetch`：接收 `{"workListUrl": "..."}`。后端解密 `cookies.enc` 中的 Cookie，携带常用 User-Agent 与 Referer 请求用户粘贴的课程页或作业列表页；课程页会读取其中的 `workEnc` 并自动拼接该课程的作业列表地址（mooc2-ans 页面只显示剩余时间，截止时间按「剩余 X 天 Y 小时 Z 分钟」换算，精确到分钟）。重定向到登录页或返回 401/403 时返回 `{"ok": false, "code": "SESSION_EXPIRED"}`。
- 解析使用选择器降级链：优先 `ul.workList li` 等常见结构，失败后回退到包含截止日期 / 状态文本的 `li`、`tr`，可处理表格结构。字段为 `courseName`、`title`、`deadline`（ISO 8601，东八区）、`status`（未交 / 已交 / 待批阅）。解析为空返回 `PARSE_EMPTY` 与「未解析到作业，页面结构可能已变化」。
- URL 校验：只允许 `http(s)`，主机限定为 `chaoxing.com` 及其子域与本机回环地址；其他地址返回 `INVALID_URL`。网络失败返回 `NETWORK_ERROR`。
- `GET /api/homework/last`：读取 `backend/data/last_homework.json` 中最近一次成功拉取的结果，刷新页面后可恢复。重新绑定或解绑会清除该缓存。
- 前端在已绑定状态提供课程页 / 作业列表页 URL 输入框与「拉取」「刷新」按钮；结果按「未交」置顶、其余按截止时间升序排列，24 小时内标红并显示「紧急」，展示课程名、标题、截止时间与状态。
- `SESSION_EXPIRED` 会提示「登录已过期，请重新绑定」并跳回绑定卡片；`PARSE_EMPTY` 展示后端 message；无效 URL 不会导致页面崩溃。URL 保存在 `localStorage`，刷新后自动恢复上次结果。
- 本阶段（阶段 3）只支持手动粘贴 URL；课程自动发现由阶段 5 的「一键拉取全部课程」补充，仍不包含自动提交作业功能。
- 测试用 `.tools/mock_chaoxing.py` 同时模拟作业列表、表格、空页面与登录跳转；`.tools/verify-homework3.mjs` 覆盖拉取、排序、紧急标记、刷新、缓存恢复、后端重启、解析为空、无效 URL、登录过期与日志脱敏。

### 作业提醒阶段 4：体验完善与边界处理（已完成）

- 进入「作业提醒」页面且已绑定时，自动请求 `GET /api/homework/last` 恢复上次结果，并在列表底部显示「最后同步时间」；未绑定仍展示绑定卡片，已绑定但无缓存时展示「暂无作业数据，请粘贴课程作业页 URL 拉取」。
- `src/api/homework.ts` 对健康检查、凭证、解绑、作业拉取与缓存读取统一加 15 秒超时；超时、后端未启动、HTTP 异常均转为可读提示，自动读取缓存失败也不会静默。后端学习通请求超时设为 12 秒，确保先于前端返回结构化错误。
- 后端离线时展示「未连接」、启动命令与依赖安装提示，页面不会白屏；登录过期仍自动跳回绑定卡片。
- 页面底部固定展示免责声明：「数据来源于学习通网页解析，仅供参考，以学习通官方显示为准；本工具只读，不包含自动提交、自动签到等功能。」
- 「解绑」改为二次确认：先展示内联确认框，取消不发起请求，确认后才删除本地凭证与最近作业缓存。
- 代码整理：学习通登录、凭证加密、作业抓取解析与缓存全部迁到 `backend/chaoxing.py`，`main.py` 只保留 FastAPI 配置、请求模型与路由；作业条目抽成 `src/components/HomeworkItem.tsx`，课程折叠与展开抽成 `src/components/HomeworkCourseGroup.tsx`，日期格式化与排序集中到 `src/lib/homework.ts`。
- `.tools/verify-homework4.mjs` 覆盖：绑定后空状态、拉取与紧急排序、课程折叠与展开、固定免责声明位置与文案、刷新自动恢复及最后同步时间、解绑取消 / 确认、15 秒超时拦截、后端离线状态、无未捕获异常、日志与浏览器存储不含凭证。当前 47/47 通过。

### 作业提醒阶段 5：一键拉取全部课程（已完成）

- `POST /api/homework/fetch-all`：先请求学习通课程列表
  `https://mooc1.chaoxing.com/visit/courselistdata?courseType=1`，解析其中的
  `stucoursemiddle` 链接并按 `courseid + clazzid` 去重；随后用 4 个线程并发处理课程，
  每门课先读取课程页的 `workEnc` 拼出作业列表地址，再解析作业条目。
- 失败隔离：单门课程页或作业列表返回 HTTP 错误、解析异常只记入 `failedCourses`，不影响
  其他课程；作业列表为空视为成功（0 条）。只有全部课程都失败才返回 `NETWORK_ERROR`；
  课程列表跳转登录页返回 `SESSION_EXPIRED`；没有发现课程返回 `PARSE_EMPTY`。
- 汇总结果按「课程 + 标题 + 截止时间 + 状态」跨课程去重，并在课程列表顺序中稳定输出；
  前端继续按「未交置顶、截止时间升序」排序。
- 批量结果缓存到 `backend/data/last_homework.json`：`sourceUrl` 使用内部标记
  `all://courses`，并额外保存 `courseCount` 与 `failedCourses`，刷新页面后能恢复
  「全部 N 门课程」范围、失败提示与同步时间；内部标记不会写入单门 URL 输入框。
- 前端按课程分组展示：每门课程默认只显示最紧急的一条（有未交时必为未交），分组右下角提供
  「展开全部 N 项 / 收起」按钮，展开后显示该课程完整作业列表且未交仍置顶；课程汇总标签显示
  「有作业课程数 · 作业总数」。每次拉取或刷新后重新恢复收起状态。
- 前端新增「拉取全部课程」按钮与独立 120 秒超时；拉取中显示加载状态，部分失败时展示
  失败课程数量、课程名与「刷新」重试提示，全部失败则展示后端 message。单门 URL 拉取与
  「刷新」仍保留：处于全部课程范围时「刷新」会重新拉取全部课程。
- 测试：`.tools/mock_chaoxing.py` 增加课程列表、课程中间页、HTTP 500 失败课程与空作业课程；
  `.tools/verify-homework5.mjs` 覆盖去重、空课程、部分失败隔离、缓存元数据、前端恢复、
  加载状态、课程折叠与右下角展开、单门回退与日志脱敏，当前 36/36 通过。真实账号验证结果：
  12 门课程、23 条作业、0 失败，耗时约 7 秒。模拟服务可通过 `CHAOXING_COURSE_LIST_URL`
  覆盖课程列表地址，默认仍指向官方地址。

## 目录

```
src/
  App.tsx                  路由与页面标题
  api/homework.ts          后端请求封装，单门 15 秒 / 全部课程 120 秒超时
  pages/                   启动页、卡证通页面、作业提醒页面
  components/              步骤条、上传面板、预览卡片、抠图面板、规格面板、HomeworkItem、HomeworkCourseGroup、页脚、图标
  lib/homework.ts          作业日期格式化与未交置顶 / 截止时间排序
  lib/files.ts             文件校验、格式化、图片尺寸读取
  lib/matting.ts           MediaPipe 人像分割、透明合成、快速背景抠图
  lib/face.ts              MediaPipe 人脸检测（智能裁剪定位）
  lib/output.ts            按规格智能裁剪、底色填充、JPG 压缩
  lib/specs.ts             证件照规格常量、规格选择与下载命名
  lib/compliance.ts        像素 / 底色 / 文件大小 / 格式四项合规校验
  lib/steps.ts             流程步骤定义（4 步）
  styles.css               移动端优先样式
backend/
  main.py                  FastAPI 应用、CORS、请求模型与路由
  chaoxing.py              学习通登录、凭证加密存储、单门 / 全部课程作业抓取解析与结果缓存
  .gitignore               忽略 data/ 凭证与缓存目录
  requirements.txt         后端依赖（requests、pycryptodome、cryptography、beautifulsoup4 等）
  data/                    本机凭证与最近作业缓存（运行时生成，不提交）
public/
  wasm/                    MediaPipe Vision WASM 运行时（本地托管）
  models/                  selfie_segmenter、blaze_face_short_range 模型（本地托管）
```
