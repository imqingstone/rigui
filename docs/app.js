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
  let store = { v: 2, daily: null, practice: null, history: {} };
  function readStore() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (d && d.v === 2 && typeof d.history === 'object' && d.history) store = { v: 2, daily: d.daily || null, practice: d.practice || null, history: d.history };
    } catch (e) { /* 讀不到就從頭開始 */ }
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
    let html = `<circle class="ring" cx="${cx}" cy="${cy}" r="${R}"/>`;
    H.forEach((h, i) => {
      if (!D.NIGHT.includes(h.id)) return;
      const a = angleOf(i) - 15, b = angleOf(i) + 15;
      const [x1, y1] = pt(a, R), [x2, y2] = pt(b, R), [x3, y3] = pt(b, r), [x4, y4] = pt(a, r);
      html += `<path class="night" d="M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 0 0 ${x4},${y4} Z"/>`;
    });
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
      b.className = 'slot' + (D.NIGHT.includes(h.id) ? ' night' : '');
      b.dataset.i = i;
      const deg = angleOf(i) * Math.PI / 180, rr = 36.5;
      b.style.left = (50 + rr * Math.sin(deg)) + '%';
      b.style.top = (50 - rr * Math.cos(deg)) + '%';
      b.addEventListener('click', () => onSlot(i));
      dial.appendChild(b);
    });
  }

  // ---------- 繪製 ----------
  function render() {
    const ev = E.evaluate(puzzle, board);
    const se = D.SEASONS[puzzle.season];
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
    save();
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

  buildFace();
  readStore();
  open('daily');
  $('tab-daily').addEventListener('click', () => { if (mode !== 'daily') { open('daily'); $('info').textContent = '今天的題目。先點一張行程，再點日晷上的時辰。'; render(); } });
  $('tab-practice').addEventListener('click', () => { if (mode !== 'practice') { open('practice'); $('info').textContent = '練習題，不計入紀錄。先點一張行程，再點日晷上的時辰。'; render(); } });
  $('btn-next').addEventListener('click', () => { open('practice', true); $('info').textContent = '換了一題新的練習。'; render(); window.scrollTo(0, 0); });
  $('btn-copy').addEventListener('click', onCopy);
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
