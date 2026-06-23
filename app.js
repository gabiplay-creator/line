/**
 * app.js — 인테리어 견적 계산기 v5
 */

/* ════════ 상태 ════════ */
const sel = {};   // { id: { on, q, val } }
const floorDemoSel = {}; // { fd_id: { on, q } }

function initSel() {
  Object.values(DATA).forEach(cat =>
    cat.items.forEach(it => {
      if (!sel[it.id]) sel[it.id] = { on: false, q: 1, val: 0, selectIdx: 0 };
    })
  );
  FLOOR_DEMO_TYPES.forEach(ft => {
    if (!floorDemoSel[ft.id]) floorDemoSel[ft.id] = { on: false, q: 1 };
  });
}

let curCat = Object.keys(DATA)[0];

/* ════════ 초기화 ════════ */
document.addEventListener('DOMContentLoaded', () => {
  initSel();
  document.getElementById('clientDate').value = today();
  renderTabs(); renderItems(); calc();
  document.getElementById('pyung').addEventListener('input', onPyungChange);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('btn-excel').addEventListener('click', downloadExcel);
  document.getElementById('btn-print-detail').addEventListener('click', () => { setPrintMode('detail'); window.print(); });
  document.getElementById('btn-print-simple').addEventListener('click', () => { setPrintMode('simple'); window.print(); });
  ['clientName','clientPhone','clientAddr','clientPeriod','clientNote','clientDate']
    .forEach(id => document.getElementById(id).addEventListener('input', () => renderQuoteDoc()));
});

function today() { return new Date().toISOString().split('T')[0]; }
function getPyung() { return parseFloat(document.getElementById('pyung').value) || 0; }
function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
function fmtW(n) { return fmt(n) + '원'; }
function findItem(id) {
  for (const c of Object.values(DATA)) for (const it of c.items) if (it.id === id) return it;
  return null;
}

/* ════════ 평수 변경 ════════ */
function onPyungChange() {
  const py = getPyung();
  Object.values(DATA).forEach(cat =>
    cat.items.forEach(it => { if (it.pyAuto && sel[it.id]?.on) sel[it.id].q = Math.max(1, Math.round(py)); })
  );
  renderItems(); calc();
}

/* ════════ 탭 ════════ */
function renderTabs() {
  document.getElementById('tabs').innerHTML = Object.keys(DATA)
    .map(c => `<div class="tab${c === curCat ? ' on' : ''}" data-cat="${c}">${c}</div>`).join('');
  document.querySelectorAll('.tab').forEach(el =>
    el.addEventListener('click', () => { curCat = el.dataset.cat; renderTabs(); renderItems(); })
  );
}

/* ════════ 항목 렌더링 ════════ */
function renderItems() {
  const catData = DATA[curCat];
  let html = '<div class="items">';
  catData.items.forEach(it => { html += renderItem(it); });
  html += '</div>';
  document.getElementById('content').innerHTML = html;
  bindItemEvents();
}

function renderItem(it) {
  const s = sel[it.id];
  const isOn = s.on;

  if (it.type === 'floor-demo') return renderFloorDemo(it, isOn);
  if (it.type === 'mat-option') return renderMatOption(it, isOn);

  let priceLabel = '';
  if (it.pct) priceLabel = `공사금 ${(it.pct*100).toFixed(0)}% 자동`;
  else if (it.type === 'input') priceLabel = '직접 입력';
  else if (it.type === 'select-price') priceLabel = it.options.map(o=>o.label).join(' / ');
  else priceLabel = `${fmt(it.p)}원/${it.u}`;

  let controlHtml = '';
  if (isOn) {
    if (it.type === 'stepper' || it.type === 'pyung-unit') {
      controlHtml = `
        <div class="qty-row" onclick="event.stopPropagation()">
          <button class="qbtn" onclick="event.stopPropagation();adjQ('${it.id}',-1)">−</button>
          <input class="qinput" type="number" value="${s.q}" min="1" max="9999" data-id="${it.id}" onclick="event.stopPropagation()" oninput="event.stopPropagation();setQv('${it.id}',this.value)">
          <button class="qbtn" onclick="event.stopPropagation();adjQ('${it.id}',1)">+</button>
          <span class="iunit">${it.u}</span>
        </div>`;
    } else if (it.type === 'select-price') {
      const opts = it.options.map((o,i) => `<option value="${i}" ${s.selectIdx===i?'selected':''}>${o.label}${o.p?` (+${fmt(o.p)}원)`:''}</option>`).join('');
      controlHtml = `<div class="qty-row" onclick="event.stopPropagation()"><select class="sel-input" data-id="${it.id}" onchange="event.stopPropagation();setSelect('${it.id}',this.value)">${opts}</select></div>`;
    } else if (it.type === 'input') {
      controlHtml = `
        <div class="qty-row" onclick="event.stopPropagation()">
          <input class="qinput wide" type="number" placeholder="금액 입력" value="${s.val||''}" data-id="${it.id}" onclick="event.stopPropagation()" oninput="event.stopPropagation();setVal('${it.id}',this.value)">
          <span class="iunit">원</span>
        </div>`;
    }
  }

  const pytag = it.pyAuto ? `<span class="pytag">평수연동</span>` : '';
  return `
    <div class="item${isOn?' sel':''}" data-id="${it.id}">
      <div class="chk">${isOn?'✓':''}</div>
      <div class="iinfo">
        <div class="iname">${it.n}${pytag}</div>
        <div class="idesc">${it.d}</div>
      </div>
      <div class="iright">
        <div class="iprice">${priceLabel}</div>
        ${controlHtml}
      </div>
    </div>`;
}

