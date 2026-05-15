
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '..', '..', 'OriginalData.xlsx');
const workbook = XLSX.readFile(filePath);

const sheetName = 'Watched | 回忆';
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// 统计每列有多少条目
console.log('=== 每列统计 ===');
const header = data[0];
let total = 0;
for (let col = 0; col < header.length; col++) {
  let count = 0;
  for (let row = 1; row < data.length; row++) {
    if (data[row][col]) count++;
  }
  total += count;
  console.log('列' + col + ' (' + JSON.stringify(header[col]) + '): ' + count + ' 条');
}
console.log('总计: ' + total + ' 条');

// 输出行24到最后
console.log('\n=== 行24到最后 ===');
for (let i = 24; i < data.length; i++) {
  console.log('行' + i + ': ' + JSON.stringify(data[i]));
}

// Watching表详细
const ws = 'Watching | 追番';
const ws2 = workbook.Sheets[ws];
const wd = XLSX.utils.sheet_to_json(ws2, { header: 1 });
console.log('\n=== Watching 表完整 ===');
for (let i = 0; i < wd.length; i++) {
  console.log('行' + i + ': ' + JSON.stringify(wd[i]));
}

// Remaining表详细
const rs = 'Remaining | 等番';
const rs2 = workbook.Sheets[rs];
const rd = XLSX.utils.sheet_to_json(rs2, { header: 1 });
console.log('\n=== Remaining 表完整 ===');
for (let i = 0; i < rd.length; i++) {
  console.log('行' + i + ': ' + JSON.stringify(rd[i]));
}
