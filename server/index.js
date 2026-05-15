/**
 * 追番管理系统 - 后端服务器
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('只支持 Excel 文件 (.xlsx, .xls)'));
    }
  }
});

async function start() {
  const db = await require('./database');
  const excelImporter = require('./excelImporter');
  excelImporter.setDb(db);

  // ========== 追番路由 ==========

  app.get('/api/watching', (req, res) => {
    try {
      const list = db.getAllWatching();
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/watching/:day', (req, res) => {
    try {
      const list = db.getWatchingByDay(req.params.day);
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watching', (req, res) => {
    try {
      const result = db.addWatching(req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/watching/:id', (req, res) => {
    try {
      const result = db.updateWatching(parseInt(req.params.id), req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/watching/:id', (req, res) => {
    try {
      const result = db.deleteWatching(parseInt(req.params.id));
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watching/:id/increment', (req, res) => {
    try {
      const result = db.incrementEpisode(parseInt(req.params.id));
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watching/:id/decrement', (req, res) => {
    try {
      const result = db.decrementEpisode(parseInt(req.params.id));
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watching/:id/to-remaining', (req, res) => {
    try {
      const result = db.moveWatchingToRemaining(parseInt(req.params.id));
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watching/:id/to-watched', (req, res) => {
    try {
      const { watch_date } = req.body;
      const result = db.moveWatchingToWatched(parseInt(req.params.id), watch_date);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== 等番路由 ==========

  app.get('/api/remaining', (req, res) => {
    try {
      const list = db.getAllRemaining();
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/remaining', (req, res) => {
    try {
      const result = db.addRemaining(req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/remaining/:id', (req, res) => {
    try {
      const result = db.updateRemaining(parseInt(req.params.id), req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/remaining/:id', (req, res) => {
    try {
      const result = db.deleteRemaining(parseInt(req.params.id));
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/remaining/batch-add', (req, res) => {
    try {
      const { names } = req.body;
      if (!Array.isArray(names) || names.length === 0) {
        return res.status(400).json({ success: false, error: '请提供番剧名称列表' });
      }
      const results = [];
      for (const name of names) {
        if (name.trim()) {
          const r = db.addRemaining({ name: name.trim() });
          results.push({ name: name.trim(), success: r.success });
        }
      }
      res.json({ success: true, data: results, added: results.filter(r => r.success).length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/remaining/:id/to-watching', (req, res) => {
    try {
      const result = db.moveRemainingToWatching(parseInt(req.params.id), req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== 已看路由 ==========

  app.get('/api/watched', (req, res) => {
    try {
      const list = db.getAllWatched();
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/watched/year/:year', (req, res) => {
    try {
      const list = db.getWatchedByYear(req.params.year);
      const yearCount = db.getWatchedCountByYear(req.params.year);
      const totalCount = db.getTotalWatchedCount();
      res.json({ success: true, data: list, yearCount, totalCount });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watched', (req, res) => {
    try {
      const result = db.addWatched(req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/watched/:id', (req, res) => {
    try {
      const result = db.updateWatched(parseInt(req.params.id), req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/watched/:id', (req, res) => {
    try {
      const result = db.deleteWatched(parseInt(req.params.id));
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== 已看年份路由 ==========

  app.get('/api/watched-years', (req, res) => {
    try {
      const list = db.getAllWatchedYears();
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watched-years', (req, res) => {
    try {
      const result = db.addWatchedYear(req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/watched-years/:id', (req, res) => {
    try {
      const result = db.updateWatchedYear(parseInt(req.params.id), req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/watched-years/:id', (req, res) => {
    try {
      const result = db.deleteWatchedYear(parseInt(req.params.id));
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== 批量操作路由 ==========

  app.post('/api/watching/batch-delete', (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: '请提供要删除的ID列表' });
      }
      const result = db.batchDeleteWatching(ids);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/remaining/batch-delete', (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: '请提供要删除的ID列表' });
      }
      const result = db.batchDeleteRemaining(ids);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/watched/batch-delete', (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: '请提供要删除的ID列表' });
      }
      const result = db.batchDeleteWatched(ids);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/clear/watching', (req, res) => {
    try {
      const result = db.clearWatching();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/clear/remaining', (req, res) => {
    try {
      const result = db.clearRemaining();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/clear/watched', (req, res) => {
    try {
      const result = db.clearWatched();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/clear/watched-years', (req, res) => {
    try {
      const result = db.clearWatchedYears();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/clear/all', (req, res) => {
    try {
      const result = db.clearAll();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== Excel 导入路由 ==========

  app.post('/api/import', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '请上传 Excel 文件' });
      }
      const filePath = req.file.path;
      const result = excelImporter.importAllData(filePath);
      // 导入完成后自动删除上传的文件
      try { fs.unlinkSync(filePath); } catch(e) { console.error('删除上传文件失败:', e.message); }
      res.json(result);
    } catch (err) {
      // 出错也要删除文件
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== 统计路由 ==========

  app.get('/api/stats', (req, res) => {
    try {
      const totalCount = db.getTotalWatchedCount();
      res.json({ success: true, totalWatched: totalCount });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`追番管理系统后端服务已启动: http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
