/**
 * app.js — 인테리어 견적 계산기 메인 로직 v4
 * - 평수 연동 (pyAuto)
 * - pct 항목 후처리 계산
 * - 견적서 테이블 실시간 렌더링
 * - 엑셀 다운로드 (SheetJS)
 * - 인쇄 / PDF
 */

/* ── 상태 ── */
const sel = {};
Object.values(DATA).forEach(cat =>
  cat.items.forEach(it => { sel[it.id] = { on: false, q: 0 }; })
);
let curCat = Object.keys(DATA)[0];

/* ── 초기화 ── */
document.addEventListener('DOMContentLoaded', () => {
  // 오늘 날짜 기본값
  document.getElementById('clientDate').value = new Date().toISOString().split('T')[0];

  renderTabs();
  renderItems();
  calc();

  document.getElementById('pyung').addEventListener('input', onPyungChange);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('btn-excel').addEventListener('click', downloadExcel);
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  // 고객정보 변경 시 견적서 갱신
  ['clientName','clientPhone','clientAddr','clientPeriod','clientNote','clientDate']
    .forEach(id => document.getElementById(id).addEventListener('input', renderQuoteDoc));
});

/* ── 평수 변경 ── */
function onPyungChange() {
  const py = getPyung();
  Object.values(DATA).forEach(cat =>
    cat.items.forEach(it => {
      if (it.pyAuto && sel[it.id].on)
        sel[it.id].q = Math.max(1, Math.round(py));
    })
  );
  renderItems();
  calc();
}

function getPyung() {
  return parseFloat(document.getElementById('pyung').value) || 0;
}

function findItem(id) {
  for (const cat of Object.values(DATA))
    for (const it of cat.items)
      if (it.id === id) return it;
  return null;
}

function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

function fmtWon(n) { return fmt(n) + '원'; }

/* ── 탭 ── */
function renderTabs() {
  document.getElementById('tabs').innerHTML = Object.keys(DATA)
    .map(cat => `<div class="tab${cat === curCat ? ' on' : ''}" data-cat="${cat}">${cat}</div>`)
    .join('');
  document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => { curCat = el.dataset.cat; renderTabs(); renderItems(); });
  });
}

/* ── 항목 렌더링 ── */
function renderItems() {
  const html = DATA[curCat].items.map(it => {
    const s = sel[it.id];
    const pyTag = it.pyAuto ? `<span class="pytag">평수연동</span>` : '';
    const priceLabel = it.pct
      ? `공사금 ${(it.pct * 100).toFixed(0)}% 자동`
      : `${fmt(it.p)}원/${it.u}`;

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

  document.getElementById('content').addEventListener('click', onItemClick);
  document.querySelectorAll('.qbtn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); adj(btn.dataset.id, parseInt(btn.dataset.d)); });
  });
  document.querySelectorAll('.qinput').forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('input', e => { e.stopPropagation(); setQ(input.dataset.id, input.value); });
  });
}

function onItemClick(e) {
  const itemEl = e.target.closest('.item');
  if (!itemEl || e.target.closest('.qty-row')) return;
  tog(itemEl.dataset.id);
}

function tog(id) {
  const s = sel[id];
  s.on = !s.on;
  if (s.on) {
    const it = findItem(id);
    s.q = (it && it.pyAuto) ? Math.max(1, Math.round(getPyung())) : 1;
  } else {
    s.q = 0;
  }
  renderItems(); calc();
}

function adj(id, d) {
  const s = sel[id];
  s.q = Math.max(0, s.q + d);
  if (s.q === 0) s.on = false;
  renderItems(); calc();
}

function setQ(id, v) {
  const s = sel[id];
  s.q = Math.max(0, parseInt(v) || 0);
  if (s.q === 0) s.on = false;
  renderItems(); calc();
}

/* ── 계산 ── */
function calcTotals() {
  let baseSub = 0;
  const catMap = {};
  const selectedItems = []; // { catName, it, qty, amt }

  Object.entries(DATA).forEach(([catName, cat]) => {
    cat.items.forEach(it => {
      if (it.pct) return;
      const s = sel[it.id];
      if (s.on && s.q > 0) {
        const amt = it.p * s.q;
        catMap[catName] = (catMap[catName] || 0) + amt;
        baseSub += amt;
        selectedItems.push({ catName, it, qty: s.q, amt });
      }
    });
  });

  let pctSub = 0;
  Object.entries(DATA).forEach(([catName, cat]) => {
    cat.items.forEach(it => {
      if (!it.pct) return;
      const s = sel[it.id];
      if (s.on && s.q > 0) {
        const amt = Math.round(baseSub * it.pct) * s.q;
        catMap[catName] = (catMap[catName] || 0) + amt;
        pctSub += amt;
        selectedItems.push({ catName, it, qty: s.q, amt });
      }
    });
  });

  const sub   = baseSub + pctSub;
  const vat   = Math.round(sub * 0.1);
  const total = sub + vat;
  return { sub, vat, total, catMap, selectedItems, baseSub };
}

