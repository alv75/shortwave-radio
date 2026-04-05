// Fetches EIBI shortwave schedule CSV and writes data/schedule.json
// Called automatically on server startup; safe to re-run anytime.

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const EIBI_URL    = 'https://eibispace.de/dx/sked-a26.csv';
const OUT_PATH    = path.join(__dirname, '..', 'data', 'schedule.json');
const AGENT       = new https.Agent({ rejectUnauthorized: false });
const SW_MIN_KHZ  = 1600; // skip LW/MW/VLF

// EIBI 2-letter language codes → full names
const LANG = {
  A:'Arabic', AB:'Abkhaz', AF:'Afrikaans', AK:'Akan', AM:'Amharic',
  AR:'Arawak', AZ:'Azeri', BA:'Bashkir', BB:'Bemba', BE:'Belarusian',
  BG:'Bulgarian', BM:'Bambara', BN:'Bengali', BO:'Tibetan', BS:'Bosnian',
  BU:'Burmese', CA:'Catalan', CH:'Chuvash', CO:'Corsican', CR:'Creole',
  CS:'Czech', CU:'Kurdish-Kurmanji', CW:'Kurdish-Sorani', CY:'Welsh',
  DA:'Danish', DE:'German', DI:'Dinka', DV:'Divehi', DZ:'Dzongkha',
  E:'English', EL:'Greek', EO:'Esperanto', ES:'Spanish', ET:'Estonian',
  EU:'Basque', F:'French', FA:'Farsi', FI:'Finnish', FJ:'Fijian',
  FO:'Faroese', FS:'Farsi', FU:'Fulani', FY:'Frisian', GA:'Irish',
  GD:'Gaelic', GE:'Georgian', GL:'Galician', GN:'Guarani', GU:'Gujarati',
  HA:'Hausa', HB:'Hebrew', HI:'Hindi', HM:'Hmong', HR:'Croatian',
  HU:'Hungarian', HY:'Armenian', I:'Indonesian', IG:'Igbo', IK:'Inuktitut',
  IS:'Icelandic', IT:'Italian', IY:'Uyghur', JA:'Japanese', JV:'Javanese',
  KA:'Georgian', KB:'Kabyle', KG:'Kongo', KH:'Khmer', KI:'Kikuyu',
  KK:'Kazakh', KL:'Greenlandic', KM:'Khmer', KN:'Kannada', KO:'Korean',
  KU:'Kurdish', KY:'Kyrgyz', LA:'Latin', LB:'Luxembourgish', LG:'Luganda',
  LI:'Lingala', LN:'Lingala', LO:'Lao', LT:'Lithuanian', LV:'Latvian',
  MA:'Mandarin', MB:'Malay', MD:'Moldovan', MG:'Malagasy', MK:'Macedonian',
  ML:'Malayalam', MN:'Mongolian', MR:'Marathi', MS:'Malay', MT:'Maltese',
  MY:'Burmese', NB:'Norwegian', ND:'Ndebele', NE:'Nepali', NL:'Dutch',
  NO:'Norwegian', NR:'Ndebele', NS:'Sotho', NY:'Chichewa', OC:'Occitan',
  OM:'Oromo', OR:'Odia', OS:'Ossetian', PA:'Punjabi', PL:'Polish',
  PS:'Pashto', PT:'Portuguese', PU:'Pulaar', QU:'Quechua', RM:'Romansh',
  RN:'Kirundi', RO:'Romanian', RU:'Russian', RW:'Kinyarwanda',
  S:'Spanish', SA:'Sanskrit', SC:'Serbian', SD:'Sindhi', SI:'Sinhala',
  SK:'Slovak', SL:'Slovenian', SM:'Samoan', SN:'Shona', SO:'Somali',
  SQ:'Albanian', SR:'Serbian', SS:'Swati', ST:'Sesotho', SU:'Sundanese',
  SV:'Swedish', SW:'Swahili', TA:'Tamil', TE:'Telugu', TG:'Tajik',
  TH:'Thai', TI:'Tigrinya', TK:'Turkmen', TL:'Tagalog', TN:'Tswana',
  TO:'Tongan', TR:'Turkish', TS:'Tsonga', TT:'Tatar', TW:'Twi',
  TY:'Tahitian', UG:'Uyghur', UK:'Ukrainian', UR:'Urdu', UZ:'Uzbek',
  V:'Various', VA:'Various', VI:'Vietnamese', VO:'Volapük', VX:'Various',
  WO:'Wolof', XH:'Xhosa', YI:'Yiddish', YO:'Yoruba', ZH:'Chinese',
  ZU:'Zulu',
};

function parseLine(line) {
  const f = line.split(';');
  if (f.length < 7) return null;

  const khz = parseFloat(f[0]);
  if (isNaN(khz) || khz < SW_MIN_KHZ) return null;

  // Time: "HHMM-HHMM"
  const tm = f[1] && f[1].match(/^(\d{4})-(\d{4})$/);
  if (!tm) return null;

  const days    = f[2] ? f[2].trim() : '1234567';
  const station = f[4] ? f[4].trim() : '';
  const raw5    = f[5] ? f[5].trim() : '';
  const target  = f[6] ? f[6].trim() : '';

  if (!station) return null;

  // Mode: if field starts with '-' it's a mode marker, not a language
  let mode = 'AM';
  let langCode = '';
  if (raw5.startsWith('-')) {
    const m = raw5.slice(1).toUpperCase();
    if      (m === 'CW')                  mode = 'CW';
    else if (m === 'USB' || m === 'J3E') mode = 'USB';
    else if (m === 'LSB')                mode = 'LSB';
    else if (m === 'FM' || m === 'F3E') mode = 'FM';
    else if (m === 'DRM')                mode = 'DRM';
    else if (m === 'RTTY' || m === 'TY' || m === 'FSK') mode = 'RTTY';
    else if (m === 'TS' || m === 'HF' || m === 'MX')    mode = 'AM';
    else                                 mode = 'AM'; // safe fallback
  } else {
    langCode = raw5.toUpperCase();
  }

  return {
    khz:       Math.round(khz),
    utc_start: tm[1],
    utc_stop:  tm[2],
    days:      days || '1234567',
    station,
    language:  LANG[langCode] || langCode || '—',
    target:    target || '—',
    mode,
  };
}

function fetchAndSave() {
  return new Promise((resolve, reject) => {
    https.get(EIBI_URL, { agent: AGENT }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`EIBI fetch failed: HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const lines  = raw.split('\n').slice(1); // skip header
        const parsed = lines.map(parseLine).filter(Boolean);
        fs.writeFileSync(OUT_PATH, JSON.stringify(parsed, null, 2));
        resolve(parsed.length);
      });
    }).on('error', reject);
  });
}

module.exports = { fetchAndSave };

// Allow direct run: node import/eibi-import.js
if (require.main === module) {
  fetchAndSave()
    .then(n => console.log(`EIBI import done: ${n} shortwave entries → data/schedule.json`))
    .catch(e => console.error('Import failed:', e.message));
}
