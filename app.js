// ── 데이터 로딩 ──────────────────────────────────────────────
let META = null;
let RL = [null, null, null]; // RL[0]=rl0, RL[1]=rl1, RL[2]=rl2

async function loadGzip(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(buf); writer.close();
  const out = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(value);
  }
  let total = out.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of out) { result.set(c, offset); offset += c.length; }
  return result;
}

async function init() {
  setStatus('데이터 로딩 중...');
  try {
    const [meta, rl0, rl1, rl2] = await Promise.all([
      fetch('meta.json').then(r => r.json()),
      loadGzip('rl0.bin.gz'),
      loadGzip('rl1.bin.gz'),
      loadGzip('rl2.bin.gz'),
    ]);
    META = meta;
    META.pair_idx_map = new Uint32Array(meta.pair_idx_map);
    META.upper_score_flat = meta.upper_score.flat();
    META.lower_score_flat = meta.lower_score.flat();
    RL[0] = rl0; RL[1] = rl1; RL[2] = rl2;
    setStatus('');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('loading').classList.add('hidden');
    updateRecommendation();
  } catch(e) {
    setStatus('로딩 실패: ' + e.message);
  }
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

// ── 상태 ────────────────────────────────────────────────────
const state = {
  dice: [1, 1, 1, 1, 1],   // 주사위 5개 값
  rollsLeft: 2,             // 남은 굴림 횟수
  scorecard: 0xFFF,         // 12비트, 1=남음
  upperSum: 0,              // upper 누적 점수
};

const CAT_NAMES = ['Ones','Twos','Threes','Fours','Fives','Sixes',
                   'Choice','Poker','Full House','Small Straight','Large Straight','Yacht'];
const CAT_NAMES_KO = ['1점(Ones)','2점(Twos)','3점(Threes)','4점(Fours)','5점(Fives)','6점(Sixes)',
                      'Choice','Poker','Full House','Small Straight','Large Straight','Yacht'];

// ── 핵심 조회 ────────────────────────────────────────────────
function getDiceIndex(sorted_dice) {
  const ds = META.dice_states;
  for (let i = 0; i < 252; i++) {
    const d = ds[i];
    if (d[0]===sorted_dice[0]&&d[1]===sorted_dice[1]&&d[2]===sorted_dice[2]&&
        d[3]===sorted_dice[3]&&d[4]===sorted_dice[4]) return i;
  }
  return -1;
}

function getPairIdx(sc, us) {
  const clamped = Math.min(us, 63);
  return META.pair_idx_map[sc * 64 + clamped];
}

function recommend() {
  if (!META) return null;
  const sorted = [...state.dice].sort((a,b)=>a-b);
  const diceIdx = getDiceIndex(sorted);
  if (diceIdx < 0) return null;

  const sc = state.scorecard;
  const us = Math.min(state.upperSum, 63);
  const rl = state.rollsLeft;

  const pairIdx = getPairIdx(sc, us);
  if (pairIdx === 0xFFFFFFFF) return null;

  const tableIdx = pairIdx * 252 + diceIdx;
  const policy = RL[rl < 2 ? rl : 2]; // rl2=index2, rl1=index1, rl0=index0
  // RL[0]=rl0, RL[1]=rl1, RL[2]=rl2
  // rolls_left=2 → RL[2], rolls_left=1 → RL[1], rolls_left=0 → RL[0]
  const action = RL[rl][tableIdx];

  if (rl === 0) {
    // 카테고리 선택
    return { type: 'cat', cat: action, catName: CAT_NAMES_KO[action] };
  } else {
    // keep mask (5비트, sorted dice 기준)
    const mask = action;
    const keep = [], discard = [];
    for (let i = 0; i < 5; i++) {
      if (mask & (1 << i)) keep.push(sorted[i]);
      else discard.push(sorted[i]);
    }
    return { type: 'keep', mask, keep, discard };
  }
}

// ── 점수 계산 ────────────────────────────────────────────────
function calcScore(dice, cat) {
  const cnt = [0,0,0,0,0,0,0];
  let total = 0;
  for (const d of dice) { cnt[d]++; total += d; }
  const maxCnt = Math.max(...cnt);
  if (cat < 6) return cnt[cat+1] * (cat+1);  // Ones~Sixes
  if (cat === 6) return total;                 // Choice
  if (cat === 7) return maxCnt >= 4 ? total : 0; // Poker
  if (cat === 8) {                             // Full House
    if (maxCnt >= 5) return total;
    const vals = cnt.filter(c=>c>0).sort((a,b)=>b-a);
    return (vals[0]===3 && vals[1]===2) ? total : 0;
  }
  if (cat === 9) {                             // Small Straight
    const s = new Set(dice);
    const straights = [[1,2,3,4],[2,3,4,5],[3,4,5,6],[1,2,3,4,5],[2,3,4,5,6]];
    return straights.some(st => st.every(v => s.has(v))) ? 15 : 0;
  }
  if (cat === 10) {                            // Large Straight
    const s = new Set(dice);
    return (s.size===5 && (s.has(1)&&s.has(2)&&s.has(3)&&s.has(4)&&s.has(5) ||
                           s.has(2)&&s.has(3)&&s.has(4)&&s.has(5)&&s.has(6))) ? 30 : 0;
  }
  if (cat === 11) return maxCnt === 5 ? 50 : 0; // Yacht
  return 0;
}

// ── UI 렌더링 ────────────────────────────────────────────────
function renderDice() {
  const container = document.getElementById('dice-container');
  container.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const val = state.dice[i];
    const die = document.createElement('button');
    die.className = 'die';
    die.innerHTML = dieSVG(val);
    die.title = `${val} (클릭하여 변경)`;
    die.addEventListener('click', () => {
      state.dice[i] = (state.dice[i] % 6) + 1;
      renderDice();
      updateRecommendation();
    });
    container.appendChild(die);
  }
}