function calc() {
  const py = getPyung();
  document.getElementById('sqm').textContent = `(약 ${Math.round(py * 3.3)}㎡)`;

  const { sub, vat, total, catMap, selectedItems } = calcTotals();
  const perPy = py > 0 ? Math.round(sub / py) : 0;

  /* 요약 카드 */
  document.getElementById('scards').innerHTML = `
    <div class="scard"><div class="slabel">소계 (VAT 제외)</div><div class="sval">${fmt(sub)}원</div></div>
    <div class="scard"><div class="slabel">부가세 10%</div><div class="sval">${fmt(vat)}원</div></div>
    <div class="scard"><div class="slabel">합계 (VAT 포함)</div><div class="sval hi">${fmt(total)}원</div></div>
    <div class="scard"><div class="slabel">평당 단가</div><div class="sval">${py > 0 ? fmt(perPy) + '원' : '-'}</div></div>
  `;

  /* 카테고리 내역 */
  const entries = Object.entries(catMap).filter(([, v]) => v > 0);
  const rowsEl = document.getElementById('srows');
  if (!entries.length) {
    rowsEl.innerHTML = '<p class="empty">항목을 선택하면 견적이 표시됩니다.</p>';
  } else {
    rowsEl.innerHTML =
      entries.map(([k, v]) =>
        `<div class="srow"><span class="lbl">${k}</span><span class="val">${fmt(v)}원</span></div>`
      ).join('') +
      `<div class="srow tot"><span class="lbl">합계</span><span class="val">${fmt(sub)}원</span></div>`;
  }

  /* 견적서 문서 렌더링 */
  renderQuoteDoc({ sub, vat, total, selectedItems });
}

/* ── 견적서 문서 렌더링 ── */
function renderQuoteDoc(totals) {
  // totals 없으면 재계산
  if (!totals || !totals.selectedItems) {
    totals = calcTotals();
  }
  const { sub, vat, total, selectedItems } = totals;

  /* 고객 정보 */
  const clientDate   = document.getElementById('clientDate').value || '';
  const clientName   = document.getElementById('clientName').value || '';
  const clientPhone  = document.getElementById('clientPhone').value || '';
  const clientAddr   = document.getElementById('clientAddr').value || '';
  const clientPeriod = document.getElementById('clientPeriod').value || '';
  const clientNote   = document.getElementById('clientNote').value || '';

  document.getElementById('qi-date').textContent   = clientDate.replace(/-/g, '년 ').replace(/-/, '월 ') + '일';
  document.getElementById('qi-client').textContent = `${clientName} / ${clientPhone}`;
  document.getElementById('qi-addr').textContent   = clientAddr;
  document.getElementById('qi-period').textContent = clientPeriod;
  document.getElementById('qi-note').textContent   = clientNote;

  /* 항목 테이블 — 카테고리별 그룹핑 */
  const grouped = {};
  selectedItems.forEach(row => {
    if (!grouped[row.catName]) grouped[row.catName] = [];
    grouped[row.catName].push(row);
  });

  let bodyHtml = '';
  Object.entries(grouped).forEach(([catName, rows]) => {
    // 카테고리 헤더 행
    const catTotal = rows.reduce((s, r) => s + r.amt, 0);
    bodyHtml += `<tr class="qrow-cat">
      <td>${catName}</td>
      <td colspan="4"></td>
      <td class="q-amount">${fmt(catTotal)}</td>
    </tr>`;
    // 세부 항목
    rows.forEach(({ it, qty, amt }) => {
      const unitPrice = it.pct ? `공사금 ${(it.pct*100).toFixed(0)}%` : fmt(it.p);
      bodyHtml += `<tr>
        <td></td>
        <td class="q-name">${it.n}<br><span style="font-size:9px;color:#888">${it.d}</span></td>
        <td class="q-center">${it.u}</td>
        <td class="q-center">${qty}</td>
        <td class="q-price">${unitPrice}</td>
        <td class="q-amount">${fmt(amt)}</td>
      </tr>`;
    });
  });

  if (!bodyHtml) {
    bodyHtml = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#aaa">선택된 항목이 없습니다.</td></tr>`;
  }

  document.getElementById('qitem-body').innerHTML = bodyHtml;
  document.getElementById('qf-sub').textContent   = fmtWon(sub);
  document.getElementById('qf-vat').textContent   = fmtWon(vat);
  document.getElementById('qf-total').textContent = fmtWon(total);

  /* 계약 조건 */
  document.getElementById('qc-deposit').textContent = fmtWon(Math.round(total * 0.2));
  document.getElementById('qc-mid').textContent     = fmtWon(Math.round(total * 0.3));
  document.getElementById('qc-final').textContent   = fmtWon(Math.round(total * 0.5));
}

