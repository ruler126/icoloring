# iColoring MVP

一个可运行的 `iColoring` 核心功能复刻版，聚焦以下能力：

- 文本生成涂色页
- 图片转黑白线稿
- 结果预览与 PNG 下载
- 本地历史记录

## 技术栈

- `Next.js 16`
- `React 19`
- `Tailwind CSS 4`
- `sharp` 用于图片处理
- 文件系统存储生成结果和历史记录

## 运行方式

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 部署方式

### Windows 本地一键运行包

默认使用本地文件存储，不需要配置云存储：

```powershell
npm install
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-local-package.ps1
```

打包结果位于 `dist-local\FreeFishLocalApp`，双击其中的 `start.bat` 即可运行。

### Linux 独立部署

Linux 单机部署也默认使用本地文件存储，生成图片和历史记录会写入项目根目录的 `storage`：

```bash
npm install
npm run build
npm run start
```

如需显式指定本地存储，可设置：

```bash
ICOLORING_STORAGE_DRIVER=local
```

### EdgeOne 独立部署

EdgeOne Pages 使用 `edgeone.json` 中的配置构建 Next.js 全栈项目。由于 EdgeOne 云函数环境不适合持久写入本地文件，EdgeOne 部署应使用腾讯云 COS：

```bash
ICOLORING_STORAGE_DRIVER=cos
COS_SECRET_ID=你的 SecretId
COS_SECRET_KEY=你的 SecretKey
COS_BUCKET=example-1250000000
COS_REGION=ap-guangzhou
COS_PREFIX=icoloring-edgeone
```

`COS_PREFIX` 用于隔离不同部署环境。Linux 和 EdgeOne 如果使用不同的存储方式或不同的 bucket/prefix，就会互不影响。

可选配置：

```bash
COS_ENDPOINT=https://example-1250000000.cos.ap-guangzhou.myqcloud.com
```

EdgeOne 部署仍需实际验证 `sharp` 原生模块在目标地域的 Cloud Functions 环境中可用；项目已在 `edgeone.json` 中把 `sharp` 配置为外部原生依赖。

## 功能说明

### 1. 文本生成涂色页

- 支持两种来源：
- `免费接口`：默认调用公开图片生成接口，不需要 API key，失败时自动回退到本地 SVG 模板生成
- `自定义 AI 服务`：在页面中直接填写 `baseURL`、`API key`、`模型名`
- 自定义 AI 服务按常见的 OpenAI 风格图片生成接口处理：
  - 如果填的是 `https://api.example.com`，系统会请求 `https://api.example.com/v1/images/generations`
  - 如果填的是 `https://api.example.com/v1`，系统会请求 `https://api.example.com/v1/images/generations`
  - 如果你直接填完整地址 `/images/generations`，系统会按原地址请求
- 自定义配置仅保存在浏览器本地，不写入服务器环境变量
- 自定义 AI 服务可选择“失败时回退到本地模板”

### 2. 图片转线稿

- 支持上传 `PNG`、`JPG`、`WEBP`
- 通过本地边缘提取生成适合打印的黑白轮廓图
- 提供 `干净轮廓`、`卡通线稿`、`素描风格` 三种效果

### 3. 历史记录

- 生成结果会写入 `storage/history.json`
- 图片文件保存在 `storage/generated`
- 页面会展示最近 18 条记录

## 注意

- 这是核心功能 MVP，不包含登录、积分、支付、SEO 落地页和多语言系统
- 免费文本生成依赖公开接口，结果稳定性和服务策略会受外部网络影响
- 自定义 AI 服务当前按 OpenAI 兼容图片接口实现，如果你的服务商协议不同，需要再调整请求格式
- 如果你后续要接入正式 AI 服务，可以把逻辑替换到 `src/lib/ai.ts`
