/**
 * 中日文与半角字符之间的排版空格（W3C「中西文混排」约定）
 * ============================================================================
 * 用户要求：「整个项目中文/日文与半角文字（包括但不限于数字 英语字母等）中间都要有空格」。
 *
 * 两条落点，优先级从高到低：
 *   1. **文案落点**（首选）：`src/locales/{zh,en,ja}.js` 里把空格**写死在文案里**，
 *      例「已导入48条记录」→「已导入 48 条记录」。这样零运行时开销、零幂等风险，
 *      翻译者也能直接看到排版结果。
 *   2. **运行时拼接**（本模块）：极少数「数字/参数与汉字在代码里拼起来」的场景，
 *      例如 URL 模板 `\`${season}季\`` 这种无法预先写进语言包的串，交给 `spaceCJK()`。
 *
 * 判定口径（与验收脚本一致）：
 *   · 汉字（U+4E00–U+9FFF、兼容区 U+F900–U+FAFF）
 *   · 日文假名（U+3040–U+30FF）
 *   与 ASCII 字母 / 数字（A-Z a-z 0-9）**紧邻**时插入一个半角空格，双向都处理。
 *
 * 刻意**不**处理的（避免误伤）：
 *   · 版本号 `v1.12.0`、机型/公式 `S1+S2`、URL、`bgm.tv` —— 这些是「一体化的标识符」，
 *     两侧要么无 CJK、要么本就不该插空格；规则只处理「CJK↔ASCII」紧邻，因此天然不受影响。
 *   · 全角标点（、。，：；（）「」）—— 它们本身就是 CJK 排版的一部分，插空格反而错。
 *   · emoji / 箭头 / 其它符号。
 *
 * 幂等性：插入空格后「CJK 紧邻 ASCII」的相邻对被拆开，正则不再命中，
 * 因此 `spaceCJK(spaceCJK(x)) === spaceCJK(x)`（重复调用不会叠加空格）。
 * 这一点有单测意义：组件重渲染 / computed 重算可能多次调用同一路径。
 */

// 汉字 + 假名（含扩展拉丁？不含，避免误伤）
const CJK_CLASS = '\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff'

// CJK 在前、ASCII 在后：`共7条` → `共 7条`
const RE_CJK_BEFORE_ASCII = new RegExp(`([${CJK_CLASS}])([A-Za-z0-9])`, 'g')
// ASCII 在前、CJK 在后：`7条` → `7 条`
const RE_ASCII_BEFORE_CJK = new RegExp(`([A-Za-z0-9])([${CJK_CLASS}])`, 'g')

/**
 * 在中日文与 ASCII 字母/数字之间插入半角空格（幂等）。
 *
 * @param {string} text 原始文案
 * @returns {string} 排版修正后的文案；非字符串原样返回空串（永不返回 undefined）
 */
export function spaceCJK(text) {
  if (text == null) return ''
  let out = String(text)
  if (!out) return out
  out = out.replace(RE_CJK_BEFORE_ASCII, '$1 $2')
  out = out.replace(RE_ASCII_BEFORE_CJK, '$1 $2')
  return out
}

/**
 * 递归版：对「对象 / 数组 / 字符串」里所有字符串值做 spaceCJK。
 *
 * 用于「语言包整体兜底」之类的场景（当前语言包是人工写死空格的，本函数只在
 * 需要批量处理外部导入文案时才有意义）。不修改入参，返回新对象。
 */
export function spaceCJKDeep(value) {
  if (typeof value === 'string') return spaceCJK(value)
  if (Array.isArray(value)) return value.map(spaceCJKDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = spaceCJKDeep(v)
    return out
  }
  return value
}

export default spaceCJK