function dieSVG(n) {
  const dots = {
    1: [[50,50]],
    2: [[25,25],[75,75]],
    3: [[25,25],[50,50],[75,75]],
    4: [[25,25],[75,25],[25,75],[75,75]],
    5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
    6: [[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]],
  }[n];
  const dts = dots.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="7" fill="currentColor"/>`).join('');
  return `<svg viewBox="0 0 100 100" width="56" height="56">${dts}</svg>`;
}

function renderRollsLeft() {
  [0,1,2].forEach(v => {
    const btn = document.getElementById(`rl-${v}`);
    btn.classList.toggle('active', state.rollsLeft === v);
  });
}

function renderScorecard() {
  for (let c = 0; c < 12; c++) {
    const used = !(state.scorecard & (1 << c));
    const cb = document.getElementById(`cat-${c}`);
    if (cb) cb.checked = used;
  }
  document.getElementById('upper-sum').value = state.upperSum;
}

function updateRecommendation() {
  if (!META) return;
  const rec = recommend();
  const box = document.getElementById('recommendation');
  if (!rec) {
    box.innerHTML = '<p class="no-rec">유효하지 않은 상태입니다.</p>';
    return;
  }

  if (rec.type === 'cat') {
    const score = calcScore(state.dice, rec.cat);
    box.innerHTML = `
      <div class="rec-label">기록할 카테고리</div>
      <div class="rec-main">${rec.catName}</div>
      <div class="rec-sub">즉각 점수: <strong>${score}점</strong></div>
    `;
  } else {
    const keepStr = rec.keep.length ? rec.keep.join(', ') : '없음 (전부 굴림)';
    const discardStr = rec.discard.length ? rec.discard.join(', ') : '없음 (전부 유지)';
    box.innerHTML = `
      <div class="rec-label">유지할 주사위</div>
      <div class="rec-main dice-row">${rec.keep.map(d=>`<span class="die-badge keep">${d}</span>`).join('')}${rec.keep.length===0?'<span class="die-badge none">전부 다시 굴림</span>':''}</div>
      <div class="rec-sub">버릴 주사위: ${rec.discard.length ? rec.discard.map(d=>`<span class="die-badge disc">${d}</span>`).join(' ') : '<span>없음</span>'}</div>
    `;
  }
}

// ── 이벤트 바인딩 ────────────────────────────────────────────
function bindEvents() {
  // rolls left 버튼
  [0,1,2].forEach(v => {
    document.getElementById(`rl-${v}`).addEventListener('click', () => {
      state.rollsLeft = v;
      renderRollsLeft();
      updateRecommendation();
    });
  });

  // scorecard 체크박스
  for (let c = 0; c < 12; c++) {
    document.getElementById(`cat-${c}`)?.addEventListener('change', e => {
      if (e.target.checked) state.scorecard &= ~(1 << c);
      else state.scorecard |= (1 << c);
      updateRecommendation();
    });
  }

  // upper sum
  document.getElementById('upper-sum').addEventListener('input', e => {
    state.upperSum = Math.min(63, Math.max(0, parseInt(e.target.value)||0));
    document.getElementById('upper-sum').value = state.upperSum;
    updateRecommendation();
  });

  // 주사위 직접 입력 (숫자 버튼)
  document.getElementById('dice-roll-btn').addEventListener('click', () => {
    state.dice = state.dice.map(() => Math.floor(Math.random()*6)+1);
    renderDice();
    updateRecommendation();
  });
}

// ── 초기화 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderDice();
  renderRollsLeft();
  renderScorecard();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  init();
});
