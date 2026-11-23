// 日晷：畫面。規則都在 engine.js。
(function () {
  const D = RG_DATA, E = RG_ENGINE;
  const SAVE_KEY = 'rigui.save';
  const $ = id => document.getElementById(id);
  const H = D.HOURS;

  let today = E.taiwanDate(Date.now());
  let mode = 'daily';    // daily：今日一題；practice：練習
  let puzzle = null;
  let board = E.newBoard();
  let selected = null;   // 手上選中的卡片編號
  let done = false;      // 是否已定案
  let focus = null;      // 最近點選的時辰

  // ---------- 存檔 ----------
  // { v:2, daily:{date,slots,done}, practice:{seed,date,slots,done}, history:{日期:{total,rank,share,needOk}} }
  //   terms:{節氣:第一次收錄的日期}、travelers:{旅人:第一次遇見的日期}
  let store = { v: 2, daily: null, practice: null, history: {}, terms: {}, travelers: {} };
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  // 檢查讀進來的進度；格式不對就回傳 null
  function cleanStore(d) {
    if (!isObj(d) || d.v !== 2 || !isObj(d.history)) return null;
    const history = {};
    Object.entries(d.history).forEach(([k, r]) => {
      if (isDate(k) && isObj(r) && Number.isInteger(r.total) && r.total >= 0 && r.total <= 36 && typeof r.rank === 'string' && typeof r.share === 'string') history[k] = r;
    });
    const pick = (o, ok) => { const out = {}; if (isObj(o)) Object.entries(o).forEach(([k, v]) => { if (ok(k) && isDate(v)) out[k] = v; }); return out; };
    return {
      v: 2, history,
      daily: isObj(d.daily) ? d.daily : null,
      practice: isObj(d.practice) ? d.practice : null,
      terms: pick(d.terms, k => !!D.TERM_INFO[k]),
      travelers: pick(d.travelers, k => !!D.TRAVELERS[k])
    };
  }
  function readStore() {
    try { const d = cleanStore(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); if (d) store = d; } catch (e) { /* 讀不到就從頭開始 */ }
  }
  function save() {
    const cur = { date: puzzle.date, slots: board.slots, done };
    if (mode === 'daily') store.daily = cur;
    else store.practice = Object.assign(cur, { seed: puzzle.seed });
    // 紀錄只留最近一年多
    const keys = Object.keys(store.history).sort();
    while (keys.length > 400) delete store.history[keys.shift()];
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (e) { /* 略過 */ }
  }
  function validSlots(slots, p) {
    return Array.isArray(slots) && slots.length === H.length
      && slots.every(k => k === null || (Number.isInteger(k) && k >= 0 && k < p.cards.length))
      && new Set(slots.filter(k => k !== null)).size === slots.filter(k => k !== null).length;
  }
  function newPracticeSeed() {
    try { return 'practice:' + crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return 'practice:' + Date.now(); }
  }
  // 載入一題：今日一題用台灣日期；練習用自己的種子
  function open(m, fresh) {
    mode = m;
    selected = null; focus = null; done = false; board = E.newBoard();
    if (m === 'daily') {
      puzzle = E.makePuzzle(today);
      const s = store.daily;
      if (s && s.date === today && validSlots(s.slots, puzzle)) { board = { slots: s.slots }; done = !!s.done; }
    } else {
      const s = !fresh && store.practice;
      const seed = s && s.seed ? s.seed : newPracticeSeed();
      const r = E.rng(E.hash(seed));
      const T = D.DAILY.travelers;
      puzzle = E.makePuzzle(today, { seed, traveler: T[Math.floor(r() * T.length)] });
      puzzle.seed = seed;
      if (s && s.seed === seed && validSlots(s.slots, puzzle)) { board = { slots: s.slots }; done = !!s.done; }
    }
    save();
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.textContent = ''; }, 2400);
  }
  const cardName = k => D.CARDS[puzzle.cards[k]].name;
  const angleOf = i => 180 + i * 30; // 子在下方，順時針經過卯（左）、午（上）、酉（右）

  // ---------- 日晷圓盤 ----------
  function buildFace() {
    const svg = $('face');
    const cx = 200, cy = 200, R = 196, r = 70;
    const pt = (deg, rad) => [cx + rad * Math.sin(deg * Math.PI / 180), cy - rad * Math.cos(deg * Math.PI / 180)];
    // 夜晚的範圍依當天的日出日落畫（render 時更新）
    let html = `<circle class="ring" cx="${cx}" cy="${cy}" r="${R}"/><path class="night" id="night-arc" d=""/>`
      + '<line class="sunmark" id="mark-rise"/><line class="sunmark" id="mark-set"/>';
    H.forEach((h, i) => {
      const [x1, y1] = pt(angleOf(i) + 15, r), [x2, y2] = pt(angleOf(i) + 15, R);
      html += `<line class="tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    });
    html += `<circle class="inner" cx="${cx}" cy="${cy}" r="${r}"/>`;
    svg.innerHTML = html;

    const dial = $('dial');
    H.forEach((h, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.dataset.i = i;
      const deg = angleOf(i) * Math.PI / 180, rr = 36.5;
      b.style.left = (50 + rr * Math.sin(deg)) + '%';
      b.style.top = (50 - rr * Math.cos(deg)) + '%';
      b.addEventListener('click', () => onSlot(i));
      dial.appendChild(b);
    });
  }

  // 時刻（小時）對應圓盤角度：0 點在下方，12 點在上方
  const angleAt = t => 180 + t * 15;
  function drawNight(date) {
    const cx = 200, cy = 200, R = 196, r = 70;
    const pt = (deg, rad) => [cx + rad * Math.sin(deg * Math.PI / 180), cy - rad * Math.cos(deg * Math.PI / 180)];
    const { rise, set } = E.sunTimes(date);
    const a = angleAt(set), b = angleAt(rise + 24); // 從日落順時針到隔天日出
    const big = b - a > 180 ? 1 : 0;
    const [x1, y1] = pt(a, R), [x2, y2] = pt(b, R), [x3, y3] = pt(b, r), [x4, y4] = pt(a, r);
    $('night-arc').setAttribute('d', `M${x1},${y1} A${R},${R} 0 ${big} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${big} 0 ${x4},${y4} Z`);
    [['mark-rise', angleAt(rise)], ['mark-set', angleAt(set)]].forEach(([id, deg]) => {
      const [p1, q1] = pt(deg, r), [p2, q2] = pt(deg, R);
      const el = $(id);
      el.setAttribute('x1', p1); el.setAttribute('y1', q1); el.setAttribute('x2', p2); el.setAttribute('y2', q2);
    });
    const f = h => `${Math.floor(h)}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}`;
    $('sun').textContent = `${D.SUN.place} 日出 ${f(rise)}・日落 ${f(set)}（深色是夜晚）`;
  }

  // ---------- 繪製 ----------
  function render() {
    const ev = E.evaluate(puzzle, board);
    const se = D.SEASONS[puzzle.season];
    drawNight(puzzle.date);
    const [y, m, d] = puzzle.date.split('-').map(Number);
    $('date').textContent = `${m}/${d}`;
    $('tab-daily').setAttribute('aria-pressed', String(mode === 'daily'));
    $('tab-practice').setAttribute('aria-pressed', String(mode === 'practice'));
    const rec = store.history[today];
    $('mode-note').textContent = mode === 'daily'
      ? (rec ? `今天已經定案過了：${rec.total}/36「${rec.rank}」。可以再排看看，紀錄以第一次為準。` : '每天一題，所有人同一題。第一次定案的結果會記下來。')
      : '練習隨機出題，不計入紀錄。';
    $('term').textContent = puzzle.term;
    $('season').textContent = `${se.name}・${se.rule}`;

    const tr = D.TRAVELERS[puzzle.traveler];
    $('traveler').innerHTML = `<span class="avatar" aria-hidden="true">${tr.name[0]}</span><span><span class="who">${mode === 'daily' ? '今天的旅人' : '練習的旅人'}：${tr.name}</span>`
      + `<span class="line">「${tr.line}」</span>${tr.need ? `<span class="need">心願：${tr.need.text}</span>` : ''}</span>`;

    document.querySelectorAll('.slot').forEach(b => {
      const i = +b.dataset.i, h = H[i], k = board.slots[i];
      const cell = ev.cells[i];
      b.classList.toggle('night', E.isDark(puzzle.date, i));
      b.classList.toggle('filled', k !== null);
      b.classList.toggle('target', selected !== null && !done);
      b.classList.toggle('picked', focus === i && !done);
      b.classList.toggle('lit', done && cell.points === 3);
      b.classList.toggle('dim', done && cell.points === 0);
      b.innerHTML = `<span class="h">${h.id}</span><span class="t">${h.time}</span><span class="c">${k !== null ? cardName(k) : h.organ}</span>`;
      b.setAttribute('aria-label', `${h.id}時，${h.time} 點，${h.organ}當值，${k !== null ? '已放：' + cardName(k) : '空著'}${done ? `，${cell.points} 分` : ''}`);
    });

    const left = E.tray(board, puzzle);
    const tray = $('tray');
    tray.innerHTML = '';
    if (!left.length) tray.innerHTML = '<span class="empty">行程都排好了，可以定案了。</span>';
    left.forEach(k => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card' + (selected === k ? ' sel' : '');
      b.textContent = cardName(k);
      b.setAttribute('aria-pressed', String(selected === k));
      b.addEventListener('click', () => onCard(k));
      tray.appendChild(b);
    });
    $('btn-skip').hidden = mode !== 'practice';
    $('btn-done').disabled = !ev.allPlaced;
    $('btn-done').textContent = ev.allPlaced ? '定案' : `還有 ${left.length} 張`;

    const ct = $('center-text');
    if (done) ct.innerHTML = `<b>${ev.total}</b>${ev.rank}`;
    else if (selected !== null) ct.innerHTML = `把「${cardName(selected)}」<br>放到哪個時辰？`;
    else ct.innerHTML = `已排 ${puzzle.cards.length - left.length}／${puzzle.cards.length}`;
    $('gnomon').style.setProperty('--deg', (focus === null ? 0 : angleOf(focus) + 180) + 'deg');

    $('tray-wrap').hidden = done;
    $('result').hidden = !done;
    if (done) renderResult(ev);
  }

  function hourInfo(i) {
    const h = H[i];
    return `<b>${h.id}時</b>（${h.time} 點）・${h.organ}當值・${h.title}。傳統的說法：${E.suitFor(puzzle, h.id)}。<span class="q">「${h.line}」</span>`;
  }

  function whyText(cell) {
    const h = H[D.HOURS.findIndex(x => x.id === cell.hour)];
    const suit = E.suitFor(puzzle, cell.hour);
    const se = D.SEASONS[puzzle.season];
    // 季節造成的調整，只說這個時辰自己的事；說明本身已依季節改寫時就不再重複
    const seasonal = !!(h.bySeason && h.bySeason[puzzle.season]);
    const seasonNote = cell.mod && !seasonal ? (se.notes[cell.hour] || '') : '';
    if (!cell.cardId) {
      if (cell.points >= 3) return { text: `休息。${suit}。${seasonNote}`, tone: '' };
      if (cell.points === 2) return { text: `休息。${suit}。${seasonNote}`, tone: '' };
      if (cell.points === 1) return { text: `空著沒排事。${suit}。`, tone: '' };
      return { text: `還在睡。${seasonNote}`, tone: 'bad' };
    }
    const name = D.CARDS[cell.cardId].name;
    if (cell.kind === 'good') return { text: `${name}正合時：${suit}。`, tone: '' };
    if (cell.kind === 'neutral') return { text: `${name}放在這裡還可以。${seasonNote || `傳統的說法：${suit}。`}`, tone: '' };
    return { text: `${name}不太合時。${seasonNote || `傳統的說法：${suit}。`}`, tone: 'bad' };
  }

  function renderResult(ev) {
    $('r-rank').textContent = ev.rank;
    $('r-total').textContent = ev.total;
    $('r-max').textContent = ev.max;
    const need = $('r-need');
    need.hidden = !ev.need;
    if (ev.need) {
      need.className = 'need ' + (ev.need.ok ? 'ok' : 'no');
      need.textContent = `旅人的心願「${ev.need.text}」${ev.need.ok ? '達成了。' : `沒有達成，評等最高只到「${D.RANKS[1].name}」。`}`;
    }
    $('r-cells').innerHTML = ev.cells.map((c, i) => {
      const h = H[i], w = whyText(c);
      return `<li><span class="ic" aria-label="${c.points} 分">${E.iconFor(puzzle, c)}</span>`
        + `<span class="hd"><b>${h.id}時</b><small>${h.time} 點・${h.organ}・${h.title}</small></span>`
        + `<span class="why ${w.tone}">${w.text}</span><span class="q">「${h.line}」</span></li>`;
    }).join('');
    $('r-source').textContent = D.TEXT.lineSource;
    // 今日一題：分享與紀錄以第一次定案為準；練習：分享這一次
    const rec = mode === 'daily' ? store.history[today] : null;
    const recEl = $('r-record');
    recEl.hidden = !rec;
    if (rec) recEl.textContent = rec.total === ev.total && rec.rank === ev.rank
      ? '這是今天的紀錄（第一次定案）。'
      : `今天的紀錄是第一次定案的 ${rec.total}/36「${rec.rank}」，這次重排不影響紀錄。`;
    $('share-text').value = rec ? rec.share : E.shareText(puzzle, ev);
    $('btn-next').hidden = mode !== 'practice';
  }
  function onCopy() {
    const ta = $('share-text');
    const fallback = () => { ta.focus(); ta.select(); toast('已選取文字，請長按或按複製'); };
    try {
      navigator.clipboard.writeText(ta.value).then(() => toast('已複製，可以貼到社群了'), fallback);
    } catch (e) { fallback(); }
  }

  // ---------- 操作 ----------
  function onCard(k) {
    if (done) return;
    selected = selected === k ? null : k;
    $('info').textContent = selected === null ? '先點一張行程，再點日晷上的時辰。' : `${cardName(k)}：${D.CARDS[puzzle.cards[k]].desc}`;
    render();
  }
  function onSlot(i) {
    focus = i;
    if (done) { $('info').innerHTML = hourInfo(i); render(); return; }
    if (selected !== null) {
      board = E.place(board, selected, i);
      $('info').innerHTML = `「${cardName(selected)}」放進了${H[i].id}時。` + `<span class="q">${H[i].organ}當值・「${H[i].line}」</span>`;
      selected = null;
      save();
    } else if (board.slots[i] !== null) {
      const k = board.slots[i];
      board = E.remove(board, i);
      selected = k;
      $('info').textContent = `收回了「${cardName(k)}」，再點一個時辰就能放進去。`;
      save();
    } else {
      $('info').innerHTML = hourInfo(i);
    }
    render();
  }
  function onDone() {
    const ev = E.evaluate(puzzle, board);
    if (!ev.allPlaced) { toast('還有行程沒排進去'); return; }
    done = true;
    selected = null;
    focus = null;
    if (mode === 'daily' && !store.history[today]) {
      store.history[today] = { total: ev.total, rank: ev.rank, needOk: ev.need ? ev.need.ok : true, share: E.shareText(puzzle, ev) };
    }
    // 只有今日一題會收藏；練習不計入紀錄
    const fresh = [];
    if (mode === 'daily' && !store.terms[puzzle.term]) { store.terms[puzzle.term] = puzzle.date; fresh.push(`節氣「${puzzle.term}」`); }
    if (mode === 'daily' && !store.travelers[puzzle.traveler]) { store.travelers[puzzle.traveler] = puzzle.date; fresh.push(`旅人「${D.TRAVELERS[puzzle.traveler].name}」`); }
    save();
    if (fresh.length) setTimeout(() => toast(`收藏了${fresh.join('、')}`), 400);
    countPlay();
    $('info').textContent = '亮起來的時辰排得順，暗下來的不太合時。點日晷上的時辰可以看說明。';
    render();
    $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function onClear() {
    board = E.newBoard();
    selected = null;
    save();
    $('info').textContent = '行程都收回來了。先點一張行程，再點日晷上的時辰。';
    render();
  }
  function onAgain() {
    done = false;
    save();
    $('info').textContent = '可以再調整看看，排好了再定案一次。';
    render();
    window.scrollTo(0, 0);
  }

  // ---------- 收藏 ----------
  let view = 'game';
  function setView(v) {
    view = v;
    $('game-view').hidden = v !== 'game';
    $('collect-view').hidden = v !== 'collect';
    $('help-view').hidden = v !== 'help';
    $('mode-note').hidden = v !== 'game';
    $('tab-collect').setAttribute('aria-pressed', String(v === 'collect'));
    $('tab-help').setAttribute('aria-pressed', String(v === 'help'));
    if (v !== 'game') {
      $('tab-daily').setAttribute('aria-pressed', 'false');
      $('tab-practice').setAttribute('aria-pressed', 'false');
      if (v === 'collect') renderCollect(); else renderHelp();
    } else render();
  }
  const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
  const TERM_ORDER = Object.keys(D.TERM_SEASON); // 立春到大寒
  const md = d => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}`; };

  function drawGarden(have) {
    const on = id => have.some(g => g.id === id);
    let h = '<rect class="g-sky" x="0" y="0" width="360" height="190"/>'
      + '<path class="g-hill" d="M0,112 C60,92 120,104 180,96 C240,88 300,102 360,92 L360,190 L0,190 Z"/>'
      + '<ellipse class="g-ground" cx="180" cy="160" rx="170" ry="26"/>';
    if (on('moon')) h += '<circle class="g-moon" cx="318" cy="34" r="16"/>';
    if (on('pavilion')) h += '<path class="g-ink" d="M22,124 L22,92 M70,124 L70,92 M14,94 L46,72 L78,94 Z"/><path class="g-roof" d="M14,94 L46,72 L78,94 Z"/>';
    if (on('fence')) { for (let x = 92; x <= 268; x += 11) h += `<line class="g-bamboo" x1="${x}" y1="138" x2="${x}" y2="112"/>`; h += '<line class="g-bamboo" x1="88" y1="120" x2="272" y2="120"/><line class="g-bamboo" x1="88" y1="131" x2="272" y2="131"/>'; }
    if (on('tree')) h += '<path class="g-trunk" d="M300,152 L304,104 L312,104 L316,152 Z"/><circle class="g-leaf" cx="296" cy="92" r="22"/><circle class="g-leaf" cx="322" cy="88" r="20"/><circle class="g-leaf" cx="309" cy="70" r="20"/>';
    if (on('sapling')) h += '<line class="g-trunk-l" x1="62" y1="158" x2="62" y2="128"/><circle class="g-leaf" cx="56" cy="124" r="9"/><circle class="g-leaf" cx="68" cy="120" r="9"/>';
    if (on('flowers')) [[96, 168], [108, 172], [120, 167], [132, 172]].forEach(([x, y]) => { h += `<line class="g-stem" x1="${x}" y1="${y}" x2="${x}" y2="${y - 12}"/><circle class="g-flower" cx="${x}" cy="${y - 14}" r="4"/>`; });
    if (on('bench')) h += '<rect class="g-stone" x="214" y="150" width="40" height="8" rx="2"/><rect class="g-stone" x="218" y="158" width="6" height="10"/><rect class="g-stone" x="244" y="158" width="6" height="10"/>';
    if (on('lamp')) h += '<line class="g-ink" x1="272" y1="170" x2="272" y2="132"/><rect class="g-lantern" x="265" y="118" width="14" height="16" rx="5"/>';
    if (on('dial')) h += '<rect class="g-stone" x="172" y="138" width="16" height="26"/><ellipse class="g-dial" cx="180" cy="136" rx="26" ry="8"/><line class="g-ink" x1="180" y1="136" x2="194" y2="128"/>';
    $('garden').innerHTML = h;
  }

  function renderCollect() {
    const dates = Object.keys(store.history);
    const st = E.streakInfo(dates, today);
    const g = E.garden(st.best);
    drawGarden(g.have);
    $('garden-desc').textContent = (dates.length
      ? `連續 ${st.current} 天，最長 ${st.best} 天。庭院裡有：${g.have.map(x => x.name).join('、')}。`
      : '庭院還空著。玩今日一題，連續的天數越多，庭院就會長出越多東西。')
      + (g.next ? `連續 ${g.next.at} 天會長出「${g.next.name}」。` : '庭院已經長齊了。') + '中斷了也不會清空，只是暫停成長。';

    const got = store.terms;
    $('term-count').textContent = `${Object.keys(got).length}／24`;
    $('term-grid').innerHTML = TERM_ORDER.map(name => {
      const se = D.SEASONS[D.TERM_SEASON[name]];
      return got[name]
        ? `<button type="button" class="tile s-${D.TERM_SEASON[name]}" data-term="${name}"><b>${name}</b><small>${se.name}</small></button>`
        : `<button type="button" class="tile locked" data-term="${name}" aria-label="還沒收錄"><b>？</b><small>${se.name}</small></button>`;
    }).join('');
    $('hou-source').textContent = D.HOU_SOURCE;

    $('trav-count').textContent = `${Object.keys(store.travelers).length}／${D.DAILY.travelers.length}`;
    $('trav-grid').innerHTML = D.DAILY.travelers.map(id => store.travelers[id]
      ? `<button type="button" class="tile" data-trav="${id}"><span class="avatar">${D.TRAVELERS[id].name[0]}</span><b>${D.TRAVELERS[id].name}</b></button>`
      : `<button type="button" class="tile locked" data-trav="${id}" aria-label="還沒遇見"><span class="avatar">？</span><b>還沒遇見</b></button>`).join('');
  }
  function showTerm(name) {
    const el = $('term-detail');
    const when = store.terms[name];
    if (!when) { el.hidden = false; el.innerHTML = `<p class="muted">這個節氣還沒收錄。在${name}期間排過一天就會收錄。</p>`; return; }
    const info = D.TERM_INFO[name], r = E.termRange(when);
    el.hidden = false;
    el.innerHTML = `<h3>${name}<small>${md(r.start)}–${md(r.end)}</small></h3><p>${info.intro}</p>`
      + `<ol class="hou">${info.hou.map((x, i) => `<li><span>${['初候', '二候', '三候'][i]}</span>${x}</li>`).join('')}</ol>`
      + `<p class="muted">第一次收錄：${when}</p>`;
  }
  function showTraveler(id) {
    const el = $('trav-detail');
    const t = D.TRAVELERS[id], when = store.travelers[id];
    el.hidden = false;
    el.innerHTML = when
      ? `<h3>${t.name}</h3><p>${t.bio}</p>${t.need ? `<p class="muted">心願：${t.need.text}</p>` : ''}<p class="muted">第一次遇見：${when}</p>`
      : '<p class="muted">還沒遇見這位旅人。每天會有不同的旅人來到驛站。</p>';
  }

  // ---------- 說明 ----------
  function renderHelp() {
    const P = D.POINTS, rk = D.RANKS;
    const rest = H.map(h => `${h.id} ${D.REST[h.id]}`).join('、');
    const seasons = ['spring', 'summer', 'autumn', 'winter'].map(k => { const se = D.SEASONS[k]; return `<li><b>${se.name}・${se.rule}</b>：${se.note}</li>`; }).join('');
    const hours = H.map(h => `<tr><th scope="row">${h.id}</th><td>${h.time}</td><td>${h.organ}</td><td>${h.title}</td></tr>`).join('');
    $('help-view').innerHTML = `
      <section class="box"><h2>怎麼玩</h2><ol class="steps">
        <li>每天有一位旅人來到驛站，帶著幾件要做的事。</li>
        <li>先點下方的一張行程，再點日晷上的一個時辰，就排進去了。點已經排好的時辰，可以把行程收回來。</li>
        <li>沒排行程的時辰算是休息。全部行程都排好後，按「定案」看結果。</li>
        <li>「今日一題」所有人同一題，一天只記第一次定案的成績；「練習」隨機出題，不計入紀錄。</li></ol></section>
      <section class="box"><h2>計分</h2><ul class="rules">
        <li>放在適合的時辰 ${P.good} 分，值班的官會亮起來；中性 ${P.neutral} 分；不適合 ${P.bad} 分，會暗下來。</li>
        <li>空著休息依時辰給分：${rest}。「安睡」至少跟休息一樣分數。</li>
        <li>夜裡休息拿滿分是月亮 ${D.ICONS.moon}，白天排得好是太陽 ${D.ICONS[3]}。</li>
        <li>旅人的心願沒有達成，評等最高只到「${rk[1].name}」。</li>
        <li>評等：${rk.slice(0, -1).map(r => `${r.min} 分以上「${r.name}」`).join('、')}，其餘「${rk[rk.length - 1].name}」。滿分 36。</li></ul>
        <h3>四季作息</h3><ul class="rules">${seasons}</ul></section>
      <section class="box"><h2>十二時辰與值班的官</h2>
        <div class="table-wrap"><table class="hours"><thead><tr><th>時辰</th><th>時間</th><th>當值</th><th>官名</th></tr></thead><tbody>${hours}</tbody></table></div></section>
      <section class="box"><h2>出處</h2><ul class="sources">
        ${D.SOURCES.map(s => `<li><a href="${encodeURI(s.url)}" target="_blank" rel="noopener">${s.title}</a><span>${s.use}</span></li>`).join('')}</ul>
        <ul class="notes">${D.NOTES.map(n => `<li>${n}</li>`).join('')}</ul>
        <p class="hint">${D.TEXT.disclaimer}</p></section>`;
  }

  // ---------- 使用次數（GoatCounter 公開計數，只取得總數） ----------
  function countPlay() {
    try { const gc = window.goatcounter; if (gc && gc.count) gc.count({ path: 'rigui-play', title: '日晷定案', event: true, no_session: true }); } catch (e) { /* 略過 */ }
  }
  try {
    fetch('https://imqingstone.goatcounter.com/counter/rigui-play.json').then(r => (r.ok ? r.json() : null))
      .then(d => { const el = $('usage'); if (el && d && d.count) { el.textContent = `已有 ${d.count} 位旅人排過一天`; el.hidden = false; } })
      .catch(() => {});
  } catch (e) { /* 略過 */ }

  // ---------- 進度備份 ----------
  function exportSave() {
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const blob = new Blob([JSON.stringify({ app: 'rigui', v: 2, savedAt: d.toISOString(), data: store }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `日晷進度-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('已匯出進度');
  }
  let pendingImport = null;
  function readImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        const clean = d && d.app === 'rigui' ? cleanStore(d.data) : null;
        if (!clean) throw new Error('bad');
        pendingImport = clean;
        $('import-confirm').hidden = false;
      } catch (e) { toast('這個檔案不是日晷的進度備份'); }
    };
    reader.onerror = () => toast('讀取檔案失敗');
    reader.readAsText(file);
  }

  buildFace();
  readStore();
  open('daily');
  $('tab-daily').addEventListener('click', () => { if (view !== 'game') { view = 'game'; setView('game'); } if (mode !== 'daily') { open('daily'); $('info').textContent = '今天的題目。先點一張行程，再點日晷上的時辰。'; render(); } });
  $('tab-practice').addEventListener('click', () => { if (view !== 'game') { view = 'game'; setView('game'); } if (mode !== 'practice') { open('practice'); $('info').textContent = '練習題，不計入紀錄。先點一張行程，再點日晷上的時辰。'; render(); } });
  const nextPractice = () => { open('practice', true); $('info').textContent = '換了一題新的練習。'; render(); window.scrollTo(0, 0); };
  $('btn-next').addEventListener('click', nextPractice);
  $('btn-skip').addEventListener('click', nextPractice);
  $('btn-copy').addEventListener('click', onCopy);
  $('tab-collect').addEventListener('click', () => setView('collect'));
  $('tab-help').addEventListener('click', () => setView('help'));
  $('term-grid').addEventListener('click', ev => { const b = ev.target.closest('[data-term]'); if (b) showTerm(b.dataset.term); });
  $('trav-grid').addEventListener('click', ev => { const b = ev.target.closest('[data-trav]'); if (b) showTraveler(b.dataset.trav); });
  $('btn-export').addEventListener('click', exportSave);
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', ev => { const f = ev.target.files[0]; if (f) readImport(f); ev.target.value = ''; });
  $('btn-import-no').addEventListener('click', () => { pendingImport = null; $('import-confirm').hidden = true; });
  $('btn-import-yes').addEventListener('click', () => {
    if (!pendingImport) return;
    store = pendingImport; pendingImport = null;
    $('import-confirm').hidden = true;
    open(mode);
    toast('已匯入進度');
    renderCollect();
  });
  // 跨過午夜時換成新的一天
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const now = E.taiwanDate(Date.now());
    if (now !== today) { today = now; if (mode === 'daily') { open('daily'); $('info').textContent = '新的一天，有新的旅人來了。'; render(); } }
  });
  $('btn-done').addEventListener('click', onDone);
  $('btn-clear').addEventListener('click', onClear);
  $('btn-again').addEventListener('click', onAgain);
  $('info').textContent = done ? '點日晷上的時辰可以看說明。' : '先點一張行程，再點日晷上的時辰。點已經排好的時辰，可以把行程收回來。';
  render();
})();
