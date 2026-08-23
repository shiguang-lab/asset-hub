# 演示编辑器「配色」区块 UX 审查

## 一、现状定位

代码位置：`apps/web/src/features/presentations/presentations.tsx:2540-2564`

```tsx
<div className="sg-el-field" style={{ marginTop: 12 }}>
  <span className="sg-el-label">配色</span>
  <div className="sg-el-palette-row">
    {THEME_PRESETS.map((p) => (
      <button
        type="button"
        key={p.key}
        title={p.label}
        className={`sg-el-palette ${isSamePalette(themePalette, p.palette) ? "active" : ""}`}
        style={{ background: p.palette.primary }}
        onClick={() => applyThemePreset(p.key)}
      />
    ))}
    <label className="sg-el-palette sg-el-palette-custom" title="自定义主色">
      <input
        type="color"
        value={themePalette?.primary && themePalette.primary.startsWith("#") ? themePalette.primary : "#7c5cff"}
        onChange={(e) => applyCustomPrimary(e.target.value)}
      />
    </label>
  </div>
</div>
```

预设数据：`packages/content/src/presentation.ts:222` `THEME_PRESETS`，共 7 个（紫/蓝/绿/橙/红/暗夜/极简灰），每个 `palette` 含 `background/textPrimary/textSecondary/surface/primary` 五个字段。

## 二、根因：配色色块完全没有样式定义

在 `apps/web/src/styles/presentations.ts` 中搜索 `sg-el-palette` / `sg-el-palette-row` / `sg-el-palette-custom` —— **零命中**。这三个类名没有任何 CSS 规则。

对比同文件里文本颜色色块（`sg-el-swatch` / `sg-el-color-row` / `sg-el-color-input`，`presentations.ts:1071-1101`）则有完整样式：22×22、圆角 6px、border、hover 缩放、active outline。

也就是说：主题配色色块全靠 `<button>` 默认样式 + inline `background` 渲染，尺寸/圆角/边框/间距/选中态全部没有保障。截图里看到的"粗糙感"来源于此。

## 三、问题清单

1. **色块无样式**：`sg-el-palette` 系列类无 CSS 定义，色块尺寸不一、无圆角/边框/统一间距，靠浏览器默认 button 渲染。
2. **选中态不可见**：`active` 类无样式规则，用户看不出当前选中哪个预设（截图分析亦指出"选中状态未标注"）。
3. **自定义入口是裸 `<input type="color">`**：包在 `<label>` 里，浏览器默认渲染成"灰框 + 色块"（截图中的"选中预览框"即是它），各浏览器表现不一致，且无"自定义"文案/图标提示，可发现性差。
4. **预设无名称**：色块只有 `title` tooltip，无可见 label，用户不悬停不知道"紫/蓝/绿"。
5. **只展示 primary，不展示整体 palette**：每个预设含背景/文字色/表面色等，但 UI 只画一个 primary 色块，用户选择前看不到整体效果。
6. **主题与配色语义重叠**：`THEME_PRESETS` 里含"暗夜"预设，而上方"主题"Select 又有"深色"选项，二者关系不清，用户易混淆。
7. **无"重置/最近使用"**：选了自定义主色后没有一键回到预设或默认的入口。

## 四、成熟产品参考

- **WPS 主题色**：一行预设色块（带名称），选中色块有粗边框 + 勾；"自定义"是独立按钮，点击弹取色器；常带"最近使用"。
- **Google Slides / Notion / Figma**：色块统一尺寸、圆角、hover 态、选中态用 ring 或勾；自定义用专门 ColorPicker 组件。
- **antd v6**：内置 `ColorPicker` 组件（项目已用 antd ^6.6.0），可直接用于自定义主色，免去裸 input[type=color]。

## 五、改进方案（待确认后实施）

### 方案 1（推荐，最小改动 + 复用现成组件）

**A. 补样式**：在 `presentations.ts` 仿 `sg-el-swatch` 设计语言新增 `sg-el-palette-row` / `sg-el-palette` / `sg-el-palette-custom` 规则：
- `sg-el-palette-row`：flex + gap:6px + flex-wrap。
- `sg-el-palette`：24×24、圆角 6px、1px border、hover scale(1.1)、`active` 用 2px outline + offset（复用 `--sg-primary`）。
- 选中态加一个伪元素勾（`::after` ✓）或直接 outline，与 `sg-el-swatch.active` 一致。

**B. 自定义入口换 antd `ColorPicker`**：把裸 `<input type="color">` 替换为 `<ColorPicker value={...} onChange={(c) => applyCustomPrimary(c.toHexString())} />`，外观为标准色块 + 弹层取色，跨浏览器一致，可发现性高（[PREFERENCE_1] 倾向现成组件）。

**C. 预设色块加可见名称**：色块下方或 tooltip 显示"紫/蓝/绿…"。若空间紧，保留 tooltip + 选中时在"配色"标签右侧显示当前预设名。

### 方案 2（进一步，参考 WPS 整体感）

在方案 1 基础上：
- 色块改为"mini 预览条"：每个预设画 3 段（背景/表面/主色），让用户一眼看到整体配色。
- 加"重置"按钮：`themePalette` 不为空时显示，点击清回主题默认。
- 把"暗夜"预设从 `THEME_PRESETS` 移除或重命名，避免与"主题"Select 的"深色"语义冲突。

### 不建议
- 自行实现取色器（[PREFERENCE_1] 倾向成熟组件，antd `ColorPicker` 已够用）。

## 六、待确认事项

1. 采用方案 1 还是方案 1+2？
2. 自定义主色入口用 antd `ColorPicker` 是否可接受（会引入 antd ColorPicker 的弹层交互）？
3. 预设色块是否需要可见名称，还是保留 tooltip 即可？
4. 是否需要"重置"按钮？
5. 是否需要 mini 预览条（方案 2 的 3 段预览）？