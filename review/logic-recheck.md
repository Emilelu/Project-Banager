# logic 复核（lead 改 useEpisode.js / useDatePicker.js 之后）

命令：`pnpm exec vitest run tests/logic.test.js`（vitest 5.0.5）

结果：**120 passed | 13 failed | 4 expected fail**（137）。Test Files 1 failed。未改 `src/`、测试文件、`package.json`，未 commit。

分类：

- **12** 条是 `it.fails`（注释写明「当前源码下必须失败」）。源码已修好，断言通过，vitest 报 `Error: Expect test to fail`。**不是源码缺陷**，是测试标记过期。去掉 `.fails` 即变回归用例。
- **1** 条是普通 `it`，断言与现行源码冲突。**仍是源码缺陷**（若空串应排在有效日期之前）。

## 仍失败、但源码已符合用例期望（it.fails 过期）

### useEpisode.smartIncrement

| 测试名 | 期望 | 实际 | 源码缺陷 |
| --- | --- | --- | --- |
| 空小数位 "1." 不应生成 NaN（缺陷保留） | `smartIncrement('1.') === '1.1'` | `'1.1'`（`decStr` 为空时按 0 再加 1） | 否 |

`useEpisode.js:20-22`：`/^\d*$/` 接受空小数，`(parseInt('' \|\| '0', 10) \|\| 0) + 1`。

### useEpisode.smartDecrement

| 测试名 | 期望 | 实际 | 源码缺陷 |
| --- | --- | --- | --- |
| 26.00 减一不应把整集清成 0（数据丢失，缺陷保留） | `'26.00'` | `'26.00'`（小数已是 0 时钳在 `intPart.000`） | 否 |
| 1.0 减一不应把整集清成 0（数据丢失，缺陷保留） | `'1.0'` | `'1.0'` | 否 |
| 00 减一应保持两位补零（缺陷保留） | `'00'` | `'00'`（`intVal <= 0` 且 `hasPadding` 时按原宽度补零） | 否 |

`useEpisode.js:35-43`。同组 `26.10 → 26.09` 的 `it.fails` 也已通过（4 expected fail 之一）。

### useEpisode.normalizeEpisodeInput

| 测试名 | 期望 | 实际 | 源码缺陷 |
| --- | --- | --- | --- |
| Infinity 是非法输入，应归 0（缺陷保留） | `'0'` | `'0'` | 否 |
| 1e999 溢出后不应以 Infinity 入库（缺陷保留） | `'0'` | `'0'` | 否 |
| 负数集数应归 0（缺陷保留） | `'0'` | `'0'` | 否 |
| 科学计数法 1e-7 不应原样入库（缺陷保留） | `'0'` | `'0'` | 否 |

`useEpisode.js:52-58`：只接受 `^\d+$` 或 `^\d*\.\d*$`，其余归 `'0'`。`String(Infinity)` / `1e999` / `-5` / `1e-7` 都不匹配。

### useEpisode.buildItemUrl

| 测试名 | 期望 | 实际 | 源码缺陷 |
| --- | --- | --- | --- |
| url 以 ? 结尾时不应生成 ?&（缺陷保留） | `https://a.test/x?p=1` | `https://a.test/x?p=1` | 否 |

`useEpisode.js:64,69-71`：先剥掉 url / params 尾部的 `?&`，再按是否仍含 `?` 决定连接符。

### useDatePicker.compareDateKey

| 测试名 | 期望 | 实际 | 源码缺陷 |
| --- | --- | --- | --- |
| 未补零月份 2025/7 应排在 2025/10 前（缺陷保留） | `-1` | `-1` | 否 |
| 同一日期未补零/补零写法应视为相等（缺陷保留） | `0` | `0` | 否 |
| 未补零小时 9:05 应排在 14:30 前（缺陷保留） | `-1` | `-1` | 否 |

`useDatePicker.js:134-136`：按捕获组 `Number()` 比较，不再走未补零字符串的字典序。

另外 4 条仍正确标为 expected fail（源码已符合断言、不计入上面 13 条失败）：`26.10 → 26.09`、`validateDate(2025)` 返回 invalid 且不抛、年份范围不进「未分类」、`useTheme` 卸载移除 matchMedia 监听。

## 仍是源码缺陷

| 测试名 | 期望 | 实际 | 源码缺陷 |
| --- | --- | --- | --- |
| 同值/不同精度的已补零日期按时间序排列 | `compareDateKey('', '2025') < 0`（空串排在有效日期前） | `1` | **是** |

位置：`tests/logic.test.js:331`。同用例前 6 个断言已通过（同值相等、年 < 年月 < 年月日 < 带时间、范围 `2014~2017` < `2015/01`）。

原因：`useDatePicker.js:139-145` 把任一端为空的比较提前返回，空的一侧为 `1`（空串排在后面）。`dateParts('')` 本是 `null`（`:131`），但比较函数没有走到它。文件头约定是「短前缀排在同年前面」，该用例把空串也放在有效日期前面。若产品要「空日期沉底」，应改测试期望为 `toBeGreaterThan(0)`，而不是改比较函数。按当前测试字面，这是源码与用例不一致，记为仍须修。

---

## 外观测试与仍须修的 P1

命令：`pnpm exec vitest run tests/appearance.test.js`

结果：**23 passed (23)**，Test Files 1 passed。appearance 测试没有失败项。

`review/appearance.md` 统计 P0×0、P1×2。两处对照当前源码仍然成立，外观测试没有覆盖它们：

1. **渐变按钮白字对比度**。`ThemeSettings.vue:46,103,175` 仍是 `from-primary to-primary-light text-white`。`useAppearance.js:263-268` 仍把 `--c-primary-light` 朝深底 `bgY=0.12` 提亮，同一个变量又当按钮浅色端点。报告实测白字最低约 1.30:1，低于 WCAG AA 4.5:1。
2. **xlsx 0.18.5 两个 CVE**。`package.json:18` 仍是 `"xlsx": "^0.18.5"`。`excelImporter.js:389` 仍对用户文件执行 `XLSX.read(arrayBuffer, { type: 'array' })`。CVE-2023-30533（原型污染，0.19.3 修）与 CVE-2024-22363（ReDoS，0.20.2 修）都未覆盖。本次只读，未动依赖。

其余 P2/P3 不在本次最多 5 项之内。logic 侧唯一仍须改源码的是上面的空串排序。
