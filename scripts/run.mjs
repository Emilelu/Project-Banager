#!/usr/bin/env node
/**
 * run — 绕过 PowerShell 转义的脚本执行器。
 *
 * ## 为什么需要它
 *
 * 本机是 Windows + PowerShell 5.1。开发中反复遇到的失败模式：
 *
 *   node -e "const x = `hello`"        → PowerShell 把反引号当转义符 → 语法错误
 *   node -e "if(a && b) ..."           → PowerShell 把 && 当语句分隔符
 *   node -e "x = a || b"               → 同上
 *   node -e "console.log('中文 \$x')"   → $x 被 PowerShell 当变量展开
 *   node -e "...正则 /[、-]/..."        → 中文范围字符被编码破坏
 *
 * 这些都不是 Node 的问题，而是 **PowerShell 在传给 node 之前就已经解析了一遍**。
 * 无论怎么加引号、转义，只要内容带有 PowerShell 元字符（` " $ & | < > @ ! ）或
 * 非 ASCII 字符，就总有某个场景会挂。
 *
 * ## 解法
 *
 * 本工具把「要执行的 JS 代码」**从文件读**，而不是从命令行参数读。
 * 命令行只传一个文件路径（纯 ASCII、无元字符），PowerShell 解析不会破坏任何东西。
 *
 * 于是可以彻底不写 `node -e "..."`，改成：
 *
 *   node scripts/run.mjs tmp.js          # 执行临时文件
 *   node scripts/run.mjs --clean tmp.js  # 执行后删除
 *   node scripts/run.mjs --stdin         # 从 stdin 读（配合管道）
 *   node scripts/run.mjs --check tmp.js  # 只做语法检查，不执行
 *
 * ## 配合文件的方式
 *
 * 需要写一段带反引号/中文/正则的脚本时：
 *   1) 用 write 工具把代码写到 tmp/<name>.mjs（**编辑器写入，不经过 PowerShell**）
 *   2) node scripts/run.mjs --clean tmp/<name>.mjs
 *
 * 这样从「写」到「跑」全程没有 PowerShell 字符串参与，转义问题不存在。
 *
 * ## 额外能力：内联命令
 *
 * 万一确实需要短内联命令（不含元字符、纯 ASCII 安全场景），本工具的 --safe
 * 模式会先校验内容：含 PowerShell 元字符就直接拒绝执行并提示改用文件方式，
 * 避免写出「看起来能跑、实际被改写」的静默错误。
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'tmp')

/** PowerShell 会解释的元字符（出现在代码里就说明内联执行一定被破坏） */
const PS_META = ['`', '$', '"', '&', '|', '<', '>', '@', '!', '\uFF06', '\uFF5C']

function die(msg) {
  console.error('[run] ' + msg)
  process.exit(1)
}

function hasMetaChars(code) {
  return PS_META.filter((ch) => code.includes(ch))
}

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
}

/**
 * 语法检查：用 node --check 校验，失败时把错误原样抛出。
 * 对 .mjs / .cjs / .js 都可用。
 */
function checkSyntax(file) {
  const ext = path.extname(file) || '.mjs'
  const tmp = file.replace(new RegExp(ext.replace('.', '\\') + '$'), '') + '__syntaxcheck' + ext
  // 直接用 node --check 检查原文件即可（ESM 也能查）
  const r = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  return r.status === 0
}

/** 执行一个 JS 文件，返回退出码 */
function runFile(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file)
  if (!fs.existsSync(abs)) die('文件不存在: ' + file)

  const ext = path.extname(abs)
  const r = spawnSync(process.execPath, [abs], {
    stdio: 'inherit',
    cwd: ROOT,
  })
  return r.status ?? 1
}

function main() {
  const args = process.argv.slice(2)
  if (!args.length) {
    console.error(`用法:
  node scripts/run.mjs <file>              执行 JS 文件（推荐）
  node scripts/run.mjs --clean <file>      执行后删除文件
  node scripts/run.mjs --check <file>      只做语法检查
  node scripts/run.mjs --safe "<code>"     内联执行（仅限无元字符的纯 ASCII 短代码）
  node scripts/run.mjs --stdin             从 stdin 读代码并执行
`)
    process.exit(1)
  }

  let clean = false
  let checkOnly = false
  let safeInline = null
  let stdinMode = false
  let file = null

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--clean') clean = true
    else if (a === '--check') checkOnly = true
    else if (a === '--stdin') stdinMode = true
    else if (a === '--safe') {
      safeInline = args[++i]
      if (safeInline === undefined) die('--safe 需要一个参数')
    } else if (a.startsWith('--')) die('未知参数: ' + a)
    else file = a
  }

  // ---- 内联安全模式 ----
  if (safeInline !== null) {
    const bad = hasMetaChars(safeInline)
    if (bad.length) {
      die(
        '内联代码含 PowerShell 元字符 ' +
          JSON.stringify(bad) +
          '，内联执行一定会被破坏。\n' +
          '请改用文件方式：用 write 工具写到 tmp/x.mjs，然后 node scripts/run.mjs tmp/x.mjs',
      )
    }
    const nonAscii = [...safeInline].filter((c) => c.charCodeAt(0) > 127)
    if (nonAscii.length) {
      die('内联代码含非 ASCII 字符，请改用文件方式（避免 GBK 代码页破坏）。')
    }
    ensureTmpDir()
    const f = path.join(TMP_DIR, '_inline_.mjs')
    fs.writeFileSync(f, safeInline, 'utf8')
    const code = runFile(f)
    fs.rmSync(f, { force: true })
    process.exit(code)
  }

  // ---- stdin 模式 ----
  if (stdinMode) {
    let src = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => { src += d })
    process.stdin.on('end', () => {
      ensureTmpDir()
      const f = path.join(TMP_DIR, '_stdin_.mjs')
      fs.writeFileSync(f, src, 'utf8')
      const code = runFile(f)
      fs.rmSync(f, { force: true })
      process.exit(code)
    })
    return
  }

  // ---- 文件模式 ----
  if (!file) die('缺少文件参数')

  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file)
  if (!fs.existsSync(abs)) die('文件不存在: ' + file)

  if (checkOnly) {
    const ok = checkSyntax(abs)
    console.log(ok ? '✓ 语法正常' : '✗ 语法有误')
    process.exit(ok ? 0 : 1)
  }

  const code = runFile(abs)
  if (clean) fs.rmSync(abs, { force: true })
  process.exit(code)
}

main()
