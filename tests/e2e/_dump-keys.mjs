import * as zhModule from '../../src/locales/zh.js'
const zh = zhModule.default || zhModule
const prefix = String(process.argv[2] || '')
const out = Object.keys(zh)
  .filter((k) => k.startsWith(prefix))
  .map((k) => `${k} = ${JSON.stringify(zh[k])}`)
console.log(out.join('\n'))
