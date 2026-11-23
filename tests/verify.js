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

test('文字：不出現葷食與五辛', () => {
  const banned = ['肉', '雞', '鴨', '鵝', '魚', '豬', '牛', '羊', '蝦', '蟹', '海鮮', '蔥', '蒜', '韭', '薤', '興渠'];
  textFiles().forEach(f => {
    const t = fs.readFileSync(f, 'utf8');
    banned.forEach(w => assert.ok(!t.includes(w), path.basename(f) + ' 出現「' + w + '」'));
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
