# style-extractor v3.0

用于"网站风格 + 动效 + 结构"**证据提取**的 Skill：从真实网页中提取颜色/字体/间距/组件/状态矩阵，并支持网站结构提取和框架代码生成。

## v3.0 新特性

- **网站结构提取**: DOM 树、布局模式、响应式断点、语义化结构
- **框架代码生成**: HTML 骨架、React TSX、Vue SFC
- **标准导出格式**: 用于风格收集网站的标准 schema
- **组件边界检测**: 自动识别页面组件边界

## v2.0 特性

- **多格式输出**: Markdown、JSON、Tailwind CSS、CSS Variables、StyleKit
- **增强组件检测**: 自动识别按钮、卡片、输入框、导航等组件
- **状态矩阵提取**: 捕获 hover、active、focus、disabled 状态
- **StyleKit 集成**: 直接导入 StyleKit 设计系统
- **改进动效捕获**: 更好支持 JS 驱动的动画

## 功能概览

| 功能 | 说明 |
|------|------|
| **颜色提取** | 提取并语义化命名颜色，包含使用映射 |
| **字体排版** | 字体族、尺寸、字重、行高 |
| **间距系统** | padding、margin、gap 模式 |
| **动效系统** | CSS 动画、过渡、关键帧、时间函数 |
| **组件识别** | 按钮、卡片、输入框、导航，含完整状态矩阵 |
| **结构提取** | DOM 树、布局模式、断点、语义结构 (NEW) |
| **代码生成** | HTML、React TSX、Vue SFC (NEW) |
| **标准导出** | 风格收集网站标准格式 (NEW) |
| **多格式输出** | Markdown、JSON、Tailwind、CSS Variables、StyleKit |

## 依赖

- Node.js（需要能运行 `npx`）
- Chrome（Stable）
- Codex CLI 或 Claude Code（或任何支持 MCP 的客户端）
- **必装：`chrome-devtools-mcp`** - 让 agent 能控制/检查真实 Chrome

## 安装

### 1) 安装 Chrome DevTools MCP

参考 [chrome-devtools-mcp 安装指南](https://github.com/anthropics/chrome-devtools-mcp)

### 2) 安装本 Skill

1. 下载或 clone 本仓库
2. 放到 skills 目录：
   - Claude Code: `~/.claude/skills/public/style-extractor/`
   - Codex: `~/.codex/skills/public/style-extractor/`
3. 确认目录下有 `SKILL.md`

## 使用方法

### 基础提取

```
帮我提取 https://example.com 的风格
```

### 完整提取（所有格式）

```
提取 https://example.com 的风格：
- 完整动效证据
- 组件状态矩阵
- 所有输出格式：Markdown、JSON、Tailwind、StyleKit
```

### 网站复刻（v3.0 新功能）

```
复刻 https://example.com 的结构：
- 提取完整 DOM 结构和布局模式
- 提取响应式断点
- 生成 React 组件代码
- 输出标准导出格式
```

### 组件专项提取

```
提取 https://ui.shadcn.com 的组件样式
重点：按钮、卡片、输入框
包含：完整状态矩阵
输出：JSON + StyleKit
```

## 输出格式

| 格式 | 文件 | 用途 |
|------|------|------|
| **Markdown** | `style.md` | 文档、AI Prompt |
| **JSON** | `tokens.json` | 数据交换、工具集成 |
| **Tailwind** | `tailwind.config.js` | 直接用于 Tailwind 项目 |
| **CSS Variables** | `variables.css` | 原生 CSS 使用 |
| **StyleKit** | `stylekit.ts` | StyleKit 导入 |
| **HTML** | `skeleton.html` | 页面骨架 (NEW) |
| **React** | `react/*.tsx` | React 组件 (NEW) |
| **Vue** | `vue/*.vue` | Vue 组件 (NEW) |
| **Export** | `export.json` | 标准导出 (NEW) |

## 脚本说明

| 脚本 | 用途 |
|------|------|
| `utils.js` | 共享工具、缓存、标准响应 (NEW) |
| `registry.js` | 模块注册表、统一入口 (NEW) |
| `motion-tools.js` | 运行时动画捕获和采样 |
| `library-detect.js` | 检测第三方动画库 |
| `component-detect.js` | 组件模式检测和状态提取 |
| `format-converter.js` | 多格式输出转换 |
| `stylekit-adapter.js` | StyleKit 集成适配器 |
| `structure-extract.js` | 网站结构提取 |
| `code-generator.js` | 框架代码生成 |
| `export-schema.js` | 标准导出格式 |
| `css-parser.js` | CSS 解析和变量提取 |
| `screenshot-helper.js` | 截图规划和辅助 |
| `multi-page.js` | 多页面提取 |
| `theme-detect.js` | 主题检测 (dark/light) |
| `motion-assoc.js` | 动效-组件关联 |
| `incremental.js` | 增量更新和快照 |

## 输出位置

所有生成文件保存到：
```
%USERPROFILE%\style-extractor\<project>-<style>\
├── style.md                    # 风格指南
├── tokens.json                 # 设计 tokens
├── tailwind.config.js          # Tailwind 配置
├── stylekit.ts                 # StyleKit 导入
├── variables.css               # CSS 变量
│
├── structure/                  # 结构数据 (NEW)
│   ├── dom-tree.json
│   ├── layout-patterns.json
│   ├── breakpoints.json
│   └── semantic.json
│
├── code/                       # 生成代码 (NEW)
│   ├── skeleton.html
│   ├── react/
│   │   ├── Page.tsx
│   │   ├── Header.tsx
│   │   └── ...
│   └── vue/
│       └── *.vue
│
├── export.json                 # 标准导出 (NEW)
│
└── evidence/                   # 证据
    ├── screenshots/
    ├── css/
    └── motion/
```

## StyleKit 集成

提取后导入 StyleKit：

1. **直接导入**: 复制 `stylekit.ts` 到 StyleKit 的 `lib/styles/custom/`
2. **通过 UI**: 在 StyleKit 的 `/create-style` 页面粘贴 JSON
3. **MCP 工具**: 使用 StyleKit 的 `import_extracted_style` 工具

## 参考与质量基准

- `references/endfield-design-system-style.md` - 强动效证据写法（推荐）
- `references/motherduck-design-system-style.md` - 静态结构参考

## 模型差异经验

- **Codex**: 更"勤快"，动效证据抓取更全
- **Claude**: 审美更好，但可能跳过动效证据；建议明确要求完整动效

## 最佳实践

1. 始终指定输出格式偏好
2. 对动态网站要求"完整动效证据"
3. 使用参考文件作为质量基准
4. 对交互组件包含状态矩阵
5. 网站复刻时先提取结构再生成代码 (NEW)
6. 使用标准导出格式便于分享 (NEW)

## License

MIT

## Contributing

欢迎在 [github.com/AnxForever/style-extractor](https://github.com/AnxForever/style-extractor) 提 Issue 和 PR