/* ── 엑셀 다운로드 ── */
function downloadExcel() {
  const { sub, vat, total, selectedItems } = calcTotals();

  const clientDate   = document.getElementById('clientDate').value || '';
  const clientName   = document.getElementById('clientName').value || '고객';
  const clientPhone  = document.getElementById('clientPhone').value || '';
  const clientAddr   = document.getElementById('clientAddr').value || '';
  const clientPeriod = document.getElementById('clientPeriod').value || '';
  const clientNote   = document.getElementById('clientNote').value || '';

  const wb = XLSX.utils.book_new();
  const ws_data = [];

  /* ─ 헤더 ─ */
  ws_data.push(['라인 인테리어', '', '', '', '', '견 적 서']);
  ws_data.push([]);
  ws_data.push(['의뢰일',   clientDate,  '', '상호',     '라인 인테리어', '']);
  ws_data.push(['고객명/연락처', `${clientName} / ${clientPhone}`, '', '등록번호', '296-24-02323', '']);
  ws_data.push(['주소/평형', clientAddr,  '', '담당자',   '라인 인테리어', '']);
  ws_data.push(['시공예상기간', clientPeriod, '', '연락처', '010-6420-3155', '']);
  ws_data.push(['특이사항', clientNote,  '', '', '', '']);
  ws_data.push([]);

  /* ─ 컬럼 헤더 ─ */
  ws_data.push(['품명', '내용', '단위', '수량', '단가', '견적가']);

  /* ─ 항목 (카테고리 그룹) ─ */
  const grouped = {};
  selectedItems.forEach(row => {
    if (!grouped[row.catName]) grouped[row.catName] = [];
    grouped[row.catName].push(row);
  });

  Object.entries(grouped).forEach(([catName, rows]) => {
    const catTotal = rows.reduce((s, r) => s + r.amt, 0);
    ws_data.push([catName, '', '', '', '', catTotal]);
    rows.forEach(({ it, qty, amt }) => {
      const unitPrice = it.pct ? `공사금 ${(it.pct*100).toFixed(0)}%` : it.p;
      ws_data.push(['', `${it.n} (${it.d})`, it.u, qty, unitPrice, amt]);
    });
  });

  ws_data.push([]);
  ws_data.push(['소계 (부가세 제외)', '', '', '', '', sub]);
  ws_data.push(['부가세 (10%)',       '', '', '', '', vat]);
  ws_data.push(['총 공사 금액',       '', '', '', '', total]);
  ws_data.push([]);
  ws_data.push(['계약금 (20%)', Math.round(total * 0.2), '', '1차 중도금 (30%)', Math.round(total * 0.3), '']);
  ws_data.push(['잔금 (50%)',   Math.round(total * 0.5), '', '', '', '']);
  ws_data.push([]);
  ws_data.push(['* 부가세 별도 견적입니다. (계약금 30%, 시공후 잔금 70% 입금 기준)']);
  ws_data.push(['* 본 업체는 전문 기공 인력만 시공합니다. (연습생, 외국인 인력 제한)']);

  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  /* 열 너비 설정 */
  ws['!cols'] = [
    { wch: 14 }, { wch: 40 }, { wch: 8 },
    { wch: 8  }, { wch: 14 }, { wch: 14 }
  ];

  /* 숫자 셀 서식 */
  const numFmt = '#,##0';
  ws_data.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      if (typeof cell === 'number') {
        const cellRef = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (ws[cellRef]) ws[cellRef].z = numFmt;
      }
    });
  });

  XLSX.utils.book_append_sheet(wb, ws, '견적서');

  const filename = `라인인테리어_견적서_${clientName}_${clientDate || new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/* ── 초기화 ── */
function resetAll() {
  Object.keys(sel).forEach(id => { sel[id] = { on: false, q: 0 }; });
  renderItems(); calc();
}