/* 마루 철거 특수 렌더 */
function renderFloorDemo(it, isOn) {
  let inner = '';
  if (isOn) {
    inner = `<div class="floor-demo-grid" onclick="event.stopPropagation()">` +
      FLOOR_DEMO_TYPES.map(ft => {
        const fs = floorDemoSel[ft.id];
        const u = ft.u || '평';
        return `
          <div class="fd-row${fs.on?' fd-on':''}">
            <label class="fd-check" onclick="toggleFD('${ft.id}')">
              <span class="fd-chk">${fs.on?'✓':''}</span>
              <span class="fd-name">${ft.n}</span>
              <span class="fd-price">${fmt(ft.p)}원/${u}</span>
            </label>
            ${fs.on ? `<div class="fd-qty">
              <button onclick="adjFD('${ft.id}',-1)">−</button>
              <input type="number" value="${fs.q}" min="1" max="999" onchange="setFD('${ft.id}',this.value)">
              <button onclick="adjFD('${ft.id}',1)">+</button>
              <span class="iunit">${u}</span>
            </div>` : ''}
          </div>`;
      }).join('') + `</div>`;
  }
  return `
    <div class="item item-wide${isOn?' sel':''}" data-id="${it.id}">
      <div class="chk">${isOn?'✓':''}</div>
      <div class="iinfo" style="flex:1">
        <div class="iname">${it.n}</div>
        <div class="idesc">${it.d}</div>
        ${inner}
      </div>
    </div>`;
}

/* 영림 매트 옵션 특수 렌더 */
function renderMatOption(it, isOn) {
  const matBase = calcYoungDoorBase();
  const addAmt = Math.round(matBase * 0.4);
  return `
    <div class="item${isOn?' sel':''}" data-id="${it.id}">
      <div class="chk">${isOn?'✓':''}</div>
      <div class="iinfo">
        <div class="iname">${it.n}</div>
        <div class="idesc">영림 더도어/오리지날 금액 합계의 40% 추가 (현재: ${fmtW(addAmt)})</div>
      </div>
      <div class="iright"><div class="iprice">${fmtW(addAmt)}</div></div>
    </div>`;
}

function calcYoungDoorBase() {
  let base = 0;
  ['carp_young_door','carp_young_orig'].forEach(id => {
    const it = findItem(id); const s = sel[id];
    if (it && s?.on) base += it.p * s.q;
  });
  return base;
}

/* ════════ 이벤트 바인딩 ════════ */
function bindItemEvents() {
  document.getElementById('content').querySelectorAll('.item[data-id]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.qty-row,.floor-demo-grid,.fd-row,.fd-qty,.fd-check')) return;
      togItem(el.dataset.id);
    });
  });
}

function togItem(id) {
  const s = sel[id]; s.on = !s.on;
  const it = findItem(id);
  if (s.on) {
    s.q = (it?.pyAuto) ? Math.max(1, Math.round(getPyung())) : 1;
    if (it?.type === 'select-price') s.selectIdx = 0;
  }
  renderItems(); calc();
}
function adjQ(id, d) { const s = sel[id]; s.q = Math.max(1, s.q+d); renderItems(); calc(); }
function setQv(id, v) { sel[id].q = Math.max(1, parseInt(v)||1); calc(); }
function setVal(id, v) { sel[id].val = parseFloat(v)||0; calc(); }
function setSelect(id, v) { sel[id].selectIdx = parseInt(v); calc(); }
function toggleFD(fid) { const fs=floorDemoSel[fid]; fs.on=!fs.on; renderItems(); calc(); }
function adjFD(fid, d) { const fs=floorDemoSel[fid]; fs.q=Math.max(1,fs.q+d); renderItems(); calc(); }
function setFD(fid, v) { floorDemoSel[fid].q=Math.max(1,parseInt(v)||1); calc(); }

