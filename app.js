/**
 * app.js — 인테리어 견적 계산기 v5
 */

/* ════════ 상태 ════════ */
const sel = {};   // { id: { on, q, val } }
const floorDemoSel = {}; // { fd_id: { on, q } }
// 욕실별 타입 상태: [ {type: 'std'|'high'|'prem'}, ... ]
let bathRooms = []; // 길이 = 욕실 수
let negoAmt = 0;    // 네고(할인) 금액 — 항상 양수로 저장, 총액에서 차감
// 화장실 방수: [ { type: '1st'|'2nd', count: 1 }, ... ] — 개소별
let bathWaterList = []; // 레거시 — 더 이상 사용 안 함
let wallPaperName = ''; // 도배지명 메모
// 욕실 철거: { living: false, master: false } — 거실/안방 각각
let bathDemoState = { living: false, master: false };
// 카테고리별 기타/네고: { [id]: { text:'', amt:0, nego:0 } }
const catExtraState = {};

function initSel() {
  Object.values(DATA).forEach(cat =>
    cat.items.forEach(it => {
      // bath-demo/water/rooms/cat-extra 는 항상 on=true (별도 상태로 관리)
      const alwaysOn = ['bath-demo','bath-rooms','cat-extra','divider','wall-paper-name'].includes(it.type);
      if (!sel[it.id]) sel[it.id] = { on: alwaysOn, q: 1, val: 0, selectIdx: 0 };
      else if (alwaysOn) sel[it.id].on = true;
      if (it.type === 'cat-extra' && !catExtraState[it.id]) {
        catExtraState[it.id] = { text:'', amt:0, nego:0 };
      }
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
  initItemEvents(); // 이벤트 위임 — wrap에 딱 한 번만 등록
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
  // 카테고리별 금액 합산 (탭 배지용)
  const catTotals = getCatTotals();
  document.getElementById('tabs').innerHTML = Object.keys(DATA)
    .map(c => {
      const amt = catTotals[c] || 0;
      const hasAmt = amt > 0;
      const badge = hasAmt ? `<span class="tab-badge">${formatTabAmt(amt)}</span>` : '';
      return `<div class="tab${c === curCat ? ' on' : ''}${hasAmt ? ' has-amt' : ''}" onclick="switchTab('${c}')">${c}${badge}</div>`;
    }).join('');
}

function formatTabAmt(n) {
  if (n >= 10000000) return (n/10000000).toFixed(0) + '천만';
  if (n >= 1000000)  return (n/10000).toFixed(0) + '만';
  if (n >= 10000)    return (n/10000).toFixed(0) + '만';
  return (n/1000).toFixed(0) + '천';
}

function getCatTotals() {
  const map = {};
  // calcTotals의 catMap만 빠르게 재계산
  const { catMap } = calcTotals();
  return catMap;
}

function switchTab(cat) {
  curCat = cat;
  renderTabs();
  renderItems();
}

/* ════════ 항목 렌더링 ════════ */
const CAT_COLORS = {
  '철거':     'cat-red',
  '설비':     'cat-blue',
  '중문':     'cat-teal',
  '목공':     'cat-amber',
  '욕실':     'cat-cyan',
  '타일':     'cat-stone',
  '도배':     'cat-lime',
  '창호':     'cat-sky',
  '마루':     'cat-wood',
  '장판·데코':'cat-green',
  '방범창':   'cat-slate',
  '전기·조명':'cat-yellow',
  '가구·설비':'cat-purple',
  '기타':     'cat-gray',
};

function renderItems() {
  const catData = DATA[curCat];
  const colorClass = CAT_COLORS[curCat] || 'cat-gray';
  let html = `<div class="items cat-zone ${colorClass}">`;
  catData.items.forEach(it => { html += renderItem(it); });
  html += '</div>';
  document.getElementById('content').innerHTML = html;
}

function renderItem(it) {
  const s = sel[it.id];
  const isOn = s.on;

  if (it.type === 'floor-demo') return renderFloorDemo(it, isOn);

  if (it.type === 'bath-rooms') return renderBathRooms(it);
  if (it.type === 'auto-labor') return renderAutoLabor(it, isOn);
  if (it.type === 'auto-waste') return renderAutoWaste(it, isOn);
  if (it.type === 'nego') return renderNego(it);

  if (it.type === 'bath-demo') return renderBathDemo(it);
  if (it.type === 'wall-paper-name') return renderWallPaperName(it);
  if (it.type === 'divider') return renderDivider(it);
  if (it.type === 'cat-extra') return renderCatExtra(it);

  let priceLabel = '';
  if (it.pct) priceLabel = `공사금 ${(it.pct*100).toFixed(0)}% 자동`;
  else if (it.type === 'input') priceLabel = '직접 입력';
  else if (it.type === 'select-price') {
    // 선택 전: 옵션 수만 표시 / 선택 후: 선택된 항목 금액 표시
    if (!isOn) {
      priceLabel = `${it.options.length - 1}가지 선택`;
    } else {
      const sel_opt = it.options[s.selectIdx];
      priceLabel = sel_opt?.p ? `+${fmt(sel_opt.p)}원` : '선택 안함';
    }
  }
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
  // 우수관 방수+교체 동시 선택 시 세트 배지
  const drainBoth = (it.id==='plm_drain1'||it.id==='plm_drain2') && sel['plm_drain1']?.on && sel['plm_drain2']?.on;
  const setBadge = drainBoth ? `<span class="set-badge">🎉 세트 500,000원</span>` : '';
  return `
    <div class="item${isOn?' sel':''}" data-id="${it.id}">
      <div class="chk">${isOn?'✓':''}</div>
      <div class="iinfo">
        <div class="iname">${it.n}${pytag}${setBadge}</div>
        <div class="idesc">${it.type === 'select-price' && !isOn ? it.options.filter(o=>o.p>0).map(o=>o.label+' '+Math.round(o.p).toLocaleString()+'원').join(' · ') : it.d}</div>
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
            </div>
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

// renderMatOption 제거됨


/* 욕실 수 + 타입 + 옵션 통합 렌더 */
const BATH_TYPES = [
  { key:'std',  label:'베이직형',   p:2900000, color:'#4a7c59' },
  { key:'high', label:'스탠다드형', p:4300000, color:'#185fa5' },
  { key:'prem', label:'프리미엄형', p:5200000, color:'#7b3fa0' },
];

const BATH_OPTS = [
  { key:'faucet', label:'수전금구 업그레이드', p:300000 },
  { key:'shower', label:'해바라기 수전',       p:150000 },
  { key:'zendai', label:'젠다이',              p:150000 },
  { key:'mirror', label:'수납장 거울형',       p:200000 },
  { key:'size',   label:'사이즈 추가',         p:150000 },
  { key:'elec',   label:'전기 추가',           p:100000 },
  { key:'tub',    label:'욕조',                p:200000 },
  { key:'spray',  label:'스프레이건',          p:50000  },
];
const BATH_FAN_OPTS = [
  { label:'환풍기 기본', p:0 },
  { label:'휴젠뜨',      p:300000 },
  { label:'휴젠뜨 노바', p:350000 },
  { label:'휴젠뜨 팔레트', p:450000 },
];

function calcBathRoomAmt(r) {
  const BPRICES = { std:2900000, high:4300000, prem:5200000 };
  let a = BPRICES[r.type] || 0;
  BATH_OPTS.forEach(o => { if (r.opts[o.key]) a += o.p; });
  a += (BATH_FAN_OPTS[r.opts.fan] || {p:0}).p;
  return a;
}

function renderBathRooms(it) {
  const count = bathRooms.length;
  const total = bathRooms.reduce((s,r) => s + calcBathRoomAmt(r), 0);

  let roomCards = '';
  for (let i = 0; i < count; i++) {
    const r = bathRooms[i];
    const roomAmt = calcBathRoomAmt(r);

    // 타입 버튼
    const typeBtns = BATH_TYPES.map(t => `
      <button class="bath-type-btn${r.type===t.key?' active':''}"
        style="${r.type===t.key?'background:'+t.color+';color:#fff;border-color:'+t.color:''}"
        onclick="event.stopPropagation();setBathType(${i},'${t.key}')">
        ${t.label}<br><span class="bath-type-price">${fmt(t.p)}원</span>
      </button>`).join('');

    // 추가 옵션 체크
    const optChecks = BATH_OPTS.map(o => `
      <div class="bath-opt-item${r.opts[o.key]?' on':''}" onclick="event.stopPropagation();toggleBathOpt(${i},'${o.key}')">
        <span class="bath-opt-chk">${r.opts[o.key]?'✓':''}</span>
        <span class="bath-opt-label">${o.label}</span>
        <span class="bath-opt-price">+${fmt(o.p)}</span>
      </div>`).join('');

    // 환풍기 셀렉트
    const fanOpts = BATH_FAN_OPTS.map((f,fi) =>
      `<option value="${fi}" ${r.opts.fan===fi?'selected':''}>` +
      `${f.label}${f.p?` (+${fmt(f.p)}원)`:''}</option>`
    ).join('');

    roomCards += `
      <div class="bath-room-card">
        <div class="bath-room-header">
          <span class="bath-room-label">${i===0?'1번째 욕실 (거실)':i===1?'2번째 욕실 (안방)':(i+1)+'번째 욕실'}</span>
          <span class="bath-room-amt">${fmtW(roomAmt)}</span>
        </div>
        <div class="bath-type-btns">${typeBtns}</div>
        <div class="bath-opts-grid">${optChecks}</div>
        <div class="bath-fan-row">
          <span class="bath-opt-label" style="white-space:nowrap">환풍기</span>
          <select class="sel-input" style="flex:1"
            onclick="event.stopPropagation()"
            onchange="event.stopPropagation();setBathFan(${i},this.value)">${fanOpts}</select>
        </div>
      </div>`;
  }

  return `
    <div class="item item-wide bath-rooms-item">
      <div class="iinfo" style="flex:1">
        <div class="bath-header">
          <div>
            <div class="iname">욕실 수 선택</div>
            <div class="idesc">욕실 수를 선택 후 각각 타입과 옵션을 지정하세요</div>
          </div>
          <div class="bath-counter" onclick="event.stopPropagation()">
            <button class="qbtn" onclick="event.stopPropagation();adjBathCount(-1)">−</button>
            <span class="bath-count-num">${count}</span>
            <button class="qbtn" onclick="event.stopPropagation();adjBathCount(1)">+</button>
            <span class="iunit">실</span>
            ${count > 0 ? `<span class="bath-total-badge">${fmtW(total)}</span>` : ''}
          </div>
        </div>
        ${count > 0 ? `<div class="bath-rooms-grid">${roomCards}</div>` : ''}
      </div>
    </div>`;
}

function adjBathCount(d) {
  const newCount = Math.max(0, bathRooms.length + d);
  while (bathRooms.length < newCount) bathRooms.push({
    type: 'std',
    opts: { faucet:false, shower:false, zendai:false, mirror:false, size:false, elec:false, tub:false, spray:false, fan:0 }
  });
  while (bathRooms.length > newCount) bathRooms.pop();
  requestAnimationFrame(() => { renderItems(); calc(); });
}

function setBathType(idx, type) {
  if (bathRooms[idx]) { bathRooms[idx].type = type; requestAnimationFrame(() => { renderItems(); calc(); }); }
}
function toggleBathOpt(idx, key) {
  if (bathRooms[idx]) { bathRooms[idx].opts[key] = !bathRooms[idx].opts[key]; requestAnimationFrame(() => { renderItems(); calc(); }); }
}
function setBathFan(idx, val) {
  if (bathRooms[idx]) { bathRooms[idx].opts.fan = parseInt(val)||0; calc(); }
}

/* ════════ 카테고리별 기타 / 네고 렌더 ════════ */
function renderCatExtra(it) {
  const st = catExtraState[it.id] || { text:'', amt:0, nego:0 };
  const netAmt = (st.amt||0) - (st.nego||0);
  const hasData = st.amt > 0 || st.nego > 0;

  return `
    <div class="item item-wide cat-extra-item">
      <div class="iinfo" style="flex:1">
        <div class="cat-extra-header">
          <div class="iname" style="font-size:13px">기타 항목 &amp; 네고</div>
          ${hasData ? `<span class="cat-extra-net ${netAmt<0?'neg':'pos'}">${netAmt>=0?'+':''}${fmt(netAmt)}원</span>` : ''}
        </div>
        <div class="cat-extra-grid" onclick="event.stopPropagation()">

          <!-- 기타 금액 입력 -->
          <div class="cat-extra-col">
            <div class="cat-extra-label">📝 기타 항목</div>
            <input class="cat-extra-text" type="text" placeholder="항목명 메모 (예: 도어락 교체)"
              value="${st.text||''}"
              oninput="event.stopPropagation();setCatExtraText('${it.id}',this.value)">
            <div class="cat-extra-amt-row">
              <span class="cat-extra-sign">+</span>
              <input class="cat-extra-num" type="number" min="0" placeholder="금액 입력"
                value="${st.amt > 0 ? st.amt : ''}"
                oninput="event.stopPropagation();setCatExtraAmt('${it.id}',this.value)">
              <span class="iunit">원</span>
            </div>
          </div>

          <!-- 네고 입력 -->
          <div class="cat-extra-col">
            <div class="cat-extra-label" style="color:#e05c5c">🔻 네고 / 할인</div>
            <input class="cat-extra-text" type="text" placeholder="네고 사유 (예: 현장 특이사항)"
              value="${st.negoText||''}"
              oninput="event.stopPropagation();setCatExtraNegoText('${it.id}',this.value)">
            <div class="cat-extra-amt-row">
              <span class="cat-extra-sign" style="color:#e05c5c">−</span>
              <input class="cat-extra-num nego" type="number" min="0" placeholder="할인 금액"
                value="${st.nego > 0 ? st.nego : ''}"
                oninput="event.stopPropagation();setCatExtraNego('${it.id}',this.value)">
              <span class="iunit">원</span>
            </div>
          </div>

        </div>
      </div>
    </div>`;
}

function setCatExtraText(id, v) {
  if (!catExtraState[id]) catExtraState[id] = { text:'', amt:0, nego:0 };
  catExtraState[id].text = v;
  calc(); // 텍스트 변경도 견적서에 반영
}
function setCatExtraNegoText(id, v) {
  if (!catExtraState[id]) catExtraState[id] = { text:'', amt:0, nego:0 };
  catExtraState[id].negoText = v;
}
function setCatExtraAmt(id, v) {
  if (!catExtraState[id]) catExtraState[id] = { text:'', amt:0, nego:0 };
  const parsed = parseFloat(v);
  // 빈 문자열이나 0이면 완전히 0으로 초기화 (삭제 가능)
  catExtraState[id].amt = (!v || v === '' || isNaN(parsed)) ? 0 : Math.max(0, parsed);
  calc();
}
function setCatExtraNego(id, v) {
  if (!catExtraState[id]) catExtraState[id] = { text:'', amt:0, nego:0 };
  const parsed = parseFloat(v);
  catExtraState[id].nego = (!v || v === '' || isNaN(parsed)) ? 0 : Math.max(0, parsed);
  calc();
}

/* ════════ 섹션 구분선 ════════ */
function renderDivider(it) {
  // data.js에서 label 필드로 구분선 텍스트 커스텀 가능
  const label = it.label || '추가 옵션';
  return `<div class="items-divider" data-id="${it.id}">
    <span class="items-divider-label">${label}</span>
  </div>`;
}

/* ════════ 도배지명 메모 렌더 ════════ */
function renderWallPaperName(it) {
  return `
    <div class="item item-wide wall-paper-name-item" onclick="event.stopPropagation()">
      <div class="iinfo" style="flex:1">
        <div class="wall-paper-header">
          <span class="iname">📋 도배지명 메모</span>
          <span class="idesc">사용할 도배지 브랜드 및 제품명을 입력하세요 (견적서에 포함됩니다)</span>
        </div>
        <input class="wall-paper-input" type="text"
          placeholder="예: 개나리 로하스 / LG 실크벽지 프리미엄 등"
          value="${wallPaperName}"
          oninput="event.stopPropagation();setWallPaperName(this.value)"
          onclick="event.stopPropagation()">
      </div>
    </div>`;
}

function setWallPaperName(v) {
  wallPaperName = v;
  renderQuoteDoc(); // 견적서 즉시 갱신
}

/* ════════ 욕실 철거 렌더 ════════ */
function renderBathDemo(it) {
  const total = (bathDemoState.living ? 800000 : 0) + (bathDemoState.master ? 800000 : 0);
  return `
    <div class="item item-wide bath-rooms-item">
      <div class="iinfo" style="flex:1">
        <div class="bath-header">
          <div>
            <div class="iname">욕실 철거</div>
            <div class="idesc">개소당 800,000원 · 거실/안방 각각 선택</div>
          </div>
          ${total > 0 ? `<span class="bath-total-badge">${fmtW(total)}</span>` : ''}
        </div>
        <div class="bath-demo-grid" onclick="event.stopPropagation()">
          <div class="bath-demo-card${bathDemoState.living?' active':''}"
            onclick="event.stopPropagation();toggleBathDemo('living')">
            <div class="bath-demo-chk">${bathDemoState.living?'✓':''}</div>
            <div class="bath-demo-info">
              <div class="bath-demo-label">1개소 (거실 욕실)</div>
              <div class="bath-demo-price">800,000원</div>
            </div>
          </div>
          <div class="bath-demo-card${bathDemoState.master?' active':''}"
            onclick="event.stopPropagation();toggleBathDemo('master')">
            <div class="bath-demo-chk">${bathDemoState.master?'✓':''}</div>
            <div class="bath-demo-info">
              <div class="bath-demo-label">2개소 (안방 욕실)</div>
              <div class="bath-demo-price">800,000원</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function toggleBathDemo(key) {
  bathDemoState[key] = !bathDemoState[key];
  requestAnimationFrame(() => { renderItems(); calc(); });
}

/* ════════ 화장실 방수 렌더 ════════ */
// 욕실 방수: 1차=20만, 2~3차 단독=40만, 동시선택 시 각 20만
// → 1차만: 20만 / 2~3차만: 40만 / 1차+2~3차: 각20만 (합40만)
// 욕실 방수 상수/함수 제거됨 (stepper 방식으로 대체)




function renderNego(it) {
  return `
    <div class="item item-wide nego-item">
      <div class="nego-icon">%</div>
      <div class="iinfo" style="flex:1">
        <div class="nego-header">
          <div>
            <div class="iname" style="color:#e05c5c">네고 / 할인</div>
            <div class="idesc">마이너스(-) 금액을 입력하면 총 견적에서 차감됩니다</div>
          </div>
          ${negoAmt > 0 ? `<span class="nego-badge">− ${fmt(negoAmt)}원</span>` : ''}
        </div>
        <div class="nego-input-row" onclick="event.stopPropagation()">
          <span class="nego-minus">−</span>
          <input class="nego-input" id="nego-input" type="number" min="0"
            placeholder="할인 금액 입력 (예: 200000)"
            value="${negoAmt || ''}"
            oninput="event.stopPropagation();setNego(this.value)">
          <span class="iunit">원</span>
          ${negoAmt > 0 ? `<button class="nego-clear" onclick="event.stopPropagation();setNego(0);document.getElementById('nego-input').value=''">✕ 취소</button>` : ''}
        </div>
      </div>
    </div>`;
}

function setNego(v) {
  negoAmt = Math.max(0, parseFloat(v) || 0);
  calc();
}

/* ════════ 평수 기반 자동 계산 헬퍼 ════════ */
function getLaborCount(py) {
  if (py <= 21) return 3;
  if (py <= 24) return 4;
  if (py <= 32) return 5;
  if (py <= 40) return 6;
  if (py <= 48) return 7;
  return 8; // 56평+
}

function getWasteCount(py) {
  if (py <= 32) return 2;
  if (py <= 48) return 3;
  return 4;
}

function renderAutoLabor(it, isOn) {
  const py = getPyung();
  const autoCount = getLaborCount(py);
  const s = sel[it.id];
  // 수동 조정값 (0이면 자동)
  const manualAdj = s.val || 0;
  const count = autoCount + manualAdj;
  const amt = count * 250000;

  return `
    <div class="item item-wide auto-item${isOn?' sel':''}" data-id="${it.id}">
      <div class="chk">${isOn?'✓':''}</div>
      <div class="iinfo" style="flex:1">
        <div class="auto-item-header">
          <div>
            <div class="iname">${it.n}</div>
            <div class="idesc">품당 250,000원 · 평수(${py}평) 기준 자동 계산</div>
          </div>
          <div class="auto-result">
            <span class="auto-count-badge">${count}품</span>
            <span class="auto-amt">${isOn ? fmtW(amt) : ''}</span>
          </div>
        </div>
        ${isOn ? `
        <div class="auto-adjust-row" onclick="event.stopPropagation()">
          <span class="auto-base-info">기본 ${autoCount}품 (${py}평 기준)</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--tx2)">품 수 조정</span>
            <button class="qbtn" onclick="event.stopPropagation();adjAutoLabor(-1)">−</button>
            <span class="auto-adj-num">${manualAdj > 0 ? '+'+manualAdj : manualAdj}</span>
            <button class="qbtn" onclick="event.stopPropagation();adjAutoLabor(1)">+</button>
            <span style="font-size:11px;color:var(--tx3)">최종 ${count}품 = ${fmtW(amt)}</span>
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

function renderAutoWaste(it, isOn) {
  const py = getPyung();
  const autoCount = getWasteCount(py);
  const s = sel[it.id];
  const manualAdj = s.val || 0;
  const count = Math.max(1, autoCount + manualAdj);
  const amt = count * 450000;

  return `
    <div class="item item-wide auto-item${isOn?' sel':''}" data-id="${it.id}">
      <div class="chk">${isOn?'✓':''}</div>
      <div class="iinfo" style="flex:1">
        <div class="auto-item-header">
          <div>
            <div class="iname">${it.n}</div>
            <div class="idesc">차량당 450,000원 · 평수(${py}평) 기준 자동 계산</div>
          </div>
          <div class="auto-result">
            <span class="auto-count-badge">${count}대</span>
            <span class="auto-amt">${isOn ? fmtW(amt) : ''}</span>
          </div>
        </div>
        ${isOn ? `
        <div class="auto-adjust-row" onclick="event.stopPropagation()">
          <span class="auto-base-info">기본 ${autoCount}대 (${py}평 기준 · 21~32평 2대 / ~48평 3대 / 이상 4대)</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--tx2)">차량 수 조정</span>
            <button class="qbtn" onclick="event.stopPropagation();adjAutoWaste(-1)">−</button>
            <span class="auto-adj-num">${manualAdj > 0 ? '+'+manualAdj : manualAdj}</span>
            <button class="qbtn" onclick="event.stopPropagation();adjAutoWaste(1)">+</button>
            <span style="font-size:11px;color:var(--tx3)">최종 ${count}대 = ${fmtW(amt)}</span>
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

function adjAutoLabor(d) {
  const s = sel['dem_labor'];
  s.val = (s.val || 0) + d;
  renderItems(); calc();
}
function adjAutoWaste(d) {
  const s = sel['dem_waste'];
  const py = getPyung();
  const autoCount = getWasteCount(py);
  s.val = Math.max(1 - autoCount, (s.val || 0) + d);
  renderItems(); calc();
}

// calcYoungDoorBase 제거됨 (매트 옵션 삭제)


/* ════════ 이벤트 바인딩 — DOMContentLoaded에서 wrap에 딱 한 번 등록 ════════ */
function initItemEvents() {
  document.querySelector('.wrap').addEventListener('click', e => {
    const itemEl = e.target.closest('#content .item[data-id]');
    if (!itemEl) return;
    // 내부 조작 영역 클릭 시 togItem 실행 안 함
    // 내부 조작 영역(버튼/입력/선택) 클릭 시에만 togItem 실행 안 함
    const stopZones = '.qty-row,.floor-demo-grid,.fd-row,.fd-qty,.fd-check,.auto-adjust-row,.bath-demo-grid,.bath-type-btns,.bath-opts-grid,.bath-fan-row,.bath-counter,.cat-extra-grid,.nego-input-row,.client-info-box,.area-row,.summary,.quote-actions,.quote-doc';
    if (e.target.closest(stopZones)) return;
    togItem(itemEl.dataset.id);
  });
}

function togItem(id) {
  const it = findItem(id);
  // cat-extra / bath-demo / bath-water / bath-rooms 는 별도 상태로 관리 → s.on=true 고정
  // 이 타입들은 내부 버튼으로만 동작 — .item 클릭 시 아무것도 안 함
  if (it?.type === 'cat-extra' || it?.type === 'divider' ||
      it?.type === 'nego' || it?.type === 'bath-demo' ||
      it?.type === 'bath-rooms' || it?.type === 'wall-paper-name') return;
  const s = sel[id]; s.on = !s.on;
  if (s.on) {
    s.q = (it?.pyAuto) ? Math.max(1, Math.round(getPyung())) : 1;
    if (it?.type === 'select-price') s.selectIdx = 0;
    if (it?.type === 'auto-labor' || it?.type === 'auto-waste') s.val = 0;
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
      if (it.type === 'divider') return;
      const s = sel[it.id];

      // cat-extra / bath-rooms / bath-water 는 s.on 체크 없이 항상 계산
      if (it.type === 'cat-extra') {
        const st = catExtraState[it.id];
        if (!st) return;
        const extraAmt = st.amt || 0;
        const extraNego = st.nego || 0;
        if (!extraAmt && !extraNego) return;
        if (extraAmt > 0) {
          catMap[catName] = (catMap[catName]||0) + extraAmt;
          baseSub += extraAmt;
          rows.push({ catName, label: st.text || '기타', detail:'직접 입력', qty:1, u:'식', unitP:extraAmt, amt:extraAmt });
        }
        if (extraNego > 0) {
          catMap[catName] = (catMap[catName]||0) - extraNego;
          baseSub -= extraNego;
          rows.push({ catName, label: `네고 (${st.negoText||'할인'})`, detail:'차감', qty:1, u:'식', unitP:-extraNego, amt:-extraNego });
        }
        return;
      }

      if (it.type === 'bath-rooms') {
        const BLABELS = { std:'베이직형', high:'스탠다드형', prem:'프리미엄형' };
        bathRooms.forEach((r, i) => {
          const a = calcBathRoomAmt(r);
          if (!a) return;
          const BPRICES_B = { std:2900000, high:4300000, prem:5200000 };
          const baseA = BPRICES_B[r.type] || 0;
          rows.push({ catName, label:`욕실 ${i+1} — ${BLABELS[r.type]}`, detail:'기본', qty:1, u:'실', unitP:baseA, amt:baseA });
          BATH_OPTS.forEach(o => {
            if (r.opts[o.key]) rows.push({ catName, label:`욕실 ${i+1} — ${o.label}`, detail:'', qty:1, u:'개', unitP:o.p, amt:o.p });
          });
          const fan = BATH_FAN_OPTS[r.opts.fan];
          if (fan && fan.p > 0) rows.push({ catName, label:`욕실 ${i+1} — ${fan.label}`, detail:'환풍기', qty:1, u:'개', unitP:fan.p, amt:fan.p });
          // ★ catMap/baseSub 합산
          catMap[catName] = (catMap[catName]||0) + a;
          baseSub += a;
        });
        return;
      }



      if (!s?.on) return;

      let amt = 0;

      if (it.type === 'bath-demo') {
        // 욕실 철거 계산
        const BATH_DEMO_P = 800000;
        if (bathDemoState.living) {
          catMap[catName] = (catMap[catName]||0) + BATH_DEMO_P;
          baseSub += BATH_DEMO_P;
          rows.push({ catName, label:'욕실 철거 — 거실 욕실', detail:'올철거', qty:1, u:'개소', unitP:BATH_DEMO_P, amt:BATH_DEMO_P });
        }
        if (bathDemoState.master) {
          catMap[catName] = (catMap[catName]||0) + BATH_DEMO_P;
          baseSub += BATH_DEMO_P;
          rows.push({ catName, label:'욕실 철거 — 안방 욕실', detail:'올철거', qty:1, u:'개소', unitP:BATH_DEMO_P, amt:BATH_DEMO_P });
        }
        return;
      }

      let unitP = it.p || 0;
      let detail = it.d;
      let qtyLabel = s.q;

      if (it.type === 'auto-labor') {
        const py = getPyung();
        const autoCount = getLaborCount(py);
        const adj = s.val || 0;
        const count = autoCount + adj;
        const a = count * 250000;
        if (!a) return;
        catMap[catName] = (catMap[catName]||0) + a;
        baseSub += a;
        rows.push({ catName, label:'인건비', detail:`${py}평 기준 ${count}품`, qty:count, u:'품', unitP:250000, amt:a });
        return;
      }

      if (it.type === 'auto-waste') {
        const py = getPyung();
        const autoCount = getWasteCount(py);
        const adj = s.val || 0;
        const count = Math.max(1, autoCount + adj);
        const a = count * 450000;
        if (!a) return;
        catMap[catName] = (catMap[catName]||0) + a;
        baseSub += a;
        rows.push({ catName, label:'폐기물', detail:`${py}평 기준 ${count}대`, qty:count, u:'대', unitP:450000, amt:a });
        return;
      }


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

  // ── 화장실 방수 계산 ──
  if (bathWaterList.length > 0) {
    bathWaterList.forEach((r, i) => {
      const t = BATH_WATER_TYPES.find(t=>t.key===r.type);
      if (!t) return;
      const a = t.p;
      catMap['설비'] = (catMap['설비']||0) + a;
      baseSub += a;
      rows.push({ catName:'설비', label:`화장실 방수 ${i+1}개소 — ${t.label}`, detail:t.desc, qty:1, u:'개소', unitP:a, amt:a });
    });
  }

  // ── 욕실 방수 1차+2~3차 동시 선택 시 할인 처리 ──
  // 1차(plm_water1) + 2~3차(plm_water2) 동시 선택 시: 2~3차 400,000 → 200,000 (개소당 -20만)
  const w1 = sel['plm_water1'];
  const w2 = sel['plm_water2'];
  if (w1?.on && w2?.on) {
    const comboQty = Math.min(w1.q, w2.q);
    const discount = comboQty * 200000; // 개소당 20만 할인
    if (discount > 0) {
      catMap['설비'] = (catMap['설비'] || 0) - discount;
      baseSub -= discount;
      rows.push({ catName:'설비', label:'욕실 방수 동시선택 할인', detail:`1차+2~3차 ${comboQty}개소`, qty:comboQty, u:'개소', unitP:-200000, amt:-discount });
    }
  }

  // ── 우수관 방수 + 교체 동시 선택 시 세트 할인 ──
  // 세트: 방수(25만) + 교체(35만) = 60만 → 50만 (개소당 10만 할인)
  // 수량 다를 경우: 최소값만큼 세트, 나머지는 개별 단가 적용
  // 예) 방수2 + 교체1 → 1세트(50만) + 방수1개(25만) = 75만
  const drain1 = sel['plm_drain1'];
  const drain2 = sel['plm_drain2'];
  if (drain1?.on && drain2?.on) {
    const setQty   = Math.min(drain1.q, drain2.q); // 세트 적용 수량
    const extra1   = drain1.q - setQty;             // 방수 단독 잉여
    const extra2   = drain2.q - setQty;             // 교체 단독 잉여

    // 현재 rows에 이미 개별 단가로 계산된 금액이 들어있음
    // 실제 내야 할 금액으로 보정
    const currentCharged = (250000 * drain1.q) + (350000 * drain2.q);
    const correctAmt     = (500000 * setQty) + (250000 * extra1) + (350000 * extra2);
    const discount       = currentCharged - correctAmt;

    if (discount > 0) {
      catMap['설비'] = (catMap['설비'] || 0) - discount;
      baseSub -= discount;
      rows.push({
        catName: '설비',
        label:  `우수관 세트 할인 (${setQty}세트)`,
        detail: `방수+교체 세트 500,000원/세트`,
        qty: setQty, u: '세트', unitP: -100000, amt: -discount
      });
    }
  }

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
  const nego = negoAmt || 0;
  const subAfterNego = Math.max(0, sub - nego);
  const vatAfterNego = Math.round(subAfterNego * 0.1);
  const totalAfterNego = subAfterNego + vatAfterNego;
  return { sub, vat, total, catMap, rows, nego, subAfterNego, vatAfterNego, totalAfterNego };
}

/* ════════ 요약 렌더 ════════ */
function calc() {
  const py = getPyung();
  document.getElementById('sqm').textContent = `(약 ${Math.round(py*3.3)}㎡)`;
  const { sub, vat, total, catMap, rows, nego, subAfterNego, vatAfterNego, totalAfterNego } = calcTotals();
  renderTabs(); // 금액 변경 시 탭 배지 갱신
  const perPyAfter = py > 0 ? Math.round(subAfterNego/py) : 0;
  // 소계카드: 네고 있으면 취소선 + 할인 표시
  const subCardInner = nego > 0
    ? `<span style="text-decoration:line-through;color:var(--tx3);font-size:14px">${fmt(sub)}원</span><span class="nego-sub">− ${fmt(nego)}원 할인</span>`
    : `${fmt(sub)}원`;

  document.getElementById('scards').innerHTML = `
    <div class="scard">
      <div class="slabel">소계 (VAT 제외)</div>
      <div class="sval">${subCardInner}</div>
    </div>
    <div class="scard">
      <div class="slabel">부가세 10%</div>
      <div class="sval">${fmt(vatAfterNego)}원</div>
    </div>
    <div class="scard">
      <div class="slabel">합계 (VAT 포함)</div>
      <div class="sval hi">${fmt(totalAfterNego)}원</div>
    </div>
    <div class="scard">
      <div class="slabel">평당 단가</div>
      <div class="sval">${py>0?fmt(perPyAfter)+'원':'-'}</div>
    </div>`;

  const entries = Object.entries(catMap).filter(([,v])=>v>0);
  if (!entries.length) {
    document.getElementById('srows').innerHTML = '<p class="empty">항목을 선택하면 견적이 표시됩니다.</p>';
  } else {
    const rowsHtml = entries.map(([k,v]) =>
      `<div class="srow"><span class="lbl">${k}</span><span class="val">${fmt(v)}원</span></div>`
    ).join('');
    const negoHtml = nego > 0
      ? `<div class="srow nego-row"><span class="lbl">🔻 네고 / 할인</span><span class="val nego-val">− ${fmt(nego)}원</span></div>`
      : '';
    const totHtml = `<div class="srow tot"><span class="lbl">최종 합계</span><span class="val" style="color:var(--info-tx)">${fmt(subAfterNego)}원</span></div>`;
    document.getElementById('srows').innerHTML = rowsHtml + negoHtml + totHtml;
  }

  renderQuoteDoc({ sub, vat, total, catMap, rows, nego, subAfterNego, vatAfterNego, totalAfterNego });
}

/* ════════ 견적서 렌더 ════════ */
function renderQuoteDoc(totals) {
  if (!totals) totals = calcTotals();
  const { sub, vat, total, catMap, rows, nego, subAfterNego, vatAfterNego, totalAfterNego } = totals;

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
    // 도배지명 메모가 있으면 도배 카테고리 첫 항목에 추가
    grouped[r.catName].push(r);
  });

  // ── 상세 견적서 tbody ──
  let detailHtml = '';
  Object.entries(grouped).forEach(([cat, list]) => {
    const catTotal = list.reduce((s,r)=>s+r.amt,0);
    detailHtml += `<tr class="qrow-cat">
      <td>${cat}</td><td colspan="4"></td>
      <td class="q-amount">${fmt(catTotal)}</td></tr>`;
    list.forEach((r, ri) => {
      const up = r.unitP ? fmt(r.unitP) : '-';
      // 도배 카테고리 첫 항목에 도배지명 표시
      const wallNote = (cat === '도배' && ri === 0 && wallPaperName)
        ? `<br><span class="q-detail" style="color:#2563eb;font-weight:600">📋 도배지: ${wallPaperName}</span>` : '';
      detailHtml += `<tr>
        <td></td>
        <td class="q-name">${r.label}${r.detail?`<br><span class="q-detail">${r.detail}</span>`:''}${wallNote}</td>
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

  ['qf-sub-d','qf-sub-s'].forEach(id => document.getElementById(id).textContent = fmtW(sub) + (nego>0?` (네고 − ${fmt(nego)}원)`:''));
  ['qf-vat-d','qf-vat-s'].forEach(id => document.getElementById(id).textContent = fmtW(vatAfterNego));
  ['qf-total-d','qf-total-s'].forEach(id => document.getElementById(id).textContent = fmtW(totalAfterNego));

  ['qc-deposit-d','qc-deposit-s'].forEach(id => document.getElementById(id).textContent = fmtW(Math.round(totalAfterNego*0.2)));
  ['qc-mid-d','qc-mid-s'].forEach(id => document.getElementById(id).textContent = fmtW(Math.round(totalAfterNego*0.3)));
  ['qc-final-d','qc-final-s'].forEach(id => document.getElementById(id).textContent = fmtW(Math.round(totalAfterNego*0.5)));
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
  const { sub, vat, total, rows, nego, subAfterNego, vatAfterNego, totalAfterNego } = calcTotals();
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
  if (nego > 0) d.push(['네고 / 할인 (차감)','','','','', -nego]);
  d.push(['부가세 (10%)','','','','',vatAfterNego]);
  d.push(['총 공사 금액','','','','',totalAfterNego]);
  d.push([]);
  d.push(['계약금 (20%)', Math.round(totalAfterNego*0.2), '', '1차 중도금 (30%)', Math.round(totalAfterNego*0.3), '잔금 (50%)']);
  d.push(['', '', '', '', '', Math.round(totalAfterNego*0.5)]);
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
  bathRooms = [];
  negoAmt = 0;
  bathWaterList = [];
  bathDemoState = { living: false, master: false };
  wallPaperName = '';
  Object.keys(catExtraState).forEach(id => { catExtraState[id] = { text:'', amt:0, nego:0 }; });
  document.getElementById('nego-input') && (document.getElementById('nego-input').value = '');
  renderItems(); calc();
}
