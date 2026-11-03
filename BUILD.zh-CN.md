# 指译 ZCJ Translate 构建与发布说明

本文面向开发人员，说明如何在 Windows 上从本仓库生成可由 Chrome / Edge 加载的离线扩展包。

## 1. 项目性质

本项目是 Chrome Manifest V3 扩展，源代码为原生 HTML、CSS、JavaScript，不需要 Webpack、Vite 或 TypeScript 编译，也不需要运行 `npm install`。所谓“构建”包括：

1. 确认离线词库、OPUS-MT 模型和浏览器运行库完整；
2. 执行语法检查及自动测试；
3. 将运行所需目录打包为 ZIP。

扩展入口为根目录的 `manifest.json`。

## 2. 开发环境

- Windows 10 或 Windows 11（64位）；
- Node.js 18 或更高版本，推荐当前 LTS；
- PowerShell 5.1 或 PowerShell 7；
- Google Chrome 或 Microsoft Edge 的较新稳定版本；
- Git。若仓库以后使用 Git LFS 管理大文件，还需要安装 Git LFS。

检查工具：

```powershell
node --version
git --version
tar --version
```

## 3. 获取代码

```powershell
git clone <仓库地址> zcjtranslate
Set-Location zcjtranslate
```

如果仓库配置了 Git LFS，再执行：

```powershell
git lfs install
git lfs pull
```

不要只下载部分目录。离线运行依赖 `data/`、`models/`、`vendor/` 和 `licenses/`。

## 4. 必需目录

| 路径 | 用途 | 是否进入安装包 |
| --- | --- | --- |
| `manifest.json` | 扩展清单、权限和入口 | 是 |
| `src/` | 内容脚本、后台、离屏推理、PDF/Word阅读器和设置页 | 是 |
| `data/` | 英汉、日中本地词库和元数据 | 是 |
| `models/opus-mt-en-zh/` | OPUS-MT 英译中量化 ONNX 模型及分词文件 | 是 |
| `vendor/transformers/` | Transformers.js 与 ONNX Runtime WASM | 是 |
| `vendor/pdfjs/` | PDF页面和文字层渲染 | 是 |
| `vendor/mammoth/` | DOCX文字解析 | 是 |
| `licenses/` | 第三方许可证 | 是 |
| `scripts/` | 构建、补丁和测试脚本 | 发布包保留，运行时不直接依赖 |

重点检查下列大文件不是 Git LFS 指针文本，也不是零字节文件：

```powershell
Get-Item `
  models/opus-mt-en-zh/onnx/encoder_model_quantized.onnx, `
  models/opus-mt-en-zh/onnx/decoder_model_merged_quantized.onnx, `
  vendor/transformers/ort-wasm-simd-threaded.jsep.wasm `
  | Select-Object FullName, Length
```

两个 ONNX 文件应为数十 MB，WASM 文件约20 MB。如果显示的文件只有几百字节，通常表示 Git LFS 内容没有拉取完整。

## 5. 正常构建流程

### 5.1 设置版本号

修改 `manifest.json` 中的 `version`。Chrome 扩展版本只能使用由数字组成的1至4段格式，例如：

```json
"version": "0.22.2"
```

### 5.2 应用运行库补丁

仓库中的 `vendor/transformers/transformers.min.js` 通常已经打过补丁。该脚本可以重复执行：

```powershell
node scripts/patch-transformers-runtime.js
```

补丁仅取消本项目不使用的 WebGPU 适配器探测和 MarianTokenizer 固定警告。OPUS-MT 仍固定通过4线程 WASM 推理。

### 5.3 语法检查

```powershell
Get-Content src/background.js -Raw | node --input-type=module --check
Get-Content src/content.js -Raw | node --input-type=module --check
Get-Content src/offscreen.js -Raw | node --input-type=module --check
Get-Content src/reader.js -Raw | node --input-type=module --check
Get-Content src/popup.js -Raw | node --input-type=module --check
Get-Content src/options.js -Raw | node --input-type=module --check
Get-Content manifest.json -Raw | ConvertFrom-Json | Out-Null
```

命令没有输出且退出码为0表示语法检查通过。

### 5.4 自动测试

```powershell
node scripts/test-background.js
node scripts/test-runtime-config.js
```

预期输出：

```text
Background routing tests passed
Runtime configuration tests passed
```

