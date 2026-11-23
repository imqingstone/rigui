// 日晷規則引擎：純函式，不碰畫面與瀏覽器儲存。可以在 Node 中執行。
const RG_ENGINE = (function (D, TERMS) {
  const HOUR_IDS = D.HOURS.map(h => h.id);
  const N = HOUR_IDS.length;

  // ---------- 單格計分 ----------
  // 回傳 { points, kind, mod }。kind：good、neutral、bad（放了行程）或 rest（空著）；mod：季節規則造成的調整
  function cellScore(puzzle, i, cardId) {
    const h = HOUR_IDS[i];
    const se = D.SEASONS[puzzle.season];
    if (!cardId) {
      const seasonal = se.rest[h] !== undefined;
      return { points: seasonal ? se.rest[h] : D.REST[h], kind: 'rest', mod: seasonal ? 'season' : null };
    }
    const c = D.CARDS[cardId];
    let kind = c.good.includes(h) ? 'good' : c.bad.includes(h) ? 'bad' : 'neutral';
    let mod = null;
    if (se.awakeOk.includes(h) && kind === 'bad') { kind = 'neutral'; mod = 'awakeOk'; }
    if (se.mustSleep.includes(h) && kind !== 'good') { kind = 'bad'; mod = 'mustSleep'; }
    if (se.sleepIn.includes(h) && kind === 'good') { kind = 'neutral'; mod = 'sleepIn'; }
    // 睡覺類的行程：分數不低於空著休息
    if (c.asRest) {
      const rest = cellScore(puzzle, i, null);
      if (rest.points > D.POINTS[kind]) {
        return { points: rest.points, kind: rest.points >= D.POINTS.good ? 'good' : 'neutral', mod: rest.mod };
      }
    }
    return { points: D.POINTS[kind], kind, mod };
  }

  // ---------- 旅人的需求 ----------
  // 依時辰順序一格一格走，狀態只用小整數，方便求解時記憶
  function needInit(need) { return need && need.type === 'consecutive' ? [0, 0] : 0; }
  function needStep(need, st, h, cardId) {
    if (!need) return st;
    const hit = cardId === need.card;
    if (need.type === 'count') return hit && need.hours.includes(h) ? Math.min(st + 1, need.min) : st;
    if (need.type === 'at') return st || (hit && need.hours.includes(h) ? 1 : 0);
    if (need.type === 'consecutive') {
      const run = hit ? st[0] + 1 : 0;
      return [Math.min(run, need.min), st[1] || (run >= need.min ? 1 : 0)];
    }
    return st;
  }
  function needOk(need, st) {
    if (!need) return true;
    if (need.type === 'count') return st >= need.min;
    if (need.type === 'at') return st === 1;
    if (need.type === 'consecutive') return st[1] === 1;
    return true;
  }

  // 夜裡（或冬天天還沒亮）休息拿滿分用月亮，其餘依分數
  function iconFor(puzzle, cell) {
    const se = D.SEASONS[puzzle.season];
    const dark = D.NIGHT.includes(cell.hour) || se.sleepIn.includes(cell.hour);
    const sleeping = !cell.cardId || D.CARDS[cell.cardId].asRest;
    if (sleeping && cell.points === D.POINTS.good && dark) return D.ICONS.moon;
    return D.ICONS[cell.points];
  }
  // 時辰的說明，依季節改寫
  function suitFor(puzzle, hourId) {
    const h = D.HOURS.find(x => x.id === hourId);
    return (h.bySeason && h.bySeason[puzzle.season]) || h.suit;
  }

  function rankFor(total) { return D.RANKS.find(r => total >= r.min).name; }

  // ---------- 盤面 ----------
  // slots[i] 是放在第 i 個時辰的卡片編號（puzzle.cards 的索引），沒有就是 null
  function newBoard() { return { slots: new Array(N).fill(null) }; }
  function placedAt(board, cardIdx) { return board.slots.indexOf(cardIdx); }
  function tray(board, puzzle) { return puzzle.cards.map((_, k) => k).filter(k => placedAt(board, k) === -1); }

  // 放卡：卡片若已放在別格就移過來；目標格原本的卡退回手上
  function place(board, cardIdx, slot) {
    const slots = board.slots.slice();
    const from = slots.indexOf(cardIdx);
    if (from !== -1) slots[from] = null;
    slots[slot] = cardIdx;
    return { slots };
  }
  function remove(board, slot) {
    const slots = board.slots.slice();
    slots[slot] = null;
    return { slots };
  }

  // ---------- 整盤評分 ----------
  function evaluate(puzzle, board) {
    const need = D.TRAVELERS[puzzle.traveler].need;
    let st = needInit(need);
    const cells = HOUR_IDS.map((h, i) => {
      const k = board.slots[i];
      const cardId = k === null ? null : puzzle.cards[k];
      st = needStep(need, st, h, cardId);
      return Object.assign({ hour: h, cardId }, cellScore(puzzle, i, cardId));
    });
    const total = cells.reduce((n, c) => n + c.points, 0);
    const ok = needOk(need, st);
    let rank = rankFor(total);
    if (!ok && rank === D.RANKS[0].name) rank = D.RANKS[1].name;
    const allPlaced = puzzle.cards.every((_, k) => board.slots.includes(k));
    return { cells, total, max: N * D.POINTS.good, need: need ? { text: need.text, ok } : null, rank, allPlaced };
  }

  // ---------- 求解：所有卡都放上、需求達成時的最高分 ----------
  // 依時辰往下走，每格選「空著」或放一張還沒用的卡；相同的卡只試一次
  function solve(puzzle) {
    const need = D.TRAVELERS[puzzle.traveler].need;
    const cards = puzzle.cards;
    const full = (1 << cards.length) - 1;
    const memo = new Map();
    function go(i, mask, st) {
      if (i === N) return mask === full && needOk(need, st) ? { v: 0, pick: [] } : null;
      const key = i + '|' + mask + '|' + st;
      if (memo.has(key)) return memo.get(key);
      let best = null;
      const h = HOUR_IDS[i];
      const tryPick = (k, cardId) => {
        const nextMask = k === null ? mask : mask | (1 << k);
        const sub = go(i + 1, nextMask, needStep(need, st, h, cardId));
        if (!sub) return;
        const v = cellScore(puzzle, i, cardId).points + sub.v;
        if (!best || v > best.v) best = { v, pick: [k].concat(sub.pick) };
      };
      tryPick(null, null);
      const seen = new Set();
      cards.forEach((cardId, k) => {
        if (mask & (1 << k) || seen.has(cardId)) return;
        seen.add(cardId);
        tryPick(k, cardId);
      });
      memo.set(key, best);
      return best;
    }
    const r = go(0, 0, needInit(need));
    return r ? { best: r.v, slots: r.pick } : null;
  }

  // ---------- 日期與節氣（台灣時間，UTC+8） ----------
  const pad = n => String(n).padStart(2, '0');
  function taiwanDate(ms) {
    const d = new Date(ms + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const parts = date => date.split('-').map(Number);
  function dayNumber(date) { const [y, m, d] = parts(date); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
  function addDays(date, n) {
    const [y, m, d] = parts(date);
    const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  // 這一天（以當天結束前為準）所在的節氣；terms.js 的時刻是 1970-01-01 00:00（UTC+8）起算的分鐘數
  function termOn(date) {
    const [y, m, d] = parts(date);
    const mins = Date.UTC(y, m - 1, d, 23, 59) / 60000;
    let best = null;
    [y - 1, y].forEach(yy => {
      const row = TERMS.data[yy - TERMS.start];
      if (!row) return;
      row.forEach((t, i) => { if (t <= mins && (!best || t > best.t)) best = { t, i }; });
    });
    if (!best) throw new Error('超出節氣資料的年份：' + date);
    const name = TERMS.names[best.i];
    return { name, season: D.TERM_SEASON[name], start: taiwanDate((best.t - 8 * 60) * 60000) };
  }

  // 這一天所在節氣的日期範圍（起始日到下一個節氣的前一天）
  function termRange(date) {
    const t = termOn(date);
    let end = t.start;
    for (let k = 1; k < 20; k++) { const nd = addDays(t.start, k); if (termOn(nd).name !== t.name) { end = addDays(nd, -1); break; } }
    return { name: t.name, start: t.start, end };
  }

  // ---------- 連續天數與庭院 ----------
  // dates：玩過今日一題的日期；current：到今天（或昨天）為止連續幾天；best：歷來最長
  function streakInfo(dates, today) {
    const set = new Set(dates);
    let best = 0, run = 0, prev = null;
    Array.from(set).sort().forEach(d => {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    });
    let current = 0;
    let d = set.has(today) ? today : addDays(today, -1);
    while (set.has(d)) { current++; d = addDays(d, -1); }
    return { current, best };
  }
  // 庭院依「歷來最長的連續天數」成長，中斷不會變少
  function garden(best) {
    const have = D.GARDEN.filter(g => best >= g.at);
    const next = D.GARDEN.find(g => best < g.at) || null;
    return { have, next };
  }

  // ---------- 日出日落（NOAA 的近似算法，誤差約數分鐘） ----------
  // 回傳當地時間的小時數，例如 6.5 代表 6:30
  function sunTimes(date) {
    const { lat, lon, tz } = D.SUN;
    const [y, m, d] = parts(date);
    const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
    const g = 2 * Math.PI / 365 * (doy - 1);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const rad = Math.PI / 180, phi = lat * rad;
    const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl)) / rad;
    const rise = (720 - 4 * (lon + ha) - eq) / 60 + tz;
    const set = (720 - 4 * (lon - ha) - eq) / 60 + tz;
    return { rise, set };
  }
  // 時辰中點（子時為 0 點，丑時 2 點……）是否在日落後、日出前
  function isDark(date, i) {
    const { rise, set } = sunTimes(date);
    const mid = i * 2;
    return mid < rise || mid > set;
  }

  // ---------- 亂數 ----------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- 旅人輪替：每六天輪一遍，順序打散，而且不連續兩天同一位 ----------
  function travelerFor(date) {
    const T = D.DAILY.travelers, n = T.length;
    const day = dayNumber(date), block = Math.floor(day / n), pos = day - block * n;
    const order = b => shuffle(T, rng(hash('rigui:travelers:' + b)));
    let perm = order(block);
    if (perm[0] === order(block - 1)[n - 1]) perm = [perm[1], perm[0]].concat(perm.slice(2));
    return perm[pos];
  }

  // ---------- 出題 ----------
  // 依種子挑出行程（含旅人需要的卡），只收「需求達成時能拿到最高評等」的組合
  function makePuzzle(date, opts) {
    const o = opts || {};
    const term = termOn(date);
    const traveler = o.traveler || travelerFor(date);
    const r = rng(hash(o.seed || ('rigui:' + date)));
    const [lo, hi] = D.DAILY.size;
    const base = D.DAILY.needCards[traveler];
    for (let k = 0; k < D.DAILY.tries; k++) {
      const n = lo + Math.floor(r() * (hi - lo + 1));
      const pool = shuffle(D.DAILY.pool.filter(id => !base.includes(id)), r);
      const cards = shuffle(base.concat(pool.slice(0, n - base.length)), r);
      const p = { date, term: term.name, season: term.season, traveler, cards, practice: !!o.seed };
      const s = solve(p);
      if (s && s.best >= D.RANKS[0].min) return Object.assign(p, { best: s.best });
    }
    throw new Error('找不到能拿最高評等的題目：' + date);
  }

  // ---------- 分享文字 ----------
  function shareText(puzzle, ev) {
    const [, m, d] = parts(puzzle.date);
    const icons = ev.cells.map(c => iconFor(puzzle, c));
    return [
      `日晷・${m}/${d} ${puzzle.term}${puzzle.practice ? '（練習）' : ''}`,
      icons.slice(0, 6).join(''),
      icons.slice(6).join(''),
      `${ev.total}/${ev.max} ${ev.rank}`,
      D.SITE
    ].join('\n');
  }

  return { HOUR_IDS, cellScore, iconFor, suitFor, termRange, streakInfo, garden, sunTimes, isDark, taiwanDate, dayNumber, addDays, termOn, hash, rng, travelerFor, makePuzzle, shareText, evaluate, solve, newBoard, place, remove, tray, placedAt, rankFor, needInit, needStep, needOk };
})(typeof RG_DATA !== 'undefined' ? RG_DATA : require('./data.js'),
  typeof SISHI_TERMS !== 'undefined' ? SISHI_TERMS : require('./terms.js'));

if (typeof module !== 'undefined') module.exports = RG_ENGINE;