/* ════════ 금액 계산 ════════ */
function calcTotals() {
  let baseSub = 0;
  const catMap = {};
  const rows = []; // { catName, label, detail, qty, u, unitP, amt }

  Object.entries(DATA).forEach(([catName, cat]) => {
    cat.items.forEach(it => {
      if (it.pct) return;
      const s = sel[it.id];
      if (!s?.on) return;

      let amt = 0;
      let unitP = it.p || 0;
      let detail = it.d;
      let qtyLabel = s.q;

      if (it.type === 'floor-demo') {
        // 마루 철거 세부 합산
        FLOOR_DEMO_TYPES.forEach(ft => {
          const fs = floorDemoSel[ft.id];
          if (!fs.on) return;
          const a = ft.p * fs.q;
          amt += a;
          rows.push({ catName, label: `마루 철거 — ${ft.n}`, detail:'', qty:fs.q, u:(ft.u||'평'), unitP:ft.p, amt:a });
        });
        if (amt > 0) catMap[catName] = (catMap[catName]||0) + amt;
        baseSub += amt;
        return;
      }

      if (it.type === 'select-price') {
        const opt = it.options[s.selectIdx];
        if (!opt || opt.p === 0) return;
        amt = opt.p;
        detail = opt.label;
        qtyLabel = 1;
      } else if (it.type === 'input') {
        amt = s.val || 0;
        if (!amt) return;
        unitP = amt;
        qtyLabel = 1;
      } else if (it.type === 'mat-option') {
        amt = Math.round(calcYoungDoorBase() * 0.4);
        if (!amt) return;
        unitP = amt;
        qtyLabel = 1;
      } else {
        amt = unitP * s.q;
        qtyLabel = s.q;
      }

      if (!amt) return;
      catMap[catName] = (catMap[catName]||0) + amt;
      baseSub += amt;
      rows.push({ catName, label: it.n, detail, qty: qtyLabel, u: it.u, unitP, amt });
    });
  });

  // pct 항목
  let pctSub = 0;
  Object.entries(DATA).forEach(([catName, cat]) => {
    cat.items.forEach(it => {
      if (!it.pct) return;
      const s = sel[it.id];
      if (!s?.on) return;
      const amt = Math.round(baseSub * it.pct);
      catMap[catName] = (catMap[catName]||0) + amt;
      pctSub += amt;
      rows.push({ catName, label: it.n, detail:`합계 ${fmt(baseSub)}원의 ${(it.pct*100).toFixed(0)}%`, qty:1, u:'식', unitP:amt, amt });
    });
  });

  const sub   = baseSub + pctSub;
  const vat   = Math.round(sub * 0.1);
  const total = sub + vat;
  return { sub, vat, total, catMap, rows };
}

/* ════════ 요약 렌더 ════════ */
function calc() {
  const py = getPyung();
  document.getElementById('sqm').textContent = `(약 ${Math.round(py*3.3)}㎡)`;
  const { sub, vat, total, catMap, rows } = calcTotals();
  const perPy = py > 0 ? Math.round(sub/py) : 0;

  document.getElementById('scards').innerHTML = `
    <div class="scard"><div class="slabel">소계 (VAT 제외)</div><div class="sval">${fmt(sub)}원</div></div>
    <div class="scard"><div class="slabel">부가세 10%</div><div class="sval">${fmt(vat)}원</div></div>
    <div class="scard"><div class="slabel">합계 (VAT 포함)</div><div class="sval hi">${fmt(total)}원</div></div>
    <div class="scard"><div class="slabel">평당 단가</div><div class="sval">${py>0?fmt(perPy)+'원':'-'}</div></div>`;

  const entries = Object.entries(catMap).filter(([,v])=>v>0);
  document.getElementById('srows').innerHTML = !entries.length
    ? '<p class="empty">항목을 선택하면 견적이 표시됩니다.</p>'
    : entries.map(([k,v]) => `<div class="srow"><span class="lbl">${k}</span><span class="val">${fmt(v)}원</span></div>`).join('')
      + `<div class="srow tot"><span class="lbl">합계</span><span class="val">${fmt(sub)}원</span></div>`;

  renderQuoteDoc({ sub, vat, total, catMap, rows });
}

