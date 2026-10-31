// 临时脚本：核对三语 key 集合一致 + 侧栏端到端（跑完删除）
import zh from '../../src/locales/zh.js'
import en from '../../src/locales/en.js'
import ja from '../../src/locales/ja.js'

const kz = Object.keys(zh)
const ke = Object.keys(en)
const kj = Object.keys(ja)
console.log('counts:', kz.length, ke.length, kj.length)
console.log('en missing:', kz.filter((k) => !(k in en)))
console.log('en extra:', ke.filter((k) => !(k in zh)))
console.log('ja missing:', kz.filter((k) => !(k in ja)))
console.log('ja extra:', kj.filter((k) => !(k in zh)))
console.log('nav.groupData zh/en/ja:', zh['nav.groupData'], en['nav.groupData'], ja['nav.groupData'])
console.log('nav.groupLists:', zh['nav.groupLists'], en['nav.groupLists'], ja['nav.groupLists'])
console.log('importShort:', zh['sidebar.importShort'], en['sidebar.importShort'], ja['sidebar.importShort'])
console.log('exportShort:', zh['sidebar.exportShort'], en['sidebar.exportShort'], ja['sidebar.exportShort'])
