/**
 * 构建脚本：从原 client 项目复制视图文件到 standalone，
 * 并自动将 import 路径从 '../api' 替换为 '../db/api'
 * 
 * 使用方法: node setup.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = join(__dirname, '..')
const clientSrc = join(root, 'client', 'src')
const standaloneSrc = join(__dirname, 'src')

// 确保目录存在
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// 复制视图文件，替换 import 路径
function copyView(fileName) {
  const src = join(clientSrc, 'views', fileName)
  const dest = join(standaloneSrc, 'views', fileName)

  let content = readFileSync(src, 'utf-8')

  // 替换 API import 路径
  content = content.replace(
    /from\s+['"]\.\.\/api['"]/g,
    "from '../db/api'"
  )

  writeFileSync(dest, content, 'utf-8')
  console.log(`✓ 已处理: ${fileName}`)
}

// 复制 public 资源
function copyPublic() {
  const publicDir = join(__dirname, 'public')
  ensureDir(publicDir)

  const clientPublic = join(root, 'client', 'public')
  const files = ['favicon.png', 'logo.png']

  for (const file of files) {
    const src = join(clientPublic, file)
    const dest = join(publicDir, file)
    if (existsSync(src)) {
      copyFileSync(src, dest)
      console.log(`✓ 已复制: public/${file}`)
    } else {
      console.log(`⚠ 未找到: public/${file}`)
    }
  }
}

// 主流程
function main() {
  console.log('🚀 开始设置 standalone 项目...\n')

  // 确保视图目录存在
  ensureDir(join(standaloneSrc, 'views'))

  // 复制并处理视图文件
  const views = ['WatchingView.vue', 'RemainingView.vue', 'WatchedView.vue', 'ImportView.vue']
  for (const view of views) {
    copyView(view)
  }

  // 复制 public 资源
  copyPublic()

  console.log('\n✅ 设置完成！')
  console.log('\n接下来运行:')
  console.log('  cd standalone')
  console.log('  pnpm install')
  console.log('  pnpm build')
  console.log('\n然后双击 dist/index.html 即可使用！')
}

main()
