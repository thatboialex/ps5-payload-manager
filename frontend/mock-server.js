import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Log all requests to terminal
app.use((req, res, next) => {
  console.log(`[Mock] ${req.method} ${req.url}`);
  next();
});

const PORT = 8081;

let logs = [
  "[PLDMGR] Mock Server initialized",
  "[PLDMGR] System ready",
  "[PLDMGR] Found 3 payloads on storage"
];

const remoteRepository = [
  {
    name: "ftpsrv",
    filename: "ftpsrv_v0.19.elf",
    url: "https://itsplk.github.io/ps5_payloads/payloads/ftpsrv_v0.19.elf",
    description: "A simple FTP server that accepts connections on port 2121",
    version: "v0.19",
    checksum: "e6c1babbfd5e1b766d12b659853b514b9faedf6333cbe8cb514b1a3e79b7ce39"
  },
  {
    name: "kstuff-lite",
    filename: "kstuff-lite_v1.03.elf",
    url: "https://itsplk.github.io/ps5_payloads/payloads/kstuff-lite_v1.03.elf",
    description: "Lite version of kstuff",
    version: "v1.03",
    checksum: "54df47a48d9c5ee4338ef70ba66093908a4f2845e53468bdd7c080b65d7488c1"
  }
];
let lastRepositoryUpdate = Math.floor(Date.now() / 1000);

let autoloadStatus = {
  remaining: 10,
  total: 2,
  done: 0,
  current: "IDLE",
  list: "goldhen_v2.4b17.elf,etaHEN_1.8.elf"
};

const autoloadList = autoloadStatus.list.split(',');
let simulationTicks = 0;

setInterval(() => {
  if (autoloadStatus.remaining > 0) {
    autoloadStatus.remaining--;
    if (autoloadStatus.remaining === 0) {
      autoloadStatus.current = autoloadList[0];
      logs.push(`[PLDMGR] Autoload sequence started: ${autoloadList[0]}`);
    }
  } else if (autoloadStatus.remaining === 0 && autoloadStatus.current !== "DONE" && autoloadStatus.current !== "IDLE") {
    simulationTicks++;
    if (simulationTicks >= 3) { // 3 seconds per payload simulation
      simulationTicks = 0;
      autoloadStatus.done++;
      if (autoloadStatus.done < autoloadStatus.total) {
        autoloadStatus.current = autoloadList[autoloadStatus.done];
        logs.push(`[PLDMGR] Autoloading: ${autoloadStatus.current}`);
      } else {
        autoloadStatus.current = "DONE";
        logs.push(`[PLDMGR] Autoload sequence complete`);
      }
    }
  }
}, 1000);

// --- API Routes ---

app.get('/getip', (req, res) => {
  res.send('127.0.0.1');
});

app.get('/version', (req, res) => {
  res.send('1.0.2-mock');
});

app.get('/list_payloads', (req, res) => {
  res.json({
    payloads: [
      "/data/pldmgr/goldhen_v2.4b17.elf",
      "/data/pldmgr/etaHEN_1.8.elf",
      "/data/pldmgr/kstuff.elf",
      "/mnt/usb0/pldmgr/linux_loader.elf"
    ]
  });
});

app.get('/autoload_status', (req, res) => {
  res.json(autoloadStatus);
});

app.get('/get_config', (req, res) => {
  res.json({
    AUTOLOAD_ENABLED: true,
    AUTOLOAD_LIST: "goldhen_v2.4b17.elf,etaHEN_1.8.elf",
    LAST_REPOSITORY_UPDATE: lastRepositoryUpdate,
    AUTO_INSTALL_APP: true
  });
});

app.get('/repository_payloads', (req, res) => {
  res.json({
    payloads: remoteRepository,
    last_update: lastRepositoryUpdate,
    cache_status: 'ok'
  });
});

app.get('/repository_refresh', (req, res) => {
  lastRepositoryUpdate = Math.floor(Date.now() / 1000);
  logs.push(`[PLDMGR] Repository manually refreshed`);
  res.json({
    payloads: remoteRepository,
    last_update: lastRepositoryUpdate,
    cache_status: 'ok'
  });
});

app.get('/repository_install', (req, res) => {
  const { filename } = req.query;
  if (!filename) {
    return res.status(400).json({ ok: false, message: 'Missing filename' });
  }
  logs.push(`[PLDMGR] Repository install requested: ${filename}`);
  res.json({ ok: true, message: `Installed ${filename}` });
});

app.post('/set_config', (req, res) => {
  console.log('Received Config:', req.body);
  logs.push(`[PLDMGR] Config updated: ${JSON.stringify(req.body)}`);
  res.send('OK');
});

app.get(/^\/loadpayload:(.*)/, (req, res) => {
  const path = req.params[0];
  logs.push(`[PLDMGR] Executing payload: ${path}`);
  res.send('OK');
});

