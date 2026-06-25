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
let bathWaterList = [];
// 욕실 철거: { living: false, master: false } — 거실/안방 각각
let bathDemoState = { living: false, master: false };
// 카테고리별 기타/네고: { [id]: { text:'', amt:0, nego:0 } }
const catExtraState = {};

function initSel() {
  Object.values(DATA).forEach(cat =>
    cat.items.forEach(it => {
      // bath-demo/water/rooms/cat-extra 는 항상 on=true (별도 상태로 관리)
      const alwaysOn = ['bath-demo','bath-water','bath-rooms','cat-extra','divider'].includes(it.type);
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
  // onclick 인라인 사용 — addEventListener는 탭 재렌더 시 중복 등록 문제 발생
  document.getElementById('tabs').innerHTML = Object.keys(DATA)
    .map(c => `<div class="tab${c === curCat ? ' on' : ''}" onclick="switchTab('${c}')">${c}</div>`).join('');
}

function switchTab(cat) {
  curCat = cat;
  renderTabs();
  renderItems();
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

  if (it.type === 'bath-rooms') return renderBathRooms(it);
  if (it.type === 'auto-labor') return renderAutoLabor(it, isOn);
  if (it.type === 'auto-waste') return renderAutoWaste(it, isOn);
  if (it.type === 'nego') return renderNego(it);
  if (it.type === 'bath-water') return renderBathWater(it);
  if (it.type === 'bath-demo') return renderBathDemo(it);
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
      <label class="bath-opt-item${r.opts[o.key]?' on':''}" onclick="event.stopPropagation();toggleBathOpt(${i},'${o.key}')">
        <span class="bath-opt-chk">${r.opts[o.key]?'✓':''}</span>
        <span class="bath-opt-label">${o.label}</span>
        <span class="bath-opt-price">+${fmt(o.p)}</span>
      </label>`).join('');

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
    <div class="item item-wide bath-rooms-item" onclick="event.stopPropagation()">
      <div class="iinfo" style="flex:1">
        <div class="bath-header">
          <div>
            <div class="iname">욕실 수 선택</div>
            <div class="idesc">욕실 수를 선택 후 각각 타입과 옵션을 지정하세요</div>
          </div>
          <div class="bath-counter">
            <button class="qbtn" onclick="adjBathCount(-1)">−</button>
            <span class="bath-count-num">${count}</span>
            <button class="qbtn" onclick="adjBathCount(1)">+</button>
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
  renderItems(); calc();
}

function setBathType(idx, type) {
  if (bathRooms[idx]) { bathRooms[idx].type = type; renderItems(); calc(); }
}
function toggleBathOpt(idx, key) {
  if (bathRooms[idx]) { bathRooms[idx].opts[key] = !bathRooms[idx].opts[key]; renderItems(); calc(); }
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
    <div class="item item-wide cat-extra-item" onclick="event.stopPropagation()">
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

/* ════════ 욕실 철거 렌더 ════════ */
function renderBathDemo(it) {
  const total = (bathDemoState.living ? 800000 : 0) + (bathDemoState.master ? 800000 : 0);
  return `
    <div class="item item-wide bath-rooms-item" onclick="event.stopPropagation()">
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
  renderItems(); calc();
}

/* ════════ 화장실 방수 렌더 ════════ */
// 욕실 방수: 1차=20만, 2~3차 단독=40만, 동시선택 시 각 20만
// → 1차만: 20만 / 2~3차만: 40만 / 1차+2~3차: 각20만 (합40만)
const BATH_WATER_P1 = 200000;   // 1차 방수
const BATH_WATER_P2_SOLO = 400000; // 2~3차 단독
const BATH_WATER_P2_COMBO = 200000; // 2~3차 동시 (1차와 함께)

function calcBathWaterAmt(r) {
  if (r.has1st && r.has2nd) return BATH_WATER_P1 + BATH_WATER_P2_COMBO;
  if (r.has1st) return BATH_WATER_P1;
  if (r.has2nd) return BATH_WATER_P2_SOLO;
  return 0;
}

function renderBathWater(it) {
  const count = bathWaterList.length;
  const total = bathWaterList.reduce((s,r) => s + calcBathWaterAmt(r), 0);

  let cards = '';
  for (let i = 0; i < count; i++) {
    const r = bathWaterList[i];
    const roomAmt = calcBathWaterAmt(r);
    const roomLabel = i===0?'1개소 (거실 욕실)':i===1?'2개소 (안방 욕실)':`${i+1}번째 개소`;

    // 1차+2~3차 동시선택 여부에 따른 안내
    const comboNote = (r.has1st && r.has2nd)
      ? `<span style="font-size:10px;color:var(--info-tx);margin-left:6px">동시선택 할인 적용</span>` : '';

    cards += `
      <div class="bath-water-card">
        <div class="bath-room-header">
          <span class="bath-room-label">${roomLabel}</span>
          <span class="bath-room-amt">${roomAmt > 0 ? fmtW(roomAmt) : '미선택'}</span>
        </div>
        <div class="bath-water-opts" onclick="event.stopPropagation()">
          <label class="bath-water-opt${r.has1st?' on':''}" onclick="event.stopPropagation();toggleBathWater(${i},'1st')">
            <span class="bath-opt-chk">${r.has1st?'✓':''}</span>
            <span class="bath-opt-label">1차 방수</span>
            <span class="bath-opt-price">200,000원</span>
          </label>
          <label class="bath-water-opt${r.has2nd?' on':''}" onclick="event.stopPropagation();toggleBathWater(${i},'2nd')">
            <span class="bath-opt-chk">${r.has2nd?'✓':''}</span>
            <span class="bath-opt-label">2~3차 방수${r.has1st?'':' (단독 40만)'}</span>
            <span class="bath-opt-price">${r.has1st?'200,000원':'400,000원'}</span>
          </label>
        </div>
        ${comboNote}
      </div>`;
  }

  return `
    <div class="item item-wide bath-rooms-item" onclick="event.stopPropagation()">
      <div class="iinfo" style="flex:1">
        <div class="bath-header">
          <div>
            <div class="iname">욕실 방수</div>
            <div class="idesc">1차 20만 · 2~3차 단독 40만 · 동시선택 각 20만</div>
          </div>
          <div class="bath-counter">
            <button class="qbtn" onclick="adjBathWater(-1)">−</button>
            <span class="bath-count-num">${count}</span>
            <button class="qbtn" onclick="adjBathWater(1)">+</button>
            <span class="iunit">개소</span>
            ${count > 0 ? `<span class="bath-total-badge">${fmtW(total)}</span>` : ''}
          </div>
        </div>
        ${count > 0 ? `<div class="bath-rooms-grid">${cards}</div>` : ''}
      </div>
    </div>`;
}

function adjBathWater(d) {
  const newCount = Math.max(0, bathWaterList.length + d);
  while (bathWaterList.length < newCount) bathWaterList.push({ has1st: false, has2nd: false });
  while (bathWaterList.length > newCount) bathWaterList.pop();
  renderItems(); calc();
}

function toggleBathWater(idx, key) {
  if (!bathWaterList[idx]) return;
  if (key === '1st') bathWaterList[idx].has1st = !bathWaterList[idx].has1st;
  if (key === '2nd') bathWaterList[idx].has2nd = !bathWaterList[idx].has2nd;
  renderItems(); calc();
}

/* ════════ 네고 / 할인 렌더 ════════ */
function renderNego(it) {
  return `
    <div class="item item-wide nego-item" onclick="event.stopPropagation()">
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


/* ════════ 이벤트 바인딩 ════════ */
function bindItemEvents() {
  // content innerHTML 교체로 매번 새 DOM이 생성되므로 리스너 중복 없음
  // 단, 이벤트 위임 방식으로 content에 한 번만 등록
  const contentEl = document.getElementById('content');
  // 기존 리스너 제거를 위해 clone으로 교체
  const newContent = contentEl.cloneNode(true);
  contentEl.parentNode.replaceChild(newContent, contentEl);
  newContent.addEventListener('click', e => {
    const itemEl = e.target.closest('.item[data-id]');
    if (!itemEl) return;
    if (e.target.closest('.qty-row,.floor-demo-grid,.fd-row,.fd-qty,.fd-check,.bath-rooms-item,.cat-extra-item,.auto-item,.nego-item')) return;
    togItem(itemEl.dataset.id);
  });
}

function togItem(id) {
  const it = findItem(id);
  // cat-extra / bath-demo / bath-water / bath-rooms 는 별도 상태로 관리 → s.on=true 고정
  if (it?.type === 'cat-extra' || it?.type === 'divider') return;
  if (it?.type === 'bath-demo' || it?.type === 'bath-water' || it?.type === 'bath-rooms') {
    // s.on을 true로 고정해서 calcTotals의 s.on 체크를 통과하게 함
    sel[it.id].on = true;
    renderItems(); calc();
    return;
  }
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

      if (it.type === 'bath-water') {
        // 욕실 방수 계산
        const roomNames = ['거실 욕실','안방 욕실'];
        bathWaterList.forEach((r, i) => {
          const roomLabel = roomNames[i] || `${i+1}개소`;
          const a = calcBathWaterAmt(r);
          if (!a) return;
          if (r.has1st) {
            const p1 = BATH_WATER_P1;
            rows.push({ catName, label:`욕실 방수 ${roomLabel} — 1차`, detail:'', qty:1, u:'개소', unitP:p1, amt:p1 });
          }
          if (r.has2nd) {
            const p2 = r.has1st ? BATH_WATER_P2_COMBO : BATH_WATER_P2_SOLO;
            const desc = r.has1st ? '동시선택 할인' : '단독 선택';
            rows.push({ catName, label:`욕실 방수 ${roomLabel} — 2~3차`, detail:desc, qty:1, u:'개소', unitP:p2, amt:p2 });
          }
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

  // ── 우수관 방수 + 교체 동시 선택 시 세트 500,000원 네고 처리 ──
  const drain1 = sel['plm_drain1'];
  const drain2 = sel['plm_drain2'];
  if (drain1?.on && drain2?.on) {
    // 각각 낸 금액 합산
    const paid1 = 250000 * drain1.q;
    const paid2 = 350000 * drain2.q;
    const paidTotal = paid1 + paid2;
    // 세트 금액: 500,000원 (수량 1세트 기준, 추가 개수는 각 단가 적용)
    const setAmt = 500000;
    const discount = paidTotal - setAmt;
    if (discount > 0) {
      // 이미 rows/catMap에 반영된 금액을 보정
      catMap['설비'] = (catMap['설비'] || 0) - discount;
      baseSub -= discount;
      // rows에 할인 행 추가
      rows.push({ catName:'설비', label:'우수관 방수+교체 세트 할인', detail:'동시 선택 시 500,000원 적용', qty:1, u:'세트', unitP:-discount, amt:-discount });
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
  Object.keys(catExtraState).forEach(id => { catExtraState[id] = { text:'', amt:0, nego:0 }; });
  document.getElementById('nego-input') && (document.getElementById('nego-input').value = '');
  renderItems(); calc();
}
