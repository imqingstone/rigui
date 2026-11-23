// 日晷：畫面。規則都在 engine.js。
(function () {
  const D = RG_DATA, E = RG_ENGINE;
  const SAVE_KEY = 'rigui.save';
  const $ = id => document.getElementById(id);
  const H = D.HOURS;

  const puzzle = D.FIXED; // 里程碑 1：固定一題
  let board = E.newBoard();
  let selected = null;   // 手上選中的卡片編號
  let done = false;      // 是否已定案
  let focus = null;      // 最近點選的時辰

  // ---------- 存檔 ----------
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, puzzle: 'fixed', slots: board.slots, done })); } catch (e) { /* 略過 */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (d && d.v === 1 && d.puzzle === 'fixed' && Array.isArray(d.slots) && d.slots.length === H.length
        && d.slots.every(k => k === null || (Number.isInteger(k) && k >= 0 && k < puzzle.cards.length))
        && new Set(d.slots.filter(k => k !== null)).size === d.slots.filter(k => k !== null).length) {
        board = { slots: d.slots };
        done = !!d.done;
      }
    } catch (e) { /* 讀不到就從頭開始 */ }
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
    $('term').textContent = puzzle.term;
    $('season').textContent = `${se.name}・${se.rule}`;

    const tr = D.TRAVELERS[puzzle.traveler];
    $('traveler').innerHTML = `<span class="avatar" aria-hidden="true">${tr.name[0]}</span><span><span class="who">今天的旅人：${tr.name}</span>`
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
    return `<b>${h.id}時</b>（${h.time} 點）・${h.organ}當值・${h.title}。傳統的說法：${h.suit}。<span class="q">「${h.line}」</span>`;
  }

  function whyText(cell) {
    const h = H[D.HOURS.findIndex(x => x.id === cell.hour)];
    const se = D.SEASONS[puzzle.season];
    const seasonNote = cell.mod ? se.note : '';
    if (!cell.cardId) {
      if (cell.points >= 3) return { text: `休息。${h.suit}。${seasonNote}`, tone: '' };
      if (cell.points === 2) return { text: `休息。${h.suit}。${seasonNote}`, tone: '' };
      if (cell.points === 1) return { text: `空著沒排事。${h.suit}。`, tone: '' };
      return { text: `還在睡。${seasonNote}`, tone: 'bad' };
    }
    const name = D.CARDS[cell.cardId].name;
    if (cell.kind === 'good') return { text: `${name}正合時：${h.suit}。`, tone: '' };
    if (cell.kind === 'neutral') return { text: `${name}放在這裡還可以。${seasonNote || `傳統的說法：${h.suit}。`}`, tone: '' };
    return { text: `${name}不太合時。${seasonNote || `傳統的說法：${h.suit}。`}`, tone: 'bad' };
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
      return `<li><span class="ic" aria-label="${c.points} 分">${D.ICONS[c.points]}</span>`
        + `<span class="hd"><b>${h.id}時</b><small>${h.time} 點・${h.organ}・${h.title}</small></span>`
        + `<span class="why ${w.tone}">${w.text}</span><span class="q">「${h.line}」</span></li>`;
    }).join('');
    $('r-source').textContent = D.TEXT.lineSource;
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
  load();
  $('btn-done').addEventListener('click', onDone);
  $('btn-clear').addEventListener('click', onClear);
  $('btn-again').addEventListener('click', onAgain);
  $('info').textContent = done ? '點日晷上的時辰可以看說明。' : '先點一張行程，再點日晷上的時辰。點已經排好的時辰，可以把行程收回來。';
  render();
})();
