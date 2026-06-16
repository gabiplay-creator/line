/**
 * app.js — 인테리어 견적 계산기 메인 로직
 *
 * 주요 기능:
 *  - 카테고리 탭 렌더링
 *  - 항목 선택 / 수량 조정
 *  - 평수 변경 시 pyAuto 항목 수량 자동 업데이트
 *  - pct(%) 항목은 나머지 합계 기준으로 후처리 계산
 *  - 견적 요약 (소계 / VAT / 합계 / 평당 단가)
 */

/* ── 상태 ── */
const sel = {};   // { [id]: { on: boolean, q: number } }
Object.values(DATA).forEach(cat =>
  cat.items.forEach(it => { sel[it.id] = { on: false, q: 0 }; })
);

let curCat = Object.keys(DATA)[0];

/* ── 초기화 ── */
document.addEventListener('DOMContentLoaded', () => {
  renderTabs();
  renderItems();
  calc();

  document.getElementById('pyung').addEventListener('input', onPyungChange);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
});

/* ── 평수 변경 핸들러 ── */
function onPyungChange() {
  const py = getPyung();
  Object.values(DATA).forEach(cat =>
    cat.items.forEach(it => {
      if (it.pyAuto && sel[it.id].on) {
        sel[it.id].q = Math.max(1, Math.round(py));
      }
    })
  );
  renderItems();
  calc();
}

/* ── 유틸 ── */
function getPyung() {
  return parseFloat(document.getElementById('pyung').value) || 0;
}

function findItem(id) {
  for (const cat of Object.values(DATA))
    for (const it of cat.items)
      if (it.id === id) return it;
  return null;
}

function fmt(n) {
  return Math.round(n).toLocaleString('ko-KR');
}

/* ── 탭 렌더링 ── */
function renderTabs() {
  document.getElementById('tabs').innerHTML = Object.keys(DATA)
    .map(cat => `<div class="tab${cat === curCat ? ' on' : ''}" data-cat="${cat}">${cat}</div>`)
    .join('');

  document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => {
      curCat = el.dataset.cat;
      renderTabs();
      renderItems();
    });
  });
}

/* ── 항목 렌더링 ── */
function renderItems() {
  const catData = DATA[curCat];
  const html = catData.items.map(it => {
    const s = sel[it.id];
    const pyTag = it.pyAuto ? `<span class="pytag">평수연동</span>` : '';
    let priceLabel;
    if (it.pct) {
      priceLabel = `공사금 ${(it.pct * 100).toFixed(0)}% 자동`;
    } else {
      priceLabel = `${fmt(it.p)}원/${it.u}`;
    }

    const qtyHtml = s.on ? `
      <div class="qty-row" onclick="event.stopPropagation()">
        <button class="qbtn" data-id="${it.id}" data-d="-1">−</button>
        <input class="qinput" type="number" value="${s.q}" min="0" max="9999" data-id="${it.id}">
        <button class="qbtn" data-id="${it.id}" data-d="1">+</button>
        <span class="iunit">${it.u}</span>
      </div>` : '';

    return `
      <div class="item${s.on ? ' sel' : ''}" data-id="${it.id}">
        <div class="chk">${s.on ? '✓' : ''}</div>
        <div class="iinfo">
          <div class="iname">${it.n}${pyTag}</div>
          <div class="idesc">${it.d}</div>
        </div>
        <div class="iright">
          <div class="iprice">${priceLabel}</div>
          ${qtyHtml}
        </div>
      </div>`;
  }).join('');

  document.getElementById('content').innerHTML = `<div class="items">${html}</div>`;

  /* 이벤트 위임 */
  document.getElementById('content').addEventListener('click', onItemClick);
  document.querySelectorAll('.qbtn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      adj(btn.dataset.id, parseInt(btn.dataset.d));
    });
  });
  document.querySelectorAll('.qinput').forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('input', e => {
      e.stopPropagation();
      setQ(input.dataset.id, input.value);
    });
  });
}

function onItemClick(e) {
  const itemEl = e.target.closest('.item');
  if (!itemEl) return;
  // qty-row 클릭은 무시
  if (e.target.closest('.qty-row')) return;
  tog(itemEl.dataset.id);
}

/* ── 항목 토글 ── */
function tog(id) {
  const s = sel[id];
  s.on = !s.on;
  if (s.on) {
    const it = findItem(id);
    s.q = (it && it.pyAuto) ? Math.max(1, Math.round(getPyung())) : 1;
  } else {
    s.q = 0;
  }
  renderItems();
  calc();
}

function adj(id, d) {
  const s = sel[id];
  s.q = Math.max(0, s.q + d);
  if (s.q === 0) s.on = false;
  renderItems();
  calc();
}

function setQ(id, v) {
  const s = sel[id];
  s.q = Math.max(0, parseInt(v) || 0);
  if (s.q === 0) s.on = false;
  renderItems();
  calc();
}

/* ── 견적 계산 ── */
function calc() {
  const py = getPyung();
  document.getElementById('sqm').textContent = `(약 ${Math.round(py * 3.3)}㎡)`;

  // 1단계: pct 아닌 항목 합산
  let baseSub = 0;
  const catMap = {};

  Object.entries(DATA).forEach(([catName, cat]) => {
    cat.items.forEach(it => {
      if (it.pct) return;
      const s = sel[it.id];
      if (s.on && s.q > 0) {
        const amt = it.p * s.q;
        catMap[catName] = (catMap[catName] || 0) + amt;
        baseSub += amt;
      }
    });
  });

  // 2단계: pct 항목 (업체이윤 등) — baseSub 기준으로 후처리
  let pctSub = 0;
  Object.entries(DATA).forEach(([catName, cat]) => {
    cat.items.forEach(it => {
      if (!it.pct) return;
      const s = sel[it.id];
      if (s.on && s.q > 0) {
        const amt = Math.round(baseSub * it.pct) * s.q;
        catMap[catName] = (catMap[catName] || 0) + amt;
        pctSub += amt;
      }
    });
  });

  const sub   = baseSub + pctSub;
  const vat   = Math.round(sub * 0.1);
  const total = sub + vat;
  const perPy = py > 0 ? Math.round(sub / py) : 0;

  /* 요약 카드 */
  document.getElementById('scards').innerHTML = `
    <div class="scard"><div class="slabel">소계 (VAT 제외)</div><div class="sval">${fmt(sub)}원</div></div>
    <div class="scard"><div class="slabel">부가세 10%</div><div class="sval">${fmt(vat)}원</div></div>
    <div class="scard"><div class="slabel">합계 (VAT 포함)</div><div class="sval hi">${fmt(total)}원</div></div>
    <div class="scard"><div class="slabel">평당 단가</div><div class="sval">${py > 0 ? fmt(perPy) + '원' : '-'}</div></div>
  `;

  /* 카테고리별 내역 */
  const entries = Object.entries(catMap).filter(([, v]) => v > 0);
  const rowsEl  = document.getElementById('srows');

  if (!entries.length) {
    rowsEl.innerHTML = '<p class="empty">항목을 선택하면 견적이 표시됩니다.</p>';
  } else {
    rowsEl.innerHTML =
      entries.map(([k, v]) =>
        `<div class="srow"><span class="lbl">${k}</span><span class="val">${fmt(v)}원</span></div>`
      ).join('') +
      `<div class="srow tot"><span class="lbl">합계</span><span class="val">${fmt(sub)}원</span></div>`;
  }
}

/* ── 초기화 ── */
function resetAll() {
  Object.keys(sel).forEach(id => { sel[id] = { on: false, q: 0 }; });
  renderItems();
  calc();
}