/* ════════ 견적서 렌더 ════════ */
function renderQuoteDoc(totals) {
  if (!totals) totals = calcTotals();
  const { sub, vat, total, catMap, rows } = totals;

  const clientDate   = document.getElementById('clientDate').value || '';
  const clientName   = document.getElementById('clientName').value || '';
  const clientPhone  = document.getElementById('clientPhone').value || '';
  const clientAddr   = document.getElementById('clientAddr').value || '';
  const clientPeriod = document.getElementById('clientPeriod').value || '';
  const clientNote   = document.getElementById('clientNote').value || '';

  const dateStr = clientDate.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1년 $2월 $3일');
  document.getElementById('qi-date').textContent   = dateStr;
  document.getElementById('qi-client').textContent = `${clientName} / ${clientPhone}`;
  document.getElementById('qi-addr').textContent   = clientAddr;
  document.getElementById('qi-period').textContent = clientPeriod;
  document.getElementById('qi-note').textContent   = clientNote;

  // 그룹핑
  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.catName]) grouped[r.catName] = [];
    grouped[r.catName].push(r);
  });

  // ── 상세 견적서 tbody ──
  let detailHtml = '';
  Object.entries(grouped).forEach(([cat, list]) => {
    const catTotal = list.reduce((s,r)=>s+r.amt,0);
    detailHtml += `<tr class="qrow-cat">
      <td>${cat}</td><td colspan="4"></td>
      <td class="q-amount">${fmt(catTotal)}</td></tr>`;
    list.forEach(r => {
      const up = r.unitP ? fmt(r.unitP) : '-';
      detailHtml += `<tr>
        <td></td>
        <td class="q-name">${r.label}${r.detail?`<br><span class="q-detail">${r.detail}</span>`:''}</td>
        <td class="q-center">${r.u}</td>
        <td class="q-center">${r.qty}</td>
        <td class="q-price">${up}</td>
        <td class="q-amount">${fmt(r.amt)}</td></tr>`;
    });
  });
  if (!detailHtml) detailHtml = `<tr><td colspan="6" class="empty">선택된 항목이 없습니다.</td></tr>`;

  // ── 간략 견적서 tbody ──
  let simpleHtml = '';
  Object.entries(grouped).forEach(([cat, list]) => {
    const catTotal = list.reduce((s,r)=>s+r.amt,0);
    simpleHtml += `<tr>
      <td class="q-name" style="font-weight:600">${cat}</td>
      <td colspan="4"></td>
      <td class="q-amount">${fmt(catTotal)}</td></tr>`;
  });
  if (!simpleHtml) simpleHtml = `<tr><td colspan="6" class="empty">선택된 항목이 없습니다.</td></tr>`;

  document.getElementById('qitem-body-detail').innerHTML = detailHtml;
  document.getElementById('qitem-body-simple').innerHTML = simpleHtml;

  ['qf-sub-d','qf-sub-s'].forEach(id => document.getElementById(id).textContent = fmtW(sub));
  ['qf-vat-d','qf-vat-s'].forEach(id => document.getElementById(id).textContent = fmtW(vat));
  ['qf-total-d','qf-total-s'].forEach(id => document.getElementById(id).textContent = fmtW(total));

  ['qc-deposit-d','qc-deposit-s'].forEach(id => document.getElementById(id).textContent = fmtW(Math.round(total*0.2)));
  ['qc-mid-d','qc-mid-s'].forEach(id => document.getElementById(id).textContent = fmtW(Math.round(total*0.3)));
  ['qc-final-d','qc-final-s'].forEach(id => document.getElementById(id).textContent = fmtW(Math.round(total*0.5)));
}

/* ════════ 인쇄 모드 ════════ */
let printMode = 'detail';
function setPrintMode(m) {
  printMode = m;
  document.getElementById('quote-detail').classList.toggle('print-hidden', m !== 'detail');
  document.getElementById('quote-simple').classList.toggle('print-hidden', m !== 'simple');
}

