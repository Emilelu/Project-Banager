#!/usr/bin/env node
/**
 * 安全的文本编辑工具 —— 替代 PowerShell 做任何含中文的文本操作。
 *
 * 为什么需要它：
 *   本机只有 PowerShell 5.1，系统 ANSI 代码页是 936（GBK）。
 *   `Set-Content` / `-replace | Out-File` / `Get-Content | Set-Content` 这类操作
 *   会把文件当 GBK 读写，导致 UTF-8 源码里的中文变成乱码，
 *   更糟的是乱码会吞掉引号/换行，把代码变成语法错误（本会话已发生多次，
 *   曾导致 14 个测试文件全部编译失败、取色器点击无反应）。
 *
 *   本脚本全程显式 UTF-8（无 BOM），并支持：
 *     · 校验全项目是否有乱码 / BOM / CRLF
 *     · 按「字面量」安全替换（不经过正则转义地狱）
 *     · 按行号替换（乱码文件的最后手段）
 *     · 查找含乱码的文件
 *
 * 用法：
 *   node scripts/text.js check                  # 全项目体检（乱码/BOM/CRLF）
 *   node scripts/text.js find-mojibake          # 只列出含乱码的文件
 *   node scripts/text.js replace <file> <from> <to>    # 字面量替换（自动转义安全）
 *   node scripts/text.js replace-file <file> <jsonFile> # 从 JSON 读 {from,to} 数组批量替换
 *   node scripts/text.js set-line <file> <n> <content>  # 按行号替换
 *   node scripts/text.js read-lines <file> <from> <to>  # 按行号区间查看
 *
 * 设计取舍：
 *   · 不做模糊匹配，替换必须**精确全等**，找不到就报错退出（不静默）；
 *   · 写入前先自检：结果文件必须仍是合法 UTF-8 且不含 U+FFFD；
 *   · 默认保留原文件的换行风格（LF/CRLF），不擅自改变，避免 git 全量 diff。
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
// 只扫产品源码与文档；tests/e2e 下是临时验证脚本（写完即删），
// 且本工具自身在注释里列举了乱码特征字符，会被误判，故一并排除。
const SCAN_DIRS = ['src']
const SCAN_FILES = ['README.md', 'README.en.md', 'README.ja.md', 'CHANGELOG.md', 'package.json', 'vite.config.js']
const EXCLUDE_FILES = new Set([path.join('scripts', 'text.js')])

// 常见的中文乱码特征片段（GBK 被当 UTF-8 解码后的典型产物）
const MOJIBAKE = /[\uFFFD]|锛|銆|鐨|鍜|鏄|涓|鐢|鍥|寮|鏂|绗|娴|璁|閿|鐐|鍒|鍚|闇|鏃|绫|妯|缁/

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8')
}

function writeUtf8(p, content) {
  // 写入前自检：不允许把乱码写回去
  const bad = content.match(/\uFFFD/g)
  if (bad) throw new Error(`拒绝写入：内容含 ${bad.length} 个 U+FFFD 替换字符（${p}）`)
  fs.writeFileSync(p, content, 'utf8')
}

function detectEol(content) {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function walkFiles(dirs) {
  const out = []
  const skipDirs = new Set(['node_modules', 'dist', '.git', 'tests/e2e'])
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const fp = path.join(dir, name)
      const st = fs.statSync(fp)
      if (st.isDirectory()) {
        if (skipDirs.has(name) || fp.includes('tests/e2e')) continue
        walk(fp)
      } else if (/\.(js|mjs|cjs|vue|css|json|md|html|ya?ml)$/.test(name)) {
        out.push(fp)
      }
    }
  }
  for (const d of dirs) walk(d)
  for (const f of SCAN_FILES) {
    if (fs.existsSync(f)) out.push(f)
  }
  return out
}

// ---------------- 命令实现 ----------------

function cmdCheck() {
  const files = walkFiles(SCAN_DIRS)
  const issues = { mojibake: [], bom: [], crlf: [] }

  for (const p of files) {
    const raw = fs.readFileSync(p)
    // BOM 检查
    if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) issues.bom.push(p)
    const content = raw.toString('utf8')
    if (MOJIBAKE.test(content)) issues.mojibake.push(p)
    if (content.includes('\r\n')) issues.crlf.push(p)
  }

  console.log(`扫描 ${files.length} 个文本文件\n`)
  console.log(`乱码  : ${issues.mojibake.length}`)
  issues.mojibake.forEach(p => console.log('   ✗ ' + p))
  console.log(`BOM   : ${issues.bom.length}`)
  issues.bom.forEach(p => console.log('   ✗ ' + p))
  console.log(`CRLF  : ${issues.crlf.length}（.gitattributes 已声明 eol=lf；工作区出现 CRLF 属正常，git 会自动归一）`)
  issues.crlf.slice(0, 10).forEach(p => console.log('   · ' + p))

  if (issues.mojibake.length || issues.bom.length) process.exitCode = 1
}

function cmdFindMojibake() {
  const files = walkFiles(SCAN_DIRS)
  const hits = files.filter(p => MOJIBAKE.test(readUtf8(p)))
  if (!hits.length) {
    console.log('✅ 未发现乱码文件')
    return
  }
  console.log(`发现 ${hits.length} 个含乱码的文件：`)
  hits.forEach(p => console.log('   ' + p))
  process.exitCode = 1
}

function cmdReplace(file, from, to) {
  const content = readUtf8(file)
  if (!content.includes(from)) {
    console.error(`✗ 未找到要替换的文本（要求精确匹配）\n  文件: ${file}\n  查找: ${JSON.stringify(from.slice(0, 80))}`)
    process.exitCode = 1
    return
  }
  const count = content.split(from).length - 1
  writeUtf8(file, content.split(from).join(to))
  console.log(`✅ 已替换 ${count} 处 → ${file}`)
}

function cmdReplaceFile(file, jsonFile) {
  const rules = JSON.parse(readUtf8(jsonFile))
  let content = readUtf8(file)
  const missed = []
  for (const r of rules) {
    if (!content.includes(r.from)) { missed.push(r.from.slice(0, 60)); continue }
    const n = content.split(r.from).length - 1
    content = content.split(r.from).join(r.to)
    console.log(`  ✓ ${n} 处: ${JSON.stringify(r.from.slice(0, 50))}`)
  }
  if (missed.length) {
    console.error(`  ✗ 未匹配 ${missed.length} 条：`)
    missed.forEach(m => console.error('     ' + JSON.stringify(m)))
    process.exitCode = 1
    return
  }
  writeUtf8(file, content)
  console.log(`✅ 全部替换完成 → ${file}`)
}

function cmdSetLine(file, lineNo, newContent) {
  const raw = readUtf8(file)
  const eol = detectEol(raw)
  const lines = raw.split(eol)
  const idx = Number(lineNo) - 1
  if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length) {
    console.error(`✗ 行号越界：${lineNo}（文件共 ${lines.length} 行）`)
    process.exitCode = 1
    return
  }
  const old = lines[idx]
  lines[idx] = newContent
  writeUtf8(file, lines.join(eol))
  console.log(`✅ 第 ${lineNo} 行已替换`)
  console.log(`   旧: ${old.replace(/\s+$/, '').slice(0, 100)}`)
  console.log(`   新: ${newContent.replace(/\s+$/, '').slice(0, 100)}`)
}

function cmdReadLines(file, from, to) {
  const raw = readUtf8(file)
  const eol = detectEol(raw)
  const lines = raw.split(eol)
  const a = Number(from) || 1
  const b = Number(to) || lines.length
  for (let i = a; i <= Math.min(b, lines.length); i++) {
    const line = lines[i - 1] ?? ''
    const mark = MOJIBAKE.test(line) ? ' ⚠乱码' : ''
    console.log(`${i}: ${line}${mark}`)
  }
}

// ---------------- 入口 ----------------

const [cmd, ...args] = process.argv.slice(2)
switch (cmd) {
  case 'check': cmdCheck(); break
  case 'find-mojibake': cmdFindMojibake(); break
  case 'replace': cmdReplace(args[0], args[1], args[2]); break
  case 'replace-file': cmdReplaceFile(args[0], args[1]); break
  case 'set-line': cmdSetLine(args[0], args[1], args[2]); break
  case 'read-lines': cmdReadLines(args[0], args[1], args[2]); break
  default:
    console.log(`用法：
  node scripts/text.js check
  node scripts/text.js find-mojibake
  node scripts/text.js replace <file> <from> <to>
  node scripts/text.js replace-file <file> <rules.json>
  node scripts/text.js set-line <file> <lineNo> <content>
  node scripts/text.js read-lines <file> <from> <to>`)
    if (cmd) process.exitCode = 1
}
