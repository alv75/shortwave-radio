// Fetches KiwiSDR + static WebSDR receiver list → data/receivers.json
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OUT = path.join(__dirname, '..', 'data', 'receivers.json');

// Rough GPS → continent (order matters — most specific first)
function continent(lat, lon) {
  if (lat < -60)                                           return 'Antarctica';
  // Europe: lon < 42 avoids grabbing Turkey/Caucasus east
  if (lat >  34 && lat <  72 && lon >  -45 && lon <  42)  return 'Europe';
  // N America
  if (lat >  10 && lat <  84 && lon > -170  && lon < -50)  return 'N America';
  // S America
  if (lat > -60 && lat <  15 && lon >  -82  && lon < -34)  return 'S America';
  // Oceania
  if (lat > -50 && lat <  -5 && lon >  110  && lon < 180)  return 'Oceania';
  if (lat > -25 && lat <  30 && lon >  130  && lon < 180)  return 'Oceania';
  // Middle East carve-out (before Africa, so it lands in Asia not Africa)
  // Covers Arabian Peninsula, Levant, Iran, Turkey east, Caucasus
  if (lat >  10 && lat <  43 && lon >  28   && lon <  65)  return 'Asia';
  // Africa — sub-Saharan, North Africa, East Africa, Indian Ocean islands
  if (lat > -40 && lat <  40 && lon >  -20  && lon <  60)  return 'Africa';
  // Remaining Asia (Central/South/SE/Far East)
  if (lat > -15 && lat <  77 && lon >   25  && lon < 180)  return 'Asia';
  return 'Unknown';
}