### 5.5 在浏览器中开发测试

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`；
2. 开启“开发者模式”；
3. 选择“加载已解压的扩展程序”；
4. 选择包含 `manifest.json` 的项目根目录；
5. 修改代码后，在扩展管理页点击“重新加载”，再刷新测试网页；
6. 测试单词、段落、发音、PDF/DOCX阅读器和断网环境。

扩展重新加载后，旧网页中的内容脚本已经失效，必须刷新旧网页，否则可能看到“Extension context invalidated”。

### 5.6 生成发布 ZIP

在项目根目录执行：

```powershell
$manifest = Get-Content manifest.json -Raw | ConvertFrom-Json
$version = $manifest.version
$output = "zcjtranslate-v$version.zip"
tar -a -c -f $output `
  src data scripts licenses models vendor `
  manifest.json README.md BUILD.zh-CN.md USER_GUIDE.zh-CN.md `
  THIRD_PARTY_NOTICES.md
Get-Item $output | Select-Object FullName, Length, LastWriteTime
```

检查包内结构：

```powershell
tar -tf $output | Select-Object -First 30
```

ZIP 根层必须直接包含 `manifest.json`，不能再多套一层项目文件夹。

## 6. 发布前验收

- 开启 Windows 飞行模式或断开网络，英文段落仍能由 OPUS-MT 翻译；
- 选择单个英文词，显示释义、音标和发音按钮；
- 英文段落显示本地整句译文及最多10个难词；
- 日文单词及常用日文句子能显示本地结果；
- 鼠标停留0.5秒触发悬停翻译，继续移动后悬停框立即关闭；
- 长译文浮窗位于选区下方、占满可用宽度，并保持在屏幕范围内；
- PDF保留原页面图片和版式，普通选择与框选翻译都可用；
- DOCX可以在内置阅读器中打开并翻译文字；
- 扩展详情页没有持续新增的错误；
- `manifest.json` 不含在线翻译域名权限。

## 7. 可选：重新生成数据

正常发布不需要重新生成数据；仓库已经保存运行时数据。以下操作只用于更新上游词库。

### 7.1 初中、高中词库合并

准备：

```text
.tmp-qwerty/JUNIOR_HIGH.json
.tmp-qwerty/SENIOR_HIGH.json
```

执行：

```powershell
node scripts/build-dictionary.js
```

该脚本是在现有 `data/dictionary.json` 基础上合并学校词汇，不会从零重建四六级和专八数据。

### 7.2 ECDICT兜底词库

准备 `.tmp-ecdict/ecdict.csv`，并确保主词库和补充词库已经存在，然后执行：

```powershell
node scripts/build-ecdict-fallback.js
```

### 7.3 日中词库

准备 `.tmp-japanese/final.json`，然后执行：

```powershell
node scripts/build-japanese-dictionary.js
```

生成数据后必须重新执行自动测试，并核对 `data/*-metadata.json` 的数量。

## 8. 可选：恢复第三方浏览器库

只有更新第三方版本或文件损坏时才需要操作。当前固定版本为：

- `@huggingface/transformers` 3.7.6；
- `pdfjs-dist` 4.10.38；
- `mammoth` 1.8.0。

下载源码包：

```powershell
npm pack @huggingface/transformers@3.7.6
npm pack pdfjs-dist@4.10.38
npm pack mammoth@1.8.0
```

从包中提取并放置：

- Transformers.js：`package/dist/transformers.min.js`、`ort-wasm-simd-threaded.jsep.mjs`、`ort-wasm-simd-threaded.jsep.wasm` → `vendor/transformers/`；
- PDF.js：`package/build/pdf.mjs`、`pdf.worker.mjs` → `vendor/pdfjs/`；
- Mammoth：`package/mammoth.browser.min.js` → `vendor/mammoth/`。

替换 Transformers.js 后必须重新运行：

```powershell
node scripts/patch-transformers-runtime.js
node scripts/test-runtime-config.js
```

更新第三方版本时，还要同步更新 `THIRD_PARTY_NOTICES.md` 和 `licenses/`。

## 9. GitHub大文件说明

当前单个 ONNX 文件小于 GitHub 的100 MB单文件上限，但模型和WASM会显著增大仓库。团队可以选择 Git LFS 管理：

```powershell
git lfs track "models/**/*.onnx"
git lfs track "vendor/**/*.wasm"
git add .gitattributes
```

不能把 `models/` 或 `vendor/` 加入 `.gitignore`，否则其他开发者无法构建完全离线版本。
