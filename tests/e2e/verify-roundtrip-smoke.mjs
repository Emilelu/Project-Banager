import 'fake-indexeddb/auto'

const mods = await Promise.all([
  import('../../src/db/index.js'),
  import('../../src/db/excelExporter.js'),
  import('../../src/db/structuredImporter.js'),
])
console.log('ok imports')
const { getDb } = mods[0]
const db = await getDb()
db.clearAll()
db.addWatching({ name: 'a', day_of_week: '周一', time_slot: '20:30', current_episode: '3' })
console.log(db.getAllWatching())
