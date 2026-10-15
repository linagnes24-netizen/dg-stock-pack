// 股力全開｜每日收盤價資料包更新程式
// 抓「台北時間今天之前」最近一個交易日的上市＋上櫃收盤價，依市值取前 100 檔，輸出 data/latest.json。
// 需求：Node.js 18 以上，不需安裝任何套件。執行：node update-pack.mjs
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const OUT = 'data/latest.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const number = x => Number(String(x ?? '').replaceAll(',', '').trim());
export const taipeiDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);

export function previousDates(today, count = 14) {
  const d = new Date(today + 'T00:00:00Z'), dates = [];
  for (let i = 0; i < count; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// 證交所有頻率限制：每次請求間隔 1.5 秒，失敗重試 3 次
let lastCall = 0;
export async function officialJson(url) {
  let err;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = lastCall + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(25000), headers: {Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (DG stock game daily pack)'}});
      if (!res.ok) throw Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) { err = e; await sleep(2000 * attempt); }
  }
  throw Error(`連線失敗：${url}（${err?.message}）`);
}

const rocToCompact = s => { const m = String(s ?? '').match(/^(\d{2,3})\D?(\d{2})\D?(\d{2})$/); return m ? String(Number(m[1]) + 1911) + m[2] + m[3] : null; };
const sameDay = (resDate, compact) => !resDate || String(resDate) === compact || rocToCompact(resDate) === compact;
const findTable = (json, ...need) => (json?.tables ?? []).find(t => need.every(f => t.fields?.includes(f)) && t.data?.length);

export function validatePack(p) {
  if (p?.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(p.tradeDate) || !p.id || p.unitShares !== 1000 || p.stocks?.length !== 100) throw Error('資料包格式錯誤');
  const seen = new Set(); let last = Infinity;
  for (const [i, s] of p.stocks.entries()) {
    if (!/^\d{4}$/.test(s.code) || seen.has(s.code) || !s.name || !['TWSE', 'TPEx'].includes(s.market) || s.rank !== i + 1 || !Number.isSafeInteger(s.closeCents) || s.closeCents <= 0 || !(s.marketCap > 0) || s.marketCap > last) throw Error('股票資料驗證失敗：' + s.code);
    seen.add(s.code); last = s.marketCap;
  }
  return p;
}

export function buildStocks(twTable, twShares, otcTable, twCompanies, otcCompanies) {
  const twSet = new Set(twCompanies.map(x => x['公司代號']));
  const otSet = new Set(otcCompanies.map(x => x.SecuritiesCompanyCode));
  const field = (t, r, k) => r[t.fields.indexOf(k)];
  const shares = new Map(twShares.data.map(r => [field(twShares, r, '證券代號'), number(field(twShares, r, '發行股數'))]));
  const out = [];
  function add(code, name, close, issued, market) {
    const price = number(close), count = number(issued);
    if (!/^\d{4}$/.test(code) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(count) || count <= 0) return;
    out.push({code, name: String(name).trim(), market, closeCents: Math.round(price * 100), issuedShares: count, marketCap: Math.round(price * count)});
  }
  for (const r of twTable.data) { const c = field(twTable, r, '證券代號'); if (twSet.has(c)) add(c, field(twTable, r, '證券名稱'), field(twTable, r, '收盤價'), shares.get(c), 'TWSE'); }
  for (const r of otcTable.data) { const c = field(otcTable, r, '代號'); if (otSet.has(c)) add(c, field(otcTable, r, '名稱'), field(otcTable, r, '收盤'), field(otcTable, r, '發行股數'), 'TPEx'); }
  const tw = out.filter(s => s.market === 'TWSE').length, ot = out.filter(s => s.market === 'TPEx').length;
  if (tw < 700 || ot < 500) throw Error(`市場涵蓋率不足（上市 ${tw}、上櫃 ${ot}），不覆蓋原資料`);
  return out.sort((a, b) => b.marketCap - a.marketCap || a.code.localeCompare(b.code)).slice(0, 100).map((s, i) => ({...s, rank: i + 1}));
}

export async function buildPack(today = taipeiDate(), get = officialJson, log = console.log) {
  const companyUrls = ['https://openapi.twse.com.tw/v1/opendata/t187ap03_L', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O'];
  const twCompanies = await get(companyUrls[0]);
  const otcCompanies = await get(companyUrls[1]);
  for (const date of previousDates(today)) {
    const compact = date.replaceAll('-', '');
    // 1) 上市收盤：先用 ALLBUT0999，查不到再用 ALL
    let twUrl, twTable;
    for (const type of ['ALLBUT0999', 'ALL']) {
      twUrl = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${compact}&type=${type}&response=json`;
      const q = await get(twUrl);
      if (sameDay(q.date, compact)) twTable = findTable(q, '證券代號', '收盤價');
      if (twTable) break;
    }
    if (!twTable) { log(`${date}：上市無資料（休市），往前找`); continue; }
    // 2) 上櫃收盤
    const otcUrl = `https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${date.replaceAll('-', '/')}&response=json`;
    const o = await get(otcUrl);
    const otcTable = sameDay(o.date, compact) ? findTable(o, '代號', '收盤', '發行股數') : null;
    if (!otcTable) throw Error(`${date}：上市有資料但上櫃沒有，為避免資料不一致，本次不更新`);
    // 3) 上市發行股數
    const sharesUrl = `https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date=${compact}&selectType=ALLBUT0999&response=json`;
    const s = await get(sharesUrl);
    if (!sameDay(s.date, compact) || !s.fields?.includes('發行股數') || !s.data?.length) throw Error(`${date}：上市發行股數資料不完整，本次不更新`);
    const stocks = buildStocks(twTable, s, otcTable, twCompanies, otcCompanies);
    const hash = createHash('sha256').update(JSON.stringify(stocks)).digest('hex');
    return validatePack({schemaVersion: 1, id: date + '-' + hash.slice(0, 12), tradeDate: date, generatedAt: new Date().toISOString(), requestedBefore: today, unitShares: 1000, universe: '上市＋上櫃普通股；收盤價 × 當日發行股數；排除 ETF、權證、特別股、TDR；限具有效收盤價標的', rankingMethod: 'close-times-issued-shares', sources: [twUrl, sharesUrl, otcUrl, ...companyUrls], stocks});
  }
  throw Error('最近兩週查無完整的交易日資料');
}

async function main() {
  let old = null;
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const pack = await buildPack();
  if (old?.id === pack.id) { console.log(`資料沒有變化（${pack.tradeDate}），不用更新`); return; }
  if (old?.tradeDate && pack.tradeDate < old.tradeDate) throw Error(`新資料 ${pack.tradeDate} 比現有 ${old.tradeDate} 舊，不覆蓋`);
  await mkdir('data', {recursive: true});
  await writeFile(OUT, JSON.stringify(pack, null, 2) + '\n');
  console.log(`已更新：${pack.tradeDate}，第一名 ${pack.stocks[0].code} ${pack.stocks[0].name}，資料包 ${pack.id}`);
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('update-pack.mjs')) {
  main().catch(e => { console.error('更新失敗：' + e.message); process.exit(1); });
}
