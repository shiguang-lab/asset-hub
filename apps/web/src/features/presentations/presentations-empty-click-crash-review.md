# 演示页空区域点击崩溃问题审查

## 一、问题现象

在演示编辑器中，点击画布的空区域（非可编辑元素位置）时，整个页面抛出未捕获异常并白屏：

```
Cannot read properties of undefined (reading 'kind')
TypeError: Cannot read properties of undefined (reading 'kind')
    at ElementInspector (presentations.tsx:371:18)
```

`ElementInspector` 内访问 `el.kind` 时 `el` 为 `undefined`。

## 二、根因结论

**点击空区域时，选中信号指向的是"页面 section 容器"的 id，而该 id 不在可编辑元素列表中，导致 `elements.find(...)` 返回 `undefined`，经非空断言 `!` 传入 `ElementInspector` 后访问 `el.kind` 崩溃。**

根因是"预览侧选中范围"比"宿主侧可编辑元素范围"更宽，二者集合不一致，中间又用非空断言 `!` 默认一定命中，缺少运行时防御。

## 三、证据链（自下而上）

### 1. 页面 section 自身带 `data-sg-id`

`packages/content/src/presentation-ast.ts:231`

```ts
const section: LooseNode = {
  type: "element",
  tagName: "section",
  properties: {
    [SG_PAGE]: page.layout,
    [SG_ID]: `page-${page.id}`,   // ← section 本身带 data-sg-id
    [ARIA_LABEL]: page.title,
  },
  ...
```

即每个幻灯片页 `<section data-sg-id="page-xxx">` 都拥有 `data-sg-id`。

### 2. 预览侧点击用 `closest("[data-sg-id]")`，会冒泡到 section

`apps/web/src/features/presentations/presentations.tsx:1181`

```js
document.addEventListener("click", function (e) {
  var el = e.target && e.target.closest ? e.target.closest("[data-sg-id]") : null;
  if (el) { window.parent.postMessage({ source: "sg-editor-preview", type: "select", id: el.getAttribute("data-sg-id") }, "*"); }
});
```

点击空区域时，`e.target` 是 section 内的空白节点，`closest("[data-sg-id]")` 一路向上命中 section 本身，于是发出 `select` 事件，`id = "page-xxx"`（页面容器 id，不是可编辑元素 id）。

### 3. 宿主侧无条件接收并写入 `selectedIds`

`apps/web/src/features/presentations/presentations.tsx:2035`

```ts
if (data.type === "select" && data.id) {
  setSelectedIds([data.id]);            // ← 写入 "page-xxx"
  const pageId = locateElementPage(html, data.id);
  if (pageId) setActivePageId(pageId);   // ← locateElementPage 返回 null，不切换页
}
```

`locateElementPage`（`presentations.tsx:1278`）内部用 `listEditableElements` 判断元素归属页，而 `listEditableElements` 显式跳过 section（见下条），所以对 `"page-xxx"` 返回 `null`，`activePageId` 不变，但 `selectedIds` 已被污染为 `["page-xxx"]`。

### 4. `listEditableElements` 显式跳过页面 section

`packages/content/src/presentation-ast.ts:399`

```ts
walk(page, (el) => {
  if (el.tagName === "section") return; // 跳过页面本身
  const props = el.properties ?? {};
  const id = props[SG_ID];
  if (typeof id !== "string") return;
  ...
  result.push({ id, kind, ... });
});
```

因此 `elements`（当前页可编辑元素列表）**不包含** `"page-xxx"`。

### 5. 渲染分支用非空断言，运行时传入 undefined

`apps/web/src/features/presentations/presentations.tsx:2601`

```tsx
) : (
  <ElementInspector
    el={elements.find((e) => e.id === selectedIds[0])!}   // ← ! 骗过编译器，运行时是 undefined
    onText={editText}
    ...
  />
)
```

此时 `selectedIds.length === 1`（不进"未选中"分支，也不进"多选"分支），`find` 返回 `undefined`，非空断言 `!` 仅对编译器生效，运行时把 `undefined` 传给 `ElementInspector`。

### 6. ElementInspector 解构访问 `el.kind` 崩溃