app.get('/manage\\:delete', (req, res) => {
  const filename = req.query.filename;
  logs.push(`[PLDMGR] Deleted payload: ${filename}`);
  res.send('OK');
});

app.post('/manage\\:upload', (req, res) => {
  const filename = req.query.filename;
  logs.push(`[PLDMGR] Uploaded payload: ${filename}`);
  res.send('OK');
});

app.get('/abort', (req, res) => {
  logs.push(`[PLDMGR] Autoload sequence aborted by user`);
  autoloadStatus.remaining = -1;
  autoloadStatus.current = "IDLE";
  res.send('OK');
});

// --- Autoload Presets ---
let autoloadPresets = [
  { id: 1, name: "Default HEN Chain", items: ["goldhen_v2.4b17.elf", "!1000", "etaHEN_1.8.elf"] }
];

app.get('/autoload_presets', (req, res) => {
  res.json(autoloadPresets);
});

app.post('/autoload_presets', (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ ok: false, message: "Body must be a JSON array" });
  }
  autoloadPresets = req.body.slice(0, 5);
  logs.push(`[PLDMGR] Saved ${autoloadPresets.length} presets`);
  res.json({ ok: true, message: "Saved" });
});

// --- Immediate preset runner (mocked) ---
let runStatus = { active: false, total: 0, done: 0, current: "", remaining_ms: 0, state: "idle" };
let runItems = [];
let runIndex = 0;
let runTimer = null;
let runDelayEnd = 0;

function runStep() {
  clearTimeout(runTimer);
  if (runIndex >= runItems.length || !runStatus.active) {
    runStatus.active = false;
    runStatus.state = runStatus.state === 'aborted' ? 'aborted' : 'done';
    runStatus.current = "DONE";
    runStatus.remaining_ms = 0;
    return;
  }
  const item = runItems[runIndex];
  runStatus.current = item;
  if (item.startsWith('!')) {
    const ms = parseInt(item.substring(1)) || 0;
    runStatus.state = 'delay';
    runDelayEnd = Date.now() + ms;
    runStatus.remaining_ms = ms;
    const tick = () => {
      if (!runStatus.active) return;
      const left = runDelayEnd - Date.now();
      if (left <= 0) {
        runIndex++;
        runStep();
      } else {
        runStatus.remaining_ms = left;
        runTimer = setTimeout(tick, 100);
      }
    };
    tick();
  } else {
    runStatus.state = 'launching';
    runStatus.remaining_ms = 0;
    logs.push(`[Preset] Launching ${item}`);
    runStatus.done++;
    runIndex++;
    runTimer = setTimeout(runStep, 800);
  }
}

app.post('/run_preset', (req, res) => {
  if (runStatus.active) {
    return res.status(400).json({ ok: false, message: "Already running" });
  }
  const items = Array.isArray(req.body?.items) ? req.body.items.filter(x => typeof x === 'string') : [];
  if (items.length === 0) {
    return res.status(400).json({ ok: false, message: "Empty items" });
  }
  runItems = items;
  runIndex = 0;
  runStatus = {
    active: true,
    total: items.filter(i => !i.startsWith('!')).length,
    done: 0,
    current: items[0],
    remaining_ms: 0,
    state: 'launching'
  };
  logs.push(`[Preset] Sequence start (${items.length} items)`);
  setTimeout(runStep, 0);
  res.json({ ok: true, message: "Started" });
});

app.get('/run_preset_status', (req, res) => {
  res.json(runStatus);
});

app.post('/run_preset_abort', (req, res) => {
  if (runStatus.active) {
    runStatus.active = false;
    runStatus.state = 'aborted';
    clearTimeout(runTimer);
    logs.push(`[Preset] Aborted`);
  }
  res.json({ ok: true });
});

app.get('/autoload_clear', (req, res) => {
  logs.push(`[PLDMGR] Autoload status cleared`);
  autoloadStatus.done = 0;
  autoloadStatus.current = "IDLE";
  autoloadStatus.remaining = -1;
  res.send('OK');
});

app.get('/shutdown', (req, res) => {
  logs.push(`[PLDMGR] System shutdown requested`);
  res.send('Shutting down...');
  process.exit(0);
});

// SSE for logs
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendLog = (data) => {
    res.write(`data: ${data}\n\n`);
  };

  // Send history
  logs.forEach(sendLog);

  // Poll for new logs
  let lastCount = logs.length;
  const interval = setInterval(() => {
    if (logs.length > lastCount) {
      for (let i = lastCount; i < logs.length; i++) {
        sendLog(logs[i]);
      }
      lastCount = logs.length;
    }
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\x1b[36m%s\x1b[0m`, `--- Payload Manager Mock Backend ---`);
  console.log(`Running at http://localhost:${PORT}`);
  console.log(`Proxy your Vite requests to this port to test the frontend locally.`);
});
