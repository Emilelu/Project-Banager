
/**
 * Excel 导入模块
 * 处理 Excel 文件的解析和数据导入
 * 适配 OriginalData.xlsx 的特殊格式
 * 支持 sort_order 保持导入顺序，watch_date 支持完整日期
 */

const XLSX = require('xlsx');

class ExcelImporter {
  constructor() {
    this.db = null;
    this.importedCount = 0;
    this.errorCount = 0;
    this.errors = [];
    this.sortCounter = 0;
  }

  setDb(db) {
    this.db = db;
  }

  nextSortOrder() {
    return ++this.sortCounter;
  }

  /**
   * 获取单元格的超链接
   */
  _getHyperlink(sheet, row, col) {
    try {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellRef];
      if (!cell) return '';
      // 超链接在 cell.l.Target 中
      if (cell.l && cell.l.Target) return cell.l.Target;
      // 有些版本超链接在 Hyperlink 属性
      if (cell.Hyperlink) return cell.Hyperlink;
    } catch(e) {}
    return '';
  }

  importAllData(filePath) {
    this.importedCount = 0;
    this.errorCount = 0;
    this.errors = [];
    this.sortCounter = 0;

    let workbook;
    try {
      workbook = XLSX.readFile(filePath);
    } catch (err) {
      return {
        success: false,
        message: '无法打开 Excel 文件',
        imported: 0,
        errors: ['打开文件失败: ' + err.message]
      };
    }

    // 导入追番数据
    this._importWatching(workbook);

    // 导入等番数据
    this._importRemaining(workbook);

    // 导入已看数据
    this._importWatched(workbook);

    return {
      success: true,
      message: '导入完成！成功导入 ' + this.importedCount + ' 条数据，失败 ' + this.errorCount + ' 条',
      imported: this.importedCount,
      errors: this.errors
    };
  }

  /**
   * 解析追番名称，提取番剧名和集数
   */
  _parseWatchingName(rawName) {
    let name = String(rawName).trim();
    let current_episode = '0';

    const eMatch = name.match(/^(.+?)\s+[eE](\d+(?:\.\d+)?)$/);
    if (eMatch) {
      name = eMatch[1].trim();
      current_episode = eMatch[2];
      return { name, current_episode };
    }

    const spaceMatch = name.match(/^(.+?)\s+(\d+\.\d+)$/);
    if (spaceMatch) {
      name = spaceMatch[1].trim();
      current_episode = spaceMatch[2];
      return { name, current_episode };
    }

    const numMatch = name.match(/^(.+?)\s+(\d+)$/);
    if (numMatch) {
      name = numMatch[1].trim();
      current_episode = numMatch[2];
      return { name, current_episode };
    }

    return { name, current_episode };
  }

  /**
   * 导入追番数据
   */
  _importWatching(workbook) {
    try {
      let sheetName = workbook.SheetNames.find(name =>
        name.includes('追番') || name.includes('Watching')
      );

      if (!sheetName) {
        sheetName = workbook.SheetNames[0];
      }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let headerRow = -1;
      const dayKeywords = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        '周一', '周二', '周三', '周四', '周五', '周六', '周日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row && row.some(cell => {
          const val = String(cell || '');
          return dayKeywords.some(kw => val.includes(kw));
        })) {
          headerRow = i;
          break;
        }
      }

      if (headerRow === -1) {
        this.errors.push('未找到追番表的星期表头行');
        return;
      }

      const headerData = data[headerRow];
      const colDayMap = {};
      for (let col = 0; col < headerData.length; col++) {
        const val = String(headerData[col] || '').trim();
        if (val.includes('Monday') || val.includes('周一') || val.includes('星期一')) colDayMap[col] = '周一';
        else if (val.includes('Tuesday') || val.includes('周二') || val.includes('星期二')) colDayMap[col] = '周二';
        else if (val.includes('Wednesday') || val.includes('周三') || val.includes('星期三')) colDayMap[col] = '周三';
        else if (val.includes('Thursday') || val.includes('周四') || val.includes('星期四')) colDayMap[col] = '周四';
        else if (val.includes('Friday') || val.includes('周五') || val.includes('星期五')) colDayMap[col] = '周五';
        else if (val.includes('Saturday') || val.includes('周六') || val.includes('星期六')) colDayMap[col] = '周六';
        else if (val.includes('Sunday') || val.includes('周日') || val.includes('星期日')) colDayMap[col] = '周日';
      }

      // 按行遍历，保持Excel顺序
      for (let row = headerRow + 1; row < data.length; row++) {
        const rowData = data[row];
        if (!rowData) continue;

        let timeSlot = '';
        if (rowData[0] != null) {
          const timeVal = parseFloat(rowData[0]);
          if (!isNaN(timeVal) && timeVal >= 0 && timeVal < 1) {
            const totalMinutes = Math.round(timeVal * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            timeSlot = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
          }
        }

        for (let col = 1; col < rowData.length; col++) {
          const cellValue = rowData[col];
          if (!cellValue || typeof cellValue !== 'string') continue;

          const trimmed = String(cellValue).trim();
          if (!trimmed) continue;

          if (trimmed.includes('看完则移至') || trimmed.includes('今天是') || trimmed.includes('现在是') ||
              trimmed.includes('暂不需要') || trimmed.includes('检查') || trimmed.includes('函数参考') ||
              trimmed.includes('本月没有')) {
            continue;
          }

          // 跳过星期表头关键词（如 Friday e2 之类）
          const dayKeywords = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
            '周一','周二','周三','周四','周五','周六','周日','星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
          if (dayKeywords.some(kw => trimmed.includes(kw))) {
            continue;
          }

          const dayOfWeek = colDayMap[col] || '';
          const parsed = this._parseWatchingName(trimmed);
          const url = this._getHyperlink(sheet, row, col);

          try {
            const result = this.db.addWatching({
              name: parsed.name,
              day_of_week: dayOfWeek,
              time_slot: timeSlot,
              current_episode: parsed.current_episode,
              url: url,
              notes: '',
              sort_order: this.nextSortOrder()
            });
            if (result.success) {
              this.importedCount++;
            } else {
              this.errorCount++;
              this.errors.push('追番 \'' + parsed.name + '\' 导入失败（' + result.error + '）');
            }
          } catch (err) {
            this.errorCount++;
            this.errors.push('追番 \'' + parsed.name + '\' 导入失败: ' + err.message);
          }
        }
      }
    } catch (err) {
      this.errors.push('导入追番失败: ' + err.message);
    }
  }

  /**
   * 导入等番数据
   */
  _importRemaining(workbook) {
    try {
      const sheetName = workbook.SheetNames.find(name =>
        name.includes('等番') || name.includes('Remaining')
      );

      if (!sheetName) return;

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;

        const name = String(row[0]).trim();
        if (!name) continue;

        let expectedDate = '';
        if (row[1]) {
          if (typeof row[1] === 'number') {
            const date = XLSX.SSF.parse_date_code(row[1]);
            if (date) {
              expectedDate = date.y + '/' + String(date.m).padStart(2, '0');
              if (date.d && date.d > 1) {
                expectedDate += '/' + String(date.d).padStart(2, '0');
              }
            }
          } else {
            expectedDate = String(row[1]).trim();
          }
        }

        const notes = row[2] ? String(row[2]).trim() : '';
        const url = this._getHyperlink(sheet, i, 0);

        try {
          const result = this.db.addRemaining({ name, expected_date: expectedDate, url, notes, sort_order: this.nextSortOrder() });
          if (result.success) {
            this.importedCount++;
          } else {
            this.errorCount++;
            this.errors.push('等番 \'' + name + '\' 导入失败（' + result.error + '）');
          }
        } catch (err) {
          this.errorCount++;
          this.errors.push('等番 \'' + name + '\' 导入失败: ' + err.message);
        }
      }
    } catch (err) {
      this.errors.push('导入等番失败: ' + err.message);
    }
  }

  /**
   * 解析已看番剧名称，提取纯名称和备注
   */
  _parseWatchedName(rawName) {
    let name = String(rawName).trim();
    let notes = '';

    const notesMatch = name.match(/[（(]([^）)]+)[）)]/);
    if (notesMatch) {
      notes = notesMatch[1].trim();
      name = name.replace(/[（(][^）)]*[）)]/g, '').trim();
    }

    return { name, notes };
  }

  /**
   * 解析年份表头
   * 支持合并单元格的年份范围，如 "2014 ~ 2017"
   */
  _parseYear(rawYear) {
    if (typeof rawYear === 'number') {
      return String(rawYear);
    }
    const str = String(rawYear).trim();
    // 处理 "2014 ~ 2015" 或 "2014~2015" 或 "2014 - 2017" 格式
    const rangeMatch = str.match(/(\d{4})\s*[~\-]\s*(\d{4})/);
    if (rangeMatch) {
      return rangeMatch[1] + '~' + rangeMatch[2];
    }
    const yearMatch = str.match(/(\d{4})/);
    if (yearMatch) {
      return yearMatch[1];
    }
    return str;
  }

  /**
   * 导入已看数据
   * 使用 sheet_to_json 的 defval 选项来处理合并单元格
   * 同时将年份信息存入 watched_years 表
   */
  _importWatched(workbook) {
    try {
      const sheetName = workbook.SheetNames.find(name =>
        name.includes('已看') || name.includes('回忆') || name.includes('Watched') || name.includes('历史') || name.includes('完成')
      );

      if (!sheetName) return;

      const sheet = workbook.Sheets[sheetName];

      // 使用 defval 让合并单元格的值填充到所有子单元格
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

      if (data.length === 0) return;

      // 第一行是年份表头
      const headerRow = data[0];
      const colYearMap = {};
      const yearOrder = [];

      for (let col = 0; col < headerRow.length; col++) {
        const cellVal = headerRow[col];
        if (cellVal != null) {
          const year = this._parseYear(cellVal);
          if (year) {
            colYearMap[col] = year;
            if (!yearOrder.includes(year)) {
              yearOrder.push(year);
            }
          }
        }
      }

      // 将年份存入 watched_years 表
      let yearSortOrder = 0;
      for (const year of yearOrder) {
        try {
          this.db.addWatchedYear({ year_label: year, sort_order: ++yearSortOrder });
        } catch (err) {
          // 年份可能已存在，忽略
        }
      }

      // 遍历每列每行，提取番剧名（按Excel顺序：先按列，再按行）
      for (let col = 0; col < headerRow.length; col++) {
        const year = colYearMap[col];
        if (!year) continue;

        for (let row = 1; row < data.length; row++) {
          const cellValue = data[row] ? data[row][col] : null;
          if (!cellValue) continue;

          const trimmed = String(cellValue).trim();
          if (!trimmed) continue;

          const parsed = this._parseWatchedName(trimmed);
          const url = this._getHyperlink(sheet, row, col);

          if (parsed.name) {
            try {
              const result = this.db.addWatched({
                name: parsed.name,
                watch_date: year,
                url: url,
                notes: parsed.notes,
                sort_order: this.nextSortOrder()
              });
              if (result.success) {
                this.importedCount++;
              } else {
                this.errorCount++;
                this.errors.push('已看 \'' + parsed.name + '\' (' + year + ') 导入失败（' + result.error + '）');
              }
            } catch (err) {
              this.errorCount++;
              this.errors.push('已看 \'' + parsed.name + '\' (' + year + ') 导入失败: ' + err.message);
            }
          }
        }
      }
    } catch (err) {
      this.errors.push('导入已看数据失败: ' + err.message);
    }
  }
}

module.exports = new ExcelImporter();