/* ════════ 엑셀 다운로드 ════════ */
function downloadExcel() {
  const { sub, vat, total, rows } = calcTotals();
  const clientDate  = document.getElementById('clientDate').value || today();
  const clientName  = document.getElementById('clientName').value || '고객';
  const clientPhone = document.getElementById('clientPhone').value || '';
  const clientAddr  = document.getElementById('clientAddr').value || '';
  const clientPeriod= document.getElementById('clientPeriod').value || '';
  const clientNote  = document.getElementById('clientNote').value || '';

  const wb = XLSX.utils.book_new();

  // ── 시트1: 상세 견적서 ──
  const d = [];
  d.push(['라인 인테리어','','','','','견 적 서']);
  d.push([]);
  d.push(['의뢰일', clientDate, '', '상호', '라인 인테리어', '']);
  d.push(['고객명/연락처', `${clientName} / ${clientPhone}`, '', '등록번호', '296-24-02323', '']);
  d.push(['주소/평형', clientAddr, '', '담당자', '라인 인테리어', '']);
  d.push(['시공예상기간', clientPeriod, '', '연락처', '010-6420-3155', '']);
  d.push(['특이사항', clientNote, '', '', '', '']);
  d.push([]);
  d.push(['품명','내용','단위','수량','단가','견적가']);

  const grouped = {};
  rows.forEach(r => { if (!grouped[r.catName]) grouped[r.catName]=[]; grouped[r.catName].push(r); });

  Object.entries(grouped).forEach(([cat, list]) => {
    const catTotal = list.reduce((s,r)=>s+r.amt,0);
    d.push([cat,'','','','',catTotal]);
    list.forEach(r => d.push(['', `${r.label}${r.detail?' ('+r.detail+')':''}`, r.u, r.qty, r.unitP||'', r.amt]));
  });
  d.push([]);
  d.push(['소계 (부가세 제외)','','','','',sub]);
  d.push(['부가세 (10%)','','','','',vat]);
  d.push(['총 공사 금액','','','','',total]);
  d.push([]);
  d.push(['계약금 (20%)', Math.round(total*0.2), '', '1차 중도금 (30%)', Math.round(total*0.3), '잔금 (50%)']);
  d.push(['', '', '', '', '', Math.round(total*0.5)]);
  d.push([]);
  d.push(['* 부가세 별도 견적입니다.']);
  d.push(['* 본 업체는 전문 기공 인력만 시공합니다.']);

  const ws1 = XLSX.utils.aoa_to_sheet(d);
  ws1['!cols'] = [{wch:14},{wch:38},{wch:8},{wch:8},{wch:14},{wch:14}];
  applyNumFmt(ws1, d);
  XLSX.utils.book_append_sheet(wb, ws1, '상세견적서');

  // ── 시트2: 간략 견적서 ──
  const s2 = [];
  s2.push(['라인 인테리어','','','','','견 적 서 (요약)']);
  s2.push([]);
  s2.push(['의뢰일', clientDate, '', '상호', '라인 인테리어','']);
  s2.push(['고객명/연락처', `${clientName} / ${clientPhone}`, '', '등록번호', '296-24-02323','']);
  s2.push(['주소/평형', clientAddr, '', '담당자', '라인 인테리어','']);
  s2.push([]);
  s2.push(['항목','','','','','금액']);
  Object.entries(grouped).forEach(([cat, list]) => {
    const catTotal = list.reduce((s,r)=>s+r.amt,0);
    s2.push([cat,'','','','',catTotal]);
  });
  s2.push([]);
  s2.push(['소계','','','','',sub]);
  s2.push(['부가세','','','','',vat]);
  s2.push(['총 공사 금액','','','','',total]);

  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2['!cols'] = [{wch:20},{wch:20},{wch:8},{wch:8},{wch:14},{wch:14}];
  applyNumFmt(ws2, s2);
  XLSX.utils.book_append_sheet(wb, ws2, '요약견적서');

  const fname = `라인인테리어_견적서_${clientName}_${clientDate}.xlsx`;
  XLSX.writeFile(wb, fname);
}

function applyNumFmt(ws, data) {
  data.forEach((row, ri) => row.forEach((cell, ci) => {
    if (typeof cell === 'number') {
      const ref = XLSX.utils.encode_cell({r:ri, c:ci});
      if (ws[ref]) ws[ref].z = '#,##0';
    }
  }));
}

/* ════════ 초기화 ════════ */
function resetAll() {
  Object.keys(sel).forEach(id => { sel[id] = { on:false, q:1, val:0, selectIdx:0 }; });
  Object.keys(floorDemoSel).forEach(id => { floorDemoSel[id] = { on:false, q:1 }; });
  renderItems(); calc();
}
