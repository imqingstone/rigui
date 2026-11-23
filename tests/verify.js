// 日晷測試：node tests/verify.js（不依賴任何套件）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('../docs/data.js');
const E = require('../docs/engine.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failed++; console.error('✗ ' + name + '\n  ' + (err && err.stack || err)); }
}
const IDS = E.HOUR_IDS;
const at = h => IDS.indexOf(h);
const P = (over) => Object.assign({ date: '2026-01-01', term: '測試', season: 'spring', traveler: 'wanderer', cards: [] }, over);
const boardOf = (puzzle, map) => { const b = E.newBoard(); Object.entries(map).forEach(([h, k]) => { b.slots[at(h)] = k; }); return b; };

// ---------- 資料 ----------
test('資料：十二時辰依序、各有值班的官與原文', () => {
  assert.deepStrictEqual(IDS, ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']);
  D.HOURS.forEach(h => assert.ok(h.time && h.organ && h.title && h.line && h.suit, h.id));
  D.NIGHT.forEach(h => assert.ok(IDS.includes(h)));
  IDS.forEach(h => assert.ok(Number.isInteger(D.REST[h]) && D.REST[h] >= 0 && D.REST[h] <= 3, h));
});

test('資料：行程卡的時辰都存在，適合與不適合不重疊', () => {
  Object.entries(D.CARDS).forEach(([id, c]) => {
    assert.ok(c.name && c.desc, id);
    c.good.concat(c.bad).forEach(h => assert.ok(IDS.includes(h), id + ' ' + h));
    assert.ok(c.good.length > 0, id + ' 沒有適合的時辰');
    assert.ok(!c.good.some(h => c.bad.includes(h)), id + ' 適合與不適合重疊');
    if (c.only) assert.ok(D.TRAVELERS[c.only], id);
  });
});

test('資料：旅人的需求指向存在的行程與時辰', () => {
  Object.entries(D.TRAVELERS).forEach(([id, t]) => {
    assert.ok(t.name && t.line, id);
    if (!t.need) return;
    assert.ok(['count', 'at', 'consecutive'].includes(t.need.type), id);
    assert.ok(D.CARDS[t.need.card], id);
    (t.need.hours || []).forEach(h => assert.ok(IDS.includes(h), id));
    assert.ok(t.need.text, id);
  });
});

test('資料：四季作息的時辰都存在', () => {
  ['spring', 'summer', 'autumn', 'winter'].forEach(s => {
    const se = D.SEASONS[s];
    assert.ok(se.name && se.rule && se.quote && se.note, s);
    Object.keys(se.rest).concat(se.awakeOk, se.mustSleep, se.sleepIn).forEach(h => assert.ok(IDS.includes(h), s + ' ' + h));
  });
});

// ---------- 單格計分 ----------
test('計分：適合 3、中性 1、不適合 0', () => {
  const p = P({});
  assert.strictEqual(E.cellScore(p, at('辰'), 'breakfast').points, 3);
  assert.strictEqual(E.cellScore(p, at('巳'), 'breakfast').points, 1);
  assert.strictEqual(E.cellScore(p, at('子'), 'breakfast').points, 0);
  assert.strictEqual(E.cellScore(p, at('辰'), 'breakfast').kind, 'good');
});

test('計分：空著的時辰依休息表給分，子丑休息 3 分', () => {
  const p = P({ season: 'spring' });
  assert.strictEqual(E.cellScore(p, at('子'), null).points, 3);
  assert.strictEqual(E.cellScore(p, at('丑'), null).points, 3);
  assert.strictEqual(E.cellScore(p, at('巳'), null).points, 1);
});

test('季節：春夏夜臥早起，亥時醒著不扣分、卯時該起身', () => {
  ['spring', 'summer'].forEach(s => {
    const p = P({ season: s });
    assert.strictEqual(E.cellScore(p, at('亥'), 'breakfast').points, 1, '早膳原本不適合亥時，春夏不扣分');
    assert.strictEqual(E.cellScore(p, at('亥'), 'breakfast').mod, 'awakeOk');
    assert.strictEqual(E.cellScore(p, at('卯'), null).points, 0, '卯時還在睡');
    assert.strictEqual(E.cellScore(p, at('卯'), 'walk').points, 3);
  });
});

test('季節：秋天早臥早起，亥時該就寢', () => {
  const p = P({ season: 'autumn' });
  assert.strictEqual(E.cellScore(p, at('亥'), 'tea').points, 0);
  assert.strictEqual(E.cellScore(p, at('亥'), 'bedtime').points, 3);
  assert.strictEqual(E.cellScore(p, at('亥'), null).points, 3);
});

test('季節：冬天早臥晚起，卯時繼續睡最好，起身散步只算中性', () => {
  const p = P({ season: 'winter' });
  assert.strictEqual(E.cellScore(p, at('卯'), null).points, 3);
  assert.strictEqual(E.cellScore(p, at('卯'), 'walk').points, 1);
  assert.strictEqual(E.cellScore(p, at('卯'), 'walk').mod, 'sleepIn');
  assert.strictEqual(E.cellScore(p, at('亥'), 'sit').points, 3, '靜坐適合亥時，冬天仍適合');
  assert.strictEqual(E.cellScore(p, at('亥'), 'tea').points, 0);
});

test('圖示：夜裡休息拿滿分是月亮，白天是太陽；冬天卯時繼續睡也算夜裡', () => {
  const w = P({ season: 'winter' }), sp = P({ season: 'spring' });
  const cell = (p, h, cardId) => Object.assign({ hour: h, cardId: cardId || null }, E.cellScore(p, at(h), cardId || null));
  assert.strictEqual(E.iconFor(w, cell(w, '子')), D.ICONS.moon);
  assert.strictEqual(E.iconFor(w, cell(w, '卯')), D.ICONS.moon);
  assert.strictEqual(E.iconFor(w, cell(w, '辰', 'breakfast')), D.ICONS[3]);
  assert.strictEqual(E.iconFor(sp, cell(sp, '卯', 'walk')), D.ICONS[3], '春天卯時起身散步是白天的太陽');
  assert.strictEqual(E.iconFor(w, cell(w, '巳')), D.ICONS[1]);
});

test('說明：卯時與亥時依季節改寫，冬天卯時寫「必待日光」', () => {
  assert.ok(E.suitFor(P({ season: 'winter' }), '卯').includes('必待日光'));
  assert.ok(!E.suitFor(P({ season: 'winter' }), '卯').includes('起身'));
  assert.ok(E.suitFor(P({ season: 'spring' }), '卯').includes('平旦人氣生'));
  assert.ok(E.suitFor(P({ season: 'summer' }), '亥').includes('夜臥早起'));
  ['spring', 'summer', 'autumn', 'winter'].forEach(s => {
    const se = D.SEASONS[s];
    se.mustSleep.concat(se.awakeOk, se.sleepIn, Object.keys(se.rest)).forEach(h => assert.ok(se.notes[h], s + ' 缺少 ' + h + ' 的說明'));
  });
});

test('安睡：任何季節、任何時辰，放「安睡」的分數都不比空著休息低', () => {
  ['spring', 'summer', 'autumn', 'winter'].forEach(se => {
    const p = P({ season: se });
    IDS.forEach((h, i) => {
      const sleep = E.cellScore(p, i, 'sleep').points, rest = E.cellScore(p, i, null).points;
      assert.ok(sleep >= rest, `${se} ${h}：安睡 ${sleep} 分，休息 ${rest} 分`);
    });
  });
});

test('安睡：寅時、冬天卯時、秋冬亥時都算適合（3 分）', () => {
  assert.strictEqual(E.cellScore(P({ season: 'spring' }), at('寅'), 'sleep').points, 3);
  assert.strictEqual(E.cellScore(P({ season: 'winter' }), at('卯'), 'sleep').points, 3);
  ['autumn', 'winter'].forEach(se => {
    const c = E.cellScore(P({ season: se }), at('亥'), 'sleep');
    assert.strictEqual(c.points, 3, se); assert.strictEqual(c.kind, 'good', se);
  });
  assert.ok(E.cellScore(P({ season: 'spring' }), at('卯'), 'sleep').points < 3, '春天卯時該起身');
});

test('圖示：夜裡放「安睡」拿滿分也是月亮', () => {
  const w = P({ season: 'winter' });
  const cell = (h) => Object.assign({ hour: h, cardId: 'sleep' }, E.cellScore(w, at(h), 'sleep'));
  ['子', '丑', '寅', '卯', '亥'].forEach(h => assert.strictEqual(E.iconFor(w, cell(h)), D.ICONS.moon, h));
});

test('收拾就寢：白天（巳到酉）與清晨（卯、辰）都算不合時，亥時適合', () => {
  ['spring', 'summer', 'autumn', 'winter'].forEach(se => {
    const p = P({ season: se });
    ['卯', '辰', '巳', '午', '未', '申', '酉'].forEach(h => assert.strictEqual(E.cellScore(p, at(h), 'bedtime').points, 0, se + ' ' + h));
    assert.strictEqual(E.cellScore(p, at('亥'), 'bedtime').points, 3, se);
  });
});

// ---------- 旅人的需求 ----------
test('需求：書生白天讀書至少兩個時辰', () => {
  const p = P({ traveler: 'scholar', cards: ['study', 'study'] });
  assert.strictEqual(E.evaluate(p, boardOf(p, { 巳: 0, 申: 1 })).need.ok, true);
  assert.strictEqual(E.evaluate(p, boardOf(p, { 巳: 0, 子: 1 })).need.ok, false, '半夜讀書不算');
});

test('需求：商人連續兩個時辰趕路', () => {
  const p = P({ traveler: 'merchant', cards: ['travel', 'travel'] });
  assert.strictEqual(E.evaluate(p, boardOf(p, { 辰: 0, 巳: 1 })).need.ok, true);
  assert.strictEqual(E.evaluate(p, boardOf(p, { 辰: 0, 未: 1 })).need.ok, false);
});

test('需求：農夫卯或辰下田、老者亥時就寢', () => {
  const f = P({ traveler: 'farmer', cards: ['farm'] });
  assert.strictEqual(E.evaluate(f, boardOf(f, { 辰: 0 })).need.ok, true);
  assert.strictEqual(E.evaluate(f, boardOf(f, { 巳: 0 })).need.ok, false);
  const o = P({ traveler: 'elder', cards: ['bedtime'] });
  assert.strictEqual(E.evaluate(o, boardOf(o, { 亥: 0 })).need.ok, true);
  assert.strictEqual(E.evaluate(o, boardOf(o, { 戌: 0 })).need.ok, false);
});

test('評等：需求沒達成時，最高只到第二級', () => {
  const p = P({ traveler: 'scholar', cards: ['study'] });
  const fake = Object.assign({}, E.evaluate(p, E.newBoard()));
  assert.strictEqual(E.rankFor(36), D.RANKS[0].name);
  assert.strictEqual(E.rankFor(D.RANKS[1].min), D.RANKS[1].name);
  assert.strictEqual(E.rankFor(0), D.RANKS[D.RANKS.length - 1].name);
  assert.strictEqual(fake.need.ok, false);
  assert.notStrictEqual(fake.rank, D.RANKS[0].name);
});

// ---------- 盤面 ----------
test('盤面：放卡、移動、替換、收回，不修改原盤面', () => {
  const b0 = E.newBoard();
  const b1 = E.place(b0, 0, 4);
  assert.strictEqual(b0.slots[4], null);
  assert.strictEqual(b1.slots[4], 0);
  const b2 = E.place(b1, 0, 5);
  assert.strictEqual(b2.slots[4], null); assert.strictEqual(b2.slots[5], 0);
  const b3 = E.place(b2, 1, 5);
  assert.strictEqual(b3.slots[5], 1); assert.strictEqual(E.placedAt(b3, 0), -1, '被替換的卡回到手上');
  const b4 = E.remove(b3, 5);
  assert.strictEqual(b4.slots[5], null); assert.strictEqual(b3.slots[5], 1);
  const p = P({ cards: ['tea', 'nap'] });
  assert.deepStrictEqual(E.tray(b3, p), [0]);
});

test('評分：全部放上才算排好；總分是各格相加', () => {
  const p = P({ cards: ['breakfast', 'lunch'] });
  const ev1 = E.evaluate(p, boardOf(p, { 辰: 0 }));
  assert.strictEqual(ev1.allPlaced, false);
  const ev2 = E.evaluate(p, boardOf(p, { 辰: 0, 午: 1 }));
  assert.strictEqual(ev2.allPlaced, true);
  assert.strictEqual(ev2.total, ev2.cells.reduce((n, c) => n + c.points, 0));
  assert.strictEqual(ev2.max, 36);
});

// ---------- 求解 ----------
function brute(puzzle) {
  // 窮舉：每張卡放進不同的時辰，算最高分（只用在小題目）
  let best = -1;
  const n = puzzle.cards.length;
  const slots = new Array(12).fill(null);
  (function rec(k) {
    if (k === n) {
      const ev = E.evaluate(puzzle, { slots });
      if (ev.need === null || ev.need.ok) best = Math.max(best, ev.total);
      return;
    }
    for (let i = 0; i < 12; i++) if (slots[i] === null) { slots[i] = k; rec(k + 1); slots[i] = null; }
  })(0);
  return best;
}

test('求解：與窮舉的結果相同（多種小題目）', () => {
  const cases = [
    P({ season: 'winter', traveler: 'scholar', cards: ['study', 'study', 'tea'] }),
    P({ season: 'spring', traveler: 'merchant', cards: ['travel', 'travel', 'lunch'] }),
    P({ season: 'autumn', traveler: 'elder', cards: ['bedtime', 'dinner', 'walk'] }),
    P({ season: 'summer', traveler: 'farmer', cards: ['farm', 'nap', 'bath'] }),
    P({ season: 'winter', traveler: 'painter', cards: ['paint', 'sit', 'tea', 'nap'] })
  ];
  cases.forEach(p => assert.strictEqual(E.solve(p).best, brute(p), JSON.stringify(p.cards)));
});

test('求解：解出的排法照實評分，分數一致、需求達成', () => {
  const p = P({ season: 'spring', traveler: 'merchant', cards: ['travel', 'travel', 'lunch', 'tea', 'dinner'] });
  const s = E.solve(p);
  const ev = E.evaluate(p, { slots: s.slots });
  assert.strictEqual(ev.total, s.best); assert.ok(ev.need.ok); assert.ok(ev.allPlaced);
});

test('里程碑 1 的固定題目（書生、立冬）能拿到滿分與最高評等', () => {
  const p = D.FIXED;
  assert.strictEqual(p.term, '立冬'); assert.strictEqual(p.season, 'winter'); assert.strictEqual(p.traveler, 'scholar');
  const s = E.solve(p);
  assert.strictEqual(s.best, 36);
  const ev = E.evaluate(p, { slots: s.slots });
  assert.strictEqual(ev.rank, D.RANKS[0].name);
  // 什麼都不排：不算排好，而且分數明顯較低
  const empty = E.evaluate(p, E.newBoard());
  assert.ok(!empty.allPlaced && empty.total < 30);
});

// ---------- 每日題目 ----------
test('日期：依台灣時間（UTC+8）換日', () => {
  assert.strictEqual(E.taiwanDate(Date.UTC(2026, 10, 22, 15, 59)), '2026-11-22');
  assert.strictEqual(E.taiwanDate(Date.UTC(2026, 10, 22, 16, 0)), '2026-11-23');
  assert.strictEqual(E.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(E.dayNumber('2026-11-24') - E.dayNumber('2026-11-23'), 1);
});

test('節氣：依當天判斷，節氣當天就算新節氣；季節對應正確', () => {
  const t = d => E.termOn(d);
  assert.strictEqual(t('2026-11-06').name, '霜降');
  assert.strictEqual(t('2026-11-07').name, '立冬');
  assert.strictEqual(t('2026-11-23').name, '小雪');
  assert.strictEqual(t('2026-02-04').name, '立春');
  assert.strictEqual(t('2027-01-05').name, '小寒');
  assert.strictEqual(t('2026-11-07').season, 'winter');
  assert.strictEqual(t('2026-02-04').season, 'spring');
  assert.strictEqual(t('2026-11-23').start, '2026-11-22');
  Object.values(D.TERM_SEASON).forEach(s => assert.ok(D.SEASONS[s]));
  assert.strictEqual(Object.keys(D.TERM_SEASON).length, 24);
});

test('旅人：同一天固定；每六天每位都出現；不連續兩天同一位', () => {
  assert.strictEqual(E.travelerFor('2026-11-23'), E.travelerFor('2026-11-23'));
  let d = '2026-01-01', prev = null;
  for (let i = 0; i < 800; i++) {
    const t = E.travelerFor(d);
    assert.ok(D.TRAVELERS[t]);
    assert.notStrictEqual(t, prev, d + ' 與前一天同一位旅人');
    prev = t; d = E.addDays(d, 1);
  }
  // 每個六天區塊（依日數對齊）裡六位都出現
  const start = E.dayNumber('2026-11-23');
  const block0 = Math.floor(start / 6) * 6;
  const seen = new Set();
  for (let k = 0; k < 6; k++) seen.add(E.travelerFor(E.addDays('2026-11-23', block0 + k - start)));
  assert.strictEqual(seen.size, 6);
});

function checkPuzzle(p, label) {
  const need = D.DAILY.needCards[p.traveler];
  assert.ok(p.cards.length >= D.DAILY.size[0] && p.cards.length <= D.DAILY.size[1], label + ' 張數');
  need.forEach(c => assert.ok(p.cards.filter(x => x === c).length >= need.filter(x => x === c).length, label + ' 缺少需求卡 ' + c));
  p.cards.forEach(c => { const only = D.CARDS[c].only; assert.ok(!only || only === p.traveler, label + ' 出現別人的專屬卡 ' + c); });
  const extra = p.cards.slice(); need.forEach(c => extra.splice(extra.indexOf(c), 1));
  assert.strictEqual(new Set(extra).size, extra.length, label + ' 一般行程重複');
  const s = E.solve(p);
  assert.ok(s && s.best >= D.RANKS[0].min, label + ' 拿不到最高評等');
  const ev = E.evaluate(p, { slots: s.slots });
  assert.strictEqual(ev.rank, D.RANKS[0].name, label);
  assert.ok(ev.allPlaced && (!ev.need || ev.need.ok), label);
}

test('每日題目：同一天同一題、不同天不同題', () => {
  assert.deepStrictEqual(E.makePuzzle('2026-11-23'), E.makePuzzle('2026-11-23'));
  assert.notDeepStrictEqual(E.makePuzzle('2026-11-23').cards, E.makePuzzle('2026-11-24').cards);
  const p = E.makePuzzle('2026-11-23');
  assert.strictEqual(p.term, '小雪'); assert.strictEqual(p.season, 'winter'); assert.strictEqual(p.practice, false);
});

test('每日題目：從今天起未來一年的每一天，都有能拿最高評等的排法', () => {
  let d = E.taiwanDate(Date.now());
  for (let i = 0; i <= 366; i++) { checkPuzzle(E.makePuzzle(d), d); d = E.addDays(d, 1); }
});

test('每日題目：四季與所有旅人在一年內都會出現', () => {
  const seasons = new Set(), travelers = new Set();
  let d = '2027-01-01';
  for (let i = 0; i < 365; i++) { const p = E.makePuzzle(d); seasons.add(p.season); travelers.add(p.traveler); d = E.addDays(d, 1); }
  assert.strictEqual(seasons.size, 4); assert.strictEqual(travelers.size, 6);
});

test('練習：依種子出題，可以指定旅人，也保證有解', () => {
  for (let k = 0; k < 60; k++) {
    const t = D.DAILY.travelers[k % 6];
    const p = E.makePuzzle('2026-06-21', { seed: 'practice:' + k, traveler: t });
    assert.strictEqual(p.traveler, t); assert.strictEqual(p.practice, true);
    checkPuzzle(p, 'practice ' + k);
  }
  assert.deepStrictEqual(E.makePuzzle('2026-06-21', { seed: 'x' }), E.makePuzzle('2026-06-21', { seed: 'x' }));
});

test('分享文字：日期與節氣、兩行各六個符號、分數與評等、網址，不透露排法', () => {
  const p = E.makePuzzle('2026-11-23');
  const ev = E.evaluate(p, { slots: E.solve(p).slots });
  const lines = E.shareText(p, ev).split('\n');
  assert.strictEqual(lines.length, 5);
  assert.strictEqual(lines[0], '日晷・11/23 小雪');
  const icons = Object.values(D.ICONS);
  [lines[1], lines[2]].forEach(l => assert.strictEqual(Array.from(l).filter(ch => icons.includes(ch)).length, 6, l));
  assert.strictEqual(lines[3], `${ev.total}/36 ${ev.rank}`);
  assert.strictEqual(lines[4], D.SITE);
  p.cards.forEach(c => assert.ok(!E.shareText(p, ev).includes(D.CARDS[c].name), '分享文字透露了行程'));
  assert.ok(E.shareText(E.makePuzzle('2026-11-23', { seed: 's' }), ev).includes('（練習）'));
});

// ---------- 收集與回訪 ----------
test('節氣圖鑑：二十四節氣都有三候與介紹；日期範圍正確', () => {
  assert.deepStrictEqual(Object.keys(D.TERM_INFO).sort(), Object.keys(D.TERM_SEASON).sort());
  Object.entries(D.TERM_INFO).forEach(([k, v]) => { assert.strictEqual(v.hou.length, 3, k); assert.ok(v.intro, k); });
  assert.deepStrictEqual(E.termRange('2026-11-23'), { name: '小雪', start: '2026-11-22', end: '2026-12-06' });
  assert.strictEqual(E.termRange('2026-12-31').name, '冬至');
  // 一年裡每一天的節氣範圍都包含那一天，而且長度合理
  let d = '2027-01-01';
  for (let i = 0; i < 365; i++) {
    const r = E.termRange(d);
    assert.ok(r.start <= d && d <= r.end, d);
    const len = E.dayNumber(r.end) - E.dayNumber(r.start) + 1;
    assert.ok(len >= 13 && len <= 17, d + ' 長度 ' + len);
    d = E.addDays(d, 1);
  }
});

test('旅人圖鑑：每位旅人都有介紹', () => {
  D.DAILY.travelers.forEach(id => assert.ok(D.TRAVELERS[id].bio, id));
});

test('連續天數：今天或昨天為止的連續天數，與歷來最長', () => {
  const s = E.streakInfo;
  assert.deepStrictEqual(s([], '2026-11-23'), { current: 0, best: 0 });
  assert.deepStrictEqual(s(['2026-11-21', '2026-11-22', '2026-11-23'], '2026-11-23'), { current: 3, best: 3 });
  assert.deepStrictEqual(s(['2026-11-21', '2026-11-22'], '2026-11-23'), { current: 2, best: 2 }, '今天還沒玩，昨天以前的連續還算');
  assert.deepStrictEqual(s(['2026-11-20', '2026-11-21'], '2026-11-23'), { current: 0, best: 2 }, '中斷了');
  assert.deepStrictEqual(s(['2026-12-31', '2027-01-01', '2026-12-30'], '2027-01-01'), { current: 3, best: 3 }, '跨年');
});

test('庭院：依歷來最長的連續天數成長，中斷不會變少', () => {
  assert.strictEqual(E.garden(0).have.length, 0);
  assert.strictEqual(E.garden(1).have[0].id, 'dial');
  assert.strictEqual(E.garden(3).next.at, 5);
  assert.strictEqual(E.garden(30).next, null);
  assert.strictEqual(E.garden(30).have.length, D.GARDEN.length);
  for (let n = 1; n < 40; n++) assert.ok(E.garden(n).have.length >= E.garden(n - 1).have.length);
  ['tree', 'lamp', 'bench'].forEach(id => assert.ok(D.GARDEN.some(g => g.id === id), '規格要求的 ' + id));
});

// ---------- 里程碑 4 ----------
test('日出日落：臺北的近似值落在合理範圍', () => {
  const near = (h, hh, mm) => Math.abs(h - (hh + mm / 60)) <= 8 / 60;
  const s = E.sunTimes('2026-06-21'), w = E.sunTimes('2026-12-22');
  assert.ok(near(s.rise, 5, 4) && near(s.set, 18, 47), '夏至');
  assert.ok(near(w.rise, 6, 35) && near(w.set, 17, 12), '冬至');
  assert.ok(E.isDark('2026-12-22', 3) && !E.isDark('2026-06-21', 3), '卯時冬暗夏亮');
  ['子', '丑', '寅', '亥'].forEach(h => assert.ok(E.isDark('2026-06-21', at(h)), h + ' 夏至也是夜晚'));
  ['辰', '巳', '午', '未', '申'].forEach(h => assert.ok(!E.isDark('2026-12-22', at(h)), h + ' 冬至也是白天'));
});

test('說明頁：出處都連到維基文庫，附注與免責說明齊全', () => {
  assert.ok(D.SOURCES.length >= 5);
  D.SOURCES.forEach(s => { assert.ok(/^https:\/\/zh\.wikisource\.org\/wiki\//.test(s.url), s.title); assert.ok(s.use, s.title); });
  assert.ok(D.NOTES.some(n => n.includes('子午流注')), '要標明子午流注不是內經原文');
  assert.ok(D.TEXT.disclaimer.includes('不構成任何醫療或健康建議'));
});

test('原文：引用的句子與維基文庫核對過的版本一致', () => {
  const lines = {
    子: '膽者，中正之官，決斷出焉。', 丑: '肝者，將軍之官，謀慮出焉。', 寅: '肺者，相傅之官，治節出焉。', 卯: '大腸者，傳道之官，變化出焉。',
    辰: '脾胃者，倉廩之官，五味出焉。', 午: '心者，君主之官也，神明出焉。', 未: '小腸者，受盛之官，化物出焉。',
    申: '膀胱者，州都之官，津液藏焉，氣化則能出矣。', 酉: '腎者，作強之官，伎巧出焉。', 戌: '膻中者，臣使之官，喜樂出焉。', 亥: '三焦者，決瀆之官，水道出焉。'
  };
  Object.entries(lines).forEach(([h, l]) => assert.strictEqual(D.HOURS[at(h)].line, l, h));
  assert.strictEqual(D.TERM_INFO.立春.hou[2], '魚上冰');
  assert.strictEqual(D.TERM_INFO.小暑.hou[2], '鷹乃學習');
  assert.strictEqual(D.TERM_INFO.小滿.hou[2], '小暑至');
});

test('頁面：插畫、圖示與分享縮圖都在', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  ['img/hero-tall.jpg', 'img/hero-wide.jpg', 'img/og.jpg', 'apple-touch-icon.png', 'icon-192.png'].forEach(f => {
    const st = fs.statSync(path.join(__dirname, '../docs/' + f));
    assert.ok(st.size > 1000 && st.size < 400 * 1024, f + ' 大小 ' + st.size);
  });
  assert.ok(html.includes('og:image') && html.includes('apple-touch-icon'));
});

test('頁面：回到青石驛、使用次數、GoatCounter 都在', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  assert.ok(html.includes('href="https://imqingstone.github.io/"') && html.includes('qingstone.png'));
  assert.ok(fs.existsSync(path.join(__dirname, '../docs/qingstone.png')));
  assert.ok(html.includes('id="usage"'));
  assert.ok(html.includes('data-goatcounter="https://imqingstone.goatcounter.com/count"'));
  const app = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  assert.ok(app.includes("path: 'rigui-play'") && app.includes('counter/rigui-play.json'));
});

test('畫面提示：行程要全部排進去；心願沒達成時日晷中央會提示', () => {
  assert.strictEqual(D.TEXT.trayHint, '行程要全部排進去；沒排的時辰就是休息。');
  assert.strictEqual(D.TEXT.needMissed, '心願未達成');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  assert.ok(html.includes('id="tray-hint"') && app.includes('D.TEXT.trayHint') && app.includes('D.TEXT.needMissed'));
});

// ---------- 文字 ----------
const textFiles = () => {
  const dir = path.join(__dirname, '../docs');
  return fs.readdirSync(dir).filter(f => /\.(html|js|css)$/.test(f) && f !== 'terms.js').map(f => path.join(dir, f))
    .concat([path.join(__dirname, '../README.md')]);
};

test('文字：避開指定用詞', () => {
  const banned = ['不必', '未必', '值得', '真正', '扛', '溫柔', '看見', '落地', '節奏', '穩穩', '允許自己', '你不需要'];
  textFiles().forEach(f => {
    const t = fs.readFileSync(f, 'utf8');
    banned.forEach(w => assert.ok(!t.includes(w), path.basename(f) + ' 出現「' + w + '」'));
    assert.ok(!/不是[^。！？\n]{0,30}而是/.test(t), path.basename(f) + ' 出現「不是……而是」');
  });
});

test('文字：不出現葷食與五辛（三候是引用的物候原文，只檢查五辛與食物字眼）', () => {
  const animals = ['雞', '鴨', '鵝', '魚', '豬', '牛', '羊', '蝦', '蟹'];
  const always = ['肉', '葷', '海鮮', '蔥', '蒜', '韭', '薤', '興渠'];
  const hou = Object.values(D.TERM_INFO).flatMap(x => x.hou);
  hou.forEach(h => always.forEach(w => assert.ok(!h.includes(w), '三候「' + h + '」出現「' + w + '」')));
  textFiles().forEach(f => {
    let t = fs.readFileSync(f, 'utf8');
    hou.forEach(h => { t = t.split(`'${h}'`).join(''); });
    always.concat(animals).forEach(w => assert.ok(!t.includes(w), path.basename(f) + ' 出現「' + w + '」'));
  });
});

test('文字：不寫療效說法，頁尾有免責說明', () => {
  const bad = ['有益健康', '對身體好', '養生', '治療', '療效', '保健', '改善體質'];
  textFiles().forEach(f => {
    const t = fs.readFileSync(f, 'utf8');
    bad.forEach(w => assert.ok(!t.includes(w), path.basename(f) + ' 出現「' + w + '」'));
  });
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  assert.ok(html.includes('不構成任何醫療或健康建議'));
  assert.ok(html.includes('format-detection'));
  assert.ok(html.includes('© 2026 日晷・古文屬公有領域，</span><span class="seg">其餘內容為原創，未經同意請勿轉載'));
});

console.log(failed ? `✗ ${failed} 項失敗，${passed} 項通過` : `✓ 全部 ${passed} 項通過`);
process.exit(failed ? 1 : 0);
