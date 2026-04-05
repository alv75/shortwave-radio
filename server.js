const express = require('express');
const path = require('path');
const fs = require('fs');
const { fetchAndSave } = require('./import/eibi-import');
const { fetchAndSave: fetchReceivers } = require('./import/receivers-import');
const RECEIVERS_PATH = path.join(__dirname, 'data', 'receivers.json');

const app = express();
const PORT = process.env.PORT || 3005;
const SCHEDULE_PATH = path.join(__dirname, 'data', 'schedule.json');
const TWENTE_BASE = 'http://websdr.ewi.utwente.nl:8901/';

// Auto-update on startup (non-blocking)
fetchAndSave()
  .then(n => console.log(`EIBI: ${n} schedule entries loaded`))
  .catch(e => console.warn(`EIBI update skipped (${e.message}) — using cached data`));
fetchReceivers()
  .then(n => console.log(`Receivers: ${n} loaded`))
  .catch(e => console.warn(`Receivers update skipped (${e.message}) — using cached data`));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ── Data ─────────────────────────────────────────────────────────────────────

function loadSchedule() {
  return JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
}

function loadReceivers() {
  try { return JSON.parse(fs.readFileSync(RECEIVERS_PATH, 'utf8')); }
  catch { return []; }
}

function utcMinutes(hhmm) {
  const s = String(hhmm).padStart(4, '0');
  return parseInt(s.slice(0, 2)) * 60 + parseInt(s.slice(2));
}

function isLiveNow(entry) {
  const now = new Date();
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  // day: 1=Mon…7=Sun, JS getDay() 0=Sun…6=Sat
  const jsDay = now.getUTCDay();
  const eibiDay = jsDay === 0 ? 7 : jsDay;
  if (!entry.days.includes(String(eibiDay))) return false;

  const start = utcMinutes(entry.utc_start);
  let stop = utcMinutes(entry.utc_stop);
  // Handle midnight-crossing broadcasts
  if (stop <= start) stop += 1440;
  const adjusted = (cur < start) ? cur + 1440 : cur;
  return adjusted >= start && adjusted < stop;
}

// WebSDR Twente mode codes: am usb lsb cw fm
const MODE_MAP = { AM:'am', USB:'usb', LSB:'lsb', CW:'cw', FM:'fm', DRM:'am', RTTY:'usb' };
function tuneUrl(khz, mode) {
  const m = MODE_MAP[mode] || 'am';
  return `${TWENTE_BASE}?tune=${khz}${m}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const schedule  = loadSchedule();
  const receivers = loadReceivers();

  const { lang, station, target, band, live, q, rx } = req.query;

  // Build filter options
  const languages = [...new Set(schedule.map(e => e.language))].sort();
  const stations  = [...new Set(schedule.map(e => e.station))].sort();
  const targets   = [...new Set(schedule.map(e => e.target))].sort();

  const bands = {
    '60m': [4750, 5060],
    '49m': [5900, 6200],
    '41m': [7200, 7450],
    '31m': [9400, 9900],
    '25m': [11600, 12100],
    '22m': [13570, 13870],
    '19m': [15100, 15800],
    '16m': [17480, 17900],
    '13m': [21450, 21850],
    '11m': [25600, 26100],
  };

  let filtered = schedule.map(e => ({ ...e, liveNow: isLiveNow(e), tuneUrl: tuneUrl(e.khz, e.mode) }));

  if (live === '1') filtered = filtered.filter(e => e.liveNow);
  if (lang)        filtered = filtered.filter(e => e.language === lang);
  if (station)     filtered = filtered.filter(e => e.station === station);
  if (target)      filtered = filtered.filter(e => e.target === target);
  if (band && bands[band]) {
    const [lo, hi] = bands[band];
    filtered = filtered.filter(e => e.khz >= lo && e.khz <= hi);
  }
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter(e =>
      e.station.toLowerCase().includes(ql) ||
      e.language.toLowerCase().includes(ql) ||
      e.target.toLowerCase().includes(ql)
    );
  }

  // Sort: live first, then by frequency
  filtered.sort((a, b) => (b.liveNow - a.liveNow) || (a.khz - b.khz));

  res.render('index', {
    entries: filtered,
    total: schedule.length,
    filters: { lang, station, target, band, live, q, rx },
    languages, stations, targets,
    bandNames: Object.keys(bands),
    receivers: JSON.stringify(receivers),
  });
});

app.listen(PORT, () => console.log(`Shortwave Radio → http://localhost:${PORT}`));