function parseGps(str) {
  const m = str && str.match(/([-\d.]+),\s*([-\d.]+)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
}

// Known countries list for substring matching
const KNOWN_COUNTRIES = [
  // Europe
  'United Kingdom','Netherlands','Germany','France','Italy','Spain','Russia',
  'Austria','Switzerland','Sweden','Norway','Finland','Denmark','Poland','Czech Republic',
  'Hungary','Romania','Slovakia','Croatia','Greece','Portugal','Belgium','Ukraine',
  'Bulgaria','Serbia','Slovenia','Estonia','Latvia','Lithuania','Ireland','Iceland',
  'Luxembourg','Malta','Cyprus','Belarus','Moldova','Albania','Bosnia','Montenegro',
  'North Macedonia','Kosovo','San Marino','Andorra','Liechtenstein','Monaco',
  'Isle of Man','Alderney','Guernsey','Jersey','Faroe Islands','Greenland',
  'Azores','Canary Islands','Madeira',
  // Americas
  'United States','Canada','Brazil','Argentina','Chile','Colombia','Peru',
  'Venezuela','Ecuador','Bolivia','Uruguay','Paraguay','Cuba','Mexico',
  'Guatemala','Costa Rica','Panama','Puerto Rico','Bermuda','Hawaii','Alaska',
  'Dominican Republic','Jamaica','Trinidad','Barbados',
  // Asia & Middle East
  'Japan','China','India','South Korea','Taiwan','Indonesia','Philippines',
  'Thailand','Vietnam','Malaysia','Singapore','Pakistan','Bangladesh','Sri Lanka',
  'Nepal','Kazakhstan','Uzbekistan','Georgia','Armenia','Azerbaijan',
  'Turkey','Israel','Iran','Iraq','Saudi Arabia','Qatar','Kuwait','UAE',
  'United Arab Emirates','Jordan','Lebanon','Syria','Yemen','Oman','Bahrain',
  'Hong Kong','Mongolia','Myanmar','Cambodia','Laos','Brunei','Maldives',
  'Kyrgyzstan','Tajikistan','Turkmenistan','Afghanistan',
  // Africa & Indian Ocean
  'South Africa','Egypt','Morocco','Nigeria','Kenya','Ethiopia','Tanzania',
  'Ghana','Cameroon','Senegal','Mozambique','Zimbabwe','Uganda','Rwanda',
  'Algeria','Tunisia','Libya','Sudan','Reunion','Mauritius','Madagascar',
  'Namibia','Botswana','Zambia','Malawi','Angola',
  // Oceania
  'Australia','New Zealand',
];

// Normalize common abbreviations
const COUNTRY_NORM = {
  'UK':'United Kingdom','GB':'United Kingdom','GBR':'United Kingdom',
  'US':'United States','USA':'United States','U.S.A.':'United States','U.S.':'United States',
  'DE':'Germany','Deutschland':'Germany','DEU':'Germany',
  'NL':'Netherlands','Nederland':'Netherlands',
  'AU':'Australia','AUS':'Australia',
  'CA':'Canada','CAN':'Canada',
  'FR':'France',
  'IT':'Italy','Italia':'Italy','ITA':'Italy',
  'ES':'Spain','España':'Spain',
  'JP':'Japan','JPN':'Japan',
  'RU':'Russia','RF':'Russia',
  'BR':'Brazil','Brasil':'Brazil',
  'CN':'China',
  'IN':'India',
  'ZA':'South Africa',
  'AT':'Austria','Österreich':'Austria',
  'CH':'Switzerland','Schweiz':'Switzerland',
  'SE':'Sweden','Sverige':'Sweden',
  'NO':'Norway','Norge':'Norway',
  'FI':'Finland','Suomi':'Finland',
  'DK':'Denmark','Danmark':'Denmark',
  'PL':'Poland',
  'CZ':'Czech Republic','CZE':'Czech Republic',
  'HU':'Hungary',
  'RO':'Romania',
  'SK':'Slovakia',
  'HR':'Croatia',
  'GR':'Greece',
  'PT':'Portugal',
  'BE':'Belgium','Belgique':'Belgium',
  'NZ':'New Zealand',
  'AR':'Argentina',
  'KR':'South Korea','ROK':'South Korea','KOREA':'South Korea',
  'TW':'Taiwan',
  'HK':'Hong Kong',
  'SG':'Singapore',
  'MY':'Malaysia',
  'TH':'Thailand',
  'ID':'Indonesia',
  'PH':'Philippines',
  'IL':'Israel',
  'TR':'Turkey',
  'UA':'Ukraine',
  'BY':'Belarus',
  'RS':'Serbia',
  'BG':'Bulgaria',
  'LT':'Lithuania',
  'LV':'Latvia',
  'EE':'Estonia',
  'IE':'Ireland',
  'IS':'Iceland',
  'LU':'Luxembourg',
  'SI':'Slovenia',
  'AL':'Albania',
  'ME':'Montenegro',
  'MK':'North Macedonia',
  'SM':'San Marino',
  'QA':'Qatar',
  'AE':'United Arab Emirates','UAE':'United Arab Emirates',
  'ZA':'South Africa',
  'MA':'Morocco',
  'EG':'Egypt',
  'NG':'Nigeria',
  'KE':'Kenya',
  'ET':'Ethiopia',
  'RE':'Reunion',
};

function stripEmoji(s) {
  return s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
}

// US state names and abbreviations
const US_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york','north carolina',
  'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
  'south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming',
  'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia',
  'ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj',
  'nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt',
  'va','wa','wv','wi','wy','dc',
]);

// Canadian provinces
const CA_PROVINCES = new Set([
  'ontario','quebec','british columbia','alberta','manitoba','saskatchewan',
  'nova scotia','new brunswick','newfoundland','pei','prince edward island',
  'northwest territories','nunavut','yukon',
  'on','qc','bc','ab','mb','sk','ns','nb','nl','pe','nt','nu','yt',
]);

// Australian states
const AU_STATES = new Set([
  'new south wales','victoria','queensland','western australia','south australia',
  'tasmania','northern territory','australian capital territory',
  'nsw','vic','qld','wa','sa','tas','nt','act',
]);

