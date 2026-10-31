/**
 * 数据层错误 → 当前语言文案。
 *
 * 数据层（src/db/*）刻意不依赖 UI 层，所以它返回的错误消息是**中文原文**。
 * 本模块在 UI 层做一次映射：用「数据层原文 → 字典 key」的对照表把中文换成当前语言。
 * 数据层若将来改成返回 errorCode，这里也认 —— 表里同时登记了文案与 code。
 *
 * 用法：
 *   const { tt } = useI18n()
 *   const { errorText } = useErrorText()
 *   showToast(errorText(res?.data, tt, 'toast.operationFailed'), 'error')
 */
import { t } from './useI18n'

/**
 * 数据层错误「原文 / errorCode」→ 字典 key。
 * - 中文原文：对应 src/db/index.js 里 return { success:false, error: '...' }
 * - code：若数据层将来升级为 errorCode，无需改 UI
 */
const DB_ERRORS = [
  // ---- 标签 ----
  { text: '标签名不能为空', code: 'TAG_NAME_EMPTY', key: 'dbErr.tagNameEmpty' },
  { text: '该标签已存在', code: 'TAG_EXISTS', key: 'dbErr.tagExists' },
  { text: '标签不存在', code: 'TAG_NOT_FOUND', key: 'dbErr.tagNotFound' },
  { text: '内置标签不能删除', code: 'TAG_BUILTIN_UNDELETABLE', key: 'dbErr.tagBuiltinUndeletable' },
  // ---- 番剧 / 等番 / 已看 ----
  { text: '番剧名称不能为空', code: 'SHOW_NAME_EMPTY', key: 'dbErr.showNameEmpty' },
  { text: '该番剧已存在', code: 'SHOW_EXISTS', key: 'dbErr.showExists' },
  { text: '等番名称不能为空', code: 'REMAINING_NAME_EMPTY', key: 'dbErr.remainingNameEmpty' },
  { text: '该等番已存在', code: 'REMAINING_EXISTS', key: 'dbErr.remainingExists' },
  { text: '作品名称不能为空', code: 'WORK_NAME_EMPTY', key: 'dbErr.workNameEmpty' },
  { text: '年份标签不能为空', code: 'YEAR_LABEL_EMPTY', key: 'dbErr.yearLabelEmpty' },
  { text: '该年份已存在', code: 'YEAR_EXISTS', key: 'dbErr.yearExists' },
  // ---- 通用 ----
  { text: '没有可更新的字段', code: 'NO_FIELDS_TO_UPDATE', key: 'dbErr.noFieldsToUpdate' },
  { text: '未找到记录', code: 'NOT_FOUND', key: 'dbErr.notFound' },
  { text: '不支持的表', code: 'TABLE_NOT_SUPPORTED', key: 'dbErr.tableNotSupported' },
  // ---- 引擎 / 备份 ----
  { text: '无法加载数据库引擎(WASM)，请通过本地服务器访问页面，或确保网络连接正常', code: 'DB_WASM_LOAD_FAILED', key: 'dbErr.wasmLoadFailed' },
  { text: '数据库引擎尚未初始化', code: 'DB_NOT_INITIALIZED', key: 'dbErr.notInitialized' },
  { text: '不是有效的 SQLite 备份文件', code: 'DB_NOT_SQLITE', key: 'dbErr.notSqlite' },
  { text: '源记录删除失败', code: 'DB_SOURCE_DELETE_FAILED', key: 'dbErr.sourceDeleteFailed' },
  { text: '读取本地数据库失败，已停止启动以免用空库覆盖原有数据', code: 'DB_LOCAL_READ_FAILED', key: 'dbErr.localReadFailed' },
  { text: 'watching 迁移行数不一致', code: 'DB_MIGRATION_MISMATCH', key: 'dbErr.migrationMismatch' },
]

const BY_TEXT = new Map(DB_ERRORS.map((e) => [e.text, e.key]))
const BY_CODE = new Map(DB_ERRORS.map((e) => [e.code, e.key]))

/**
 * 把 { errorCode, error } 形状的结果翻译成当前语言文案。
 * @param {{ errorCode?: string, error?: string }} payload
 * @param {(key: string, params?: object) => string} [translate]
 * @param {string} [fallbackKey] 没有 error/errorCode 时用的字典 key
 * @returns {string}
 */
export function errorText(payload, translate = t, fallbackKey = 'toast.operationFailed') {
  const code = payload?.errorCode
  const key = code ? BY_CODE.get(code) : undefined
  if (key) {
    const text = translate(key)
    if (text !== key) return text
  }
  const raw = payload?.error
  if (raw) {
    // 库里存的是中文原文：查表换成当前语言；查不到（sql.js 英文底层错误等）原样显示
    const mapped = BY_TEXT.get(String(raw))
    if (mapped) {
      const text = translate(mapped)
      if (text !== mapped) return text
    }
    return String(raw)
  }
  return translate(fallbackKey)
}

/** Error 对象（throw 出来的）转文案；同样先查 code、再查中文原文 */
export function errorMessageText(err, translate = t, fallbackKey = 'toast.operationFailed') {
  if (!err) return translate(fallbackKey)
  if (typeof err === 'string') return errorText({ error: err }, translate, fallbackKey)
  const code = err.errorCode
  const key = code ? BY_CODE.get(code) : undefined
  if (key) {
    const text = translate(key)
    if (text !== key) return text
  }
  if (err.message) {
    const mapped = BY_TEXT.get(String(err.message))
    if (mapped) {
      const text = translate(mapped)
      if (text !== mapped) return text
    }
    return String(err.message)
  }
  return translate(fallbackKey)
}

/** 组件里用：绑定当前语言 */
export function useErrorText() {
  return {
    errorText: (payload, fallbackKey) => errorText(payload, t, fallbackKey),
    errorMessageText: (err, fallbackKey) => errorMessageText(err, t, fallbackKey),
  }
}