`apps/web/src/features/presentations/presentations.tsx:325`

```ts
const kind = (el.kind ?? "text") as EditableElementKind;   // ← undefined.kind 抛错
```

对应堆栈 `Cannot read properties of undefined (reading 'kind')`。

## 四、触发条件总结

同时满足即崩溃：

1. 画布页面 section 带 `data-sg-id`（默认成立，`addPage` 生成）；
2. 用户点击画布空区域，`closest("[data-sg-id]")` 冒泡到 section（默认成立）；
3. 宿主 `select` 分支无条件 `setSelectedIds([id])`（默认成立）；
4. 渲染分支对 `find` 结果用 `!` 且无运行时回退（默认成立）。

也就是说，**当前实现下点击任意页的空区域必然崩溃**，并非偶发。

## 五、影响面

- **直接后果**：点击空区域整页白屏，编辑器不可用，需刷新恢复。
- **次生风险**：`selectedIds` 被污染为页面容器 id 后，后续依赖 `selectedIds` 的逻辑（删除 Delete/Backspace、复制、对齐、`editText`/`editAttr` 等）若再被触发，会对一个不存在的元素 id 调用 AST 写入，产生无意义历史记录或二次异常。
- **同类隐患**：`selectedEl`（`presentations.tsx:2166`）虽用了 `?? null` 防御，但渲染分支并未使用它，而是重新 `find` 并加 `!`，两处不一致。

## 六、修复建议（待确认后实施）

### 方案 A（推荐，宿主侧直接防御 + 复用现成 useMemo）

把渲染分支的判断依据从 `selectedIds.length` 改为基于已存在的 `selectedEl`（`presentations.tsx:2166`，已 `?? null`），`find` 不到时回退到"未选中"分支，移除非空断言。

要点：
- `selectedIds.length === 0 || !selectedEl` → 显示"未选中元素"。
- `selectedIds.length > 1` → 多选工具栏。
- 否则 → `<ElementInspector el={selectedEl} ... />`（此时 `selectedEl` 必非空）。

优点：最小改动、直接消除崩溃点、复用既有 `selectedEl`、行为合理（点空区域等同未选中）。缺点：不阻断 `selectedIds` 被污染，但对渲染已无害；若要更干净可叠加方案 B。

### 方案 B（预览侧从源头不发无效选中）

在预览点击处理里排除页面 section 本身：

```js
var el = e.target && e.target.closest ? e.target.closest("[data-sg-id]") : null;
if (el && el.tagName !== "SECTION") {
  window.parent.postMessage({ source: "sg-editor-preview", type: "select", id: el.getAttribute("data-sg-id") }, "*");
}
```

优点：语义更正确——空区域本就不该选中任何东西；`selectedIds` 不会被污染。缺点：只覆盖 `select` 单选路径，`select-multiple`（框选）已用元素中心点命中，不受 section 影响，无需改。

### 方案 C（宿主侧 onMessage 兜底，拒绝无效 id）

在 `select` 分支里，仅当 `locateElementPage` 能定位到页时才 `setSelectedIds`：

```ts
if (data.type === "select" && data.id) {
  const pageId = locateElementPage(html, data.id);
  if (pageId) { setSelectedIds([data.id]); setActivePageId(pageId); }
}
```

优点：统一拦截所有"非可编辑元素 id"（含 page section、未来其他容器）。缺点：会改变"点击跨页元素"的现有行为吗——不会，合法可编辑元素都能被 `locateElementPage` 定位。

### 推荐组合

**方案 A + 方案 B**：A 消除崩溃点（防御兜底），B 从源头让"点空区域"语义正确。两者改动都很小且互补。方案 C 可作为 A 的等价替代，二选一即可。

## 七、待确认事项

1. 是否同意按"方案 A + 方案 B"修复？
2. 是否需要顺带把 `selectedIds` 在删除元素后做一次"过滤掉已不存在 id"的清理（`presentations.tsx:2207` 附近已有类似 filter 思路），避免历史遗留选中指向已删除元素时再次踩到同类非空断言？
3. 是否需要补一条单元/集成测试：构造一个带 `data-sg-id` 的 section，模拟点击空区域，断言不抛错且右侧回到"未选中元素"。