// 日晷規則引擎：純函式，不碰畫面與瀏覽器儲存。可以在 Node 中執行。
const RG_ENGINE = (function (D) {
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

  return { HOUR_IDS, cellScore, evaluate, solve, newBoard, place, remove, tray, placedAt, rankFor, needInit, needStep, needOk };
})(typeof RG_DATA !== 'undefined' ? RG_DATA : require('./data.js'));

if (typeof module !== 'undefined') module.exports = RG_ENGINE;