function parseCountry(loc) {
  if (!loc) return 'Other';
  const clean = stripEmoji(loc).replace(/\s+/g, ' ').trim().toLowerCase();

  // Try known countries first (longest match wins)
  for (const c of KNOWN_COUNTRIES) {
    if (clean.includes(c.toLowerCase())) return c;
  }

  // Try abbreviations in last comma-segment
  const parts = clean.split(/[,|]/).map(s => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1].toUpperCase().trim();
  if (COUNTRY_NORM[last]) return COUNTRY_NORM[last];

  // Detect US by state names or abbreviations
  for (const part of parts) {
    const p = part.trim();
    if (p === 'usa' || p === 'us' || p === 'u.s.' || p === 'u.s.a.') return 'United States';
    // "City, ST USA" → last word might be "USA"
    const words = p.split(/\s+/);
    const lastWord = words[words.length - 1].toLowerCase();
    if (lastWord === 'usa' || lastWord === 'us') return 'United States';
    if (US_STATES.has(p) || US_STATES.has(lastWord)) return 'United States';
  }

  // Detect Canada by province
  for (const part of parts) {
    const p = part.trim();
    if (CA_PROVINCES.has(p)) return 'Canada';
    const words = p.split(/\s+/);
    if (CA_PROVINCES.has(words[words.length - 1].toLowerCase())) return 'Canada';
  }

  // Detect Australia by state
  for (const part of parts) {
    if (AU_STATES.has(part.trim())) return 'Australia';
  }

  return 'Other';
}

function parseBands(str) {
  // Returns [minHz, maxHz] of the widest range
  if (!str) return [0, 0];
  const nums = str.split(/[-,]/).map(Number).filter(n => !isNaN(n));
  return [Math.min(...nums), Math.max(...nums)];
}

function coversShortwave(str) {
  const [, maxHz] = parseBands(str);
  return maxHz >= 1600000; // at least reaches 1.6 MHz
}

// Fetch plain text/JS from http or https
function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = url.startsWith('https') ? { rejectUnauthorized: false } : {};
    mod.get(url, opts, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

async function fetchAndSave() {
  const results = [];

  // --- KiwiSDR ---
  const kiwiRaw = await fetch('http://rx.linkfanel.net/kiwisdr_com.js');
  // Strip JS wrapper → parse JSON array
  const kiwiJson = kiwiRaw
    .replace(/^[\s\S]*?=\s*/, '')  // strip var kiwisdr_com =
    .replace(/,\s*([\]\}])/g, '$1') // strip trailing commas
    .replace(/;\s*$/, '');          // strip trailing semicolon
  const kiwis = JSON.parse(kiwiJson);

  for (const r of kiwis) {
    if (r.offline !== 'no' && r.offline !== '') continue;
    if (!coversShortwave(r.bands)) continue;
    if (!r.url) continue;

    const [lat, lon] = parseGps(r.gps);
    const country = parseCountry(r.loc);
    results.push({
      name:      r.name ? stripEmoji(r.name) : r.url,
      url:       r.url.replace(/\/$/, ''),
      type:      'kiwisdr',
      country,
      continent: continent(lat, lon),
      lat, lon,
      antenna:   r.antenna || '',
      bands:     r.bands || '',
      users:     parseInt(r.users) || 0,
      users_max: parseInt(r.users_max) || 0,
    });
  }

  // --- Static WebSDR ---
  const staticRaw = await fetch('http://rx.linkfanel.net/static_rx.js');
  // Eval-safe extraction: parse name/url/gps fields with regex
  const entries = [...staticRaw.matchAll(/\{([\s\S]*?)\}/g)];
  for (const [, block] of entries) {
    const get = (k) => { const m = block.match(new RegExp(k + `:\\s*'([^']*)'`)); return m ? m[1] : ''; };
    const url = get('url');
    const bands = get('bands');
    if (!url || !coversShortwave(bands)) continue;
    const [lat, lon] = parseGps(get('gps'));
    // Extract country from name: last word group after last comma
    const name = get('name');
    const nameParts = name.split(',');
    const country = nameParts.length > 1 ? nameParts[nameParts.length - 1].trim() : 'Unknown';
    results.push({
      name,
      url:       url.replace(/\/$/, ''),
      type:      'websdr',
      country,
      continent: continent(lat, lon),
      lat, lon,
      antenna:   get('antenna'),
      bands,
      users:     0,
      users_max: parseInt(get('users_max')) || 0,
    });
  }

  // Sort: continent → country → name
  results.sort((a, b) =>
    a.continent.localeCompare(b.continent) ||
    a.country.localeCompare(b.country) ||
    a.name.localeCompare(b.name)
  );

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  return results.length;
}

module.exports = { fetchAndSave };

if (require.main === module) {
  fetchAndSave()
    .then(n => console.log(`Receivers import done: ${n} → data/receivers.json`))
    .catch(e => console.error('Failed:', e.message));
}
