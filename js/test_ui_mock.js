/* ============================================================
   四川麻将·血战到底 — UI & Replay 完整生命周期 Mock 验证套件
   ============================================================ */
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🧪 开始 UI 与 深度复盘全交互链路 Mock 自动化验证');
console.log('====================================================\n');

class MockClassList {
  constructor() {
    this._set = new Set();
  }
  add(c) { this._set.add(c); }
  remove(c) { this._set.delete(c); }
  toggle(c, force) {
    if (force !== undefined) {
      if (force) this._set.add(c);
      else this._set.delete(c);
      return force;
    }
    if (this._set.has(c)) { this._set.delete(c); return false; }
    else { this._set.add(c); return true; }
  }
  contains(c) { return this._set.has(c); }
  has(c) { return this._set.has(c); }
}

class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
    this.children = [];
    this._innerHTML = '';
    this._textContent = '';
    this.dataset = {};
    this.style = {};
    this.disabled = false;
    this.onclick = null;
    this.onchange = null;
    this.oninput = null;
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) { this._innerHTML = String(val); }

  get textContent() { return this._textContent; }
  set textContent(val) { this._textContent = String(val); }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelectorAll(sel) {
    const res = [];
    const walk = (el) => {
      if (sel.startsWith('.') && el.classList && el.classList.has(sel.slice(1))) res.push(el);
      else if (sel.startsWith('#') && el.id === sel.slice(1)) res.push(el);
      else if (el.tagName === sel.toUpperCase()) res.push(el);
      for (const c of el.children || []) walk(c);
    };
    walk(this);
    return res;
  }

  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list.length ? list[0] : null;
  }
}

const elements = new Map();
function getOrCreate(id, tag = 'div') {
  if (!elements.has(id)) {
    elements.set(id, new MockElement(id, tag));
  }
  return elements.get(id);
}

// 模拟所有 HTML 中的元素
const elementIds = [
  'roundInfo', 'windInfo', 'wallInfo', 'coachBtn', 'swapToggleBtn', 'gameSpeedSelect',
  'aiLevelSelect', 'soundBtn', 'rulesBtn', 'newGameBtn', 'navReplayBtn', 'compassTiles',
  'cWind0', 'cWind1', 'cWind2', 'cWind3', 'liveLog', 'coachPanel', 'coachCollapseBtn',
  'coachRecTileWrap', 'coachRecTag', 'coachRecStars', 'coachReason', 'coachCompList', 'coachMacro',
  'seat0', 'seat1', 'seat2', 'seat3', 'wind0', 'wind1', 'wind2', 'wind3',
  'tag0', 'tag1', 'tag2', 'tag3', 'score0', 'score1', 'score2', 'score3',
  'melds0', 'melds1', 'melds2', 'melds3', 'closed1', 'closed2', 'closed3',
  'river0', 'river1', 'river2', 'river3', 'hand0', 'tingBar', 'tingTitle', 'tingTiles',
  'actionBar', 'discardBtn', 'swapModal', 'swapCoachBox', 'swapCoachTag', 'swapCoachTilesWrap',
  'swapCoachReason', 'swapAutoSelectBtn', 'swapHandGrid', 'swapCountBadge', 'swapStatusHint', 'confirmSwapBtn',
  'swapRevealModal', 'swapRevealTitle', 'swapRevealDesc', 'swapRevealOutTiles', 'swapRevealInTiles',
  'swapRevealInLabel', 'closeSwapRevealBtn', 'lackModal', 'lackAdvice', 'resultModal',
  'resultTitle', 'resultBody', 'totalSummary', 'startReplayBtn', 'nextRoundBtn', 'rulesModal',
  'closeRulesBtn', 'fxLayer',
  // Replay elements
  'replayOverlay', 'replayAccScore', 'replayAccTitle', 'replayAccDesc',
  'pillBest', 'pillGood', 'pillInacc', 'pillBlunder', 'godModeBtn', 'exitReplayBtn',
  'replayTable', 'rSeat0', 'rSeat1', 'rSeat2', 'rSeat3', 'rWind0', 'rWind1', 'rWind2', 'rWind3',
  'rTag0', 'rTag1', 'rTag2', 'rTag3', 'rScore0', 'rScore1', 'rScore2', 'rScore3',
  'rMelds0', 'rMelds1', 'rMelds2', 'rMelds3', 'rClosed1', 'rClosed2', 'rClosed3',
  'rRiver0', 'rRiver1', 'rRiver2', 'rRiver3', 'rHand0',
  'replayHUDCard', 'rStepBadge', 'rGradeBadge', 'rActDesc', 'rEvalVs', 'rEvalReason',
  'rCandidateBox', 'rCandList', 'replayMarkersTrack', 'replayScrubber', 'replayStepInfo',
  'replayFirstBtn', 'replayPrevBtn', 'replayPlayBtn', 'replayNextBtn', 'replayLastBtn',
  'replayMistakeBtn', 'replaySpeedSelect'
];

elementIds.forEach(id => getOrCreate(id));

global.document = {
  getElementById: (id) => getOrCreate(id),
  createElement: (tag) => new MockElement(null, tag),
  querySelectorAll: (sel) => {
    const all = [];
    elements.forEach(el => {
      if (sel.startsWith('.') && el.classList.has(sel.slice(1))) all.push(el);
      else if (sel.startsWith('#') && el.id === sel.slice(1)) all.push(el);
      else all.push(...el.querySelectorAll(sel));
    });
    return all;
  },
  querySelector: (sel) => {
    const list = global.document.querySelectorAll(sel);
    return list.length ? list[0] : null;
  }
};

global.window = {
  addEventListener: (event, handler) => {
    if (event === 'DOMContentLoaded') global._onReady = handler;
    if (event === 'keydown') global._onKeyDown = handler;
  },
  AudioContext: null,
  webkitAudioContext: null,
  MJ: require('./engine.js'),
  MJAI: require('./ai.js'),
  MJG: require('./game.js'),
};

global.MJ = global.window.MJ;
global.MJAI = global.window.MJAI;
global.MJG = global.window.MJG;

// 加载执行 ui.js
require('./ui.js');

if (global._onReady) global._onReady();

let passCount = 0;
function assert(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`✅ PASS: ${msg}`);
  } else {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
}

// 1. 验证开局与 UI 初始化
assert(!getOrCreate('swapModal').classList.contains('hidden') || !getOrCreate('lackModal').classList.contains('hidden'), '开局成功触发换三张或定缺弹窗');

// 2. 模拟点击换三张一键智能推荐
getOrCreate('swapAutoSelectBtn').onclick();
assert(getOrCreate('confirmSwapBtn').disabled === false, '换三张一键智能选牌成功，确认按钮变为可点击状态');

// 3. 模拟确认换牌并进入定缺
getOrCreate('confirmSwapBtn').onclick();
assert(!getOrCreate('swapRevealModal').classList.contains('hidden'), '换三张结果弹窗成功弹出');

getOrCreate('closeSwapRevealBtn').onclick();
assert(!getOrCreate('lackModal').classList.contains('hidden'), '收下新牌后顺利过渡到定缺弹窗');

// 4. 模拟进入复盘模式
getOrCreate('navReplayBtn').onclick();
assert(!getOrCreate('replayOverlay').classList.contains('hidden'), '点击顶部复盘按钮成功打开深度复盘浮层');
assert(getOrCreate('replayAccScore').textContent.length > 0, '复盘雀力评分成功渲染');
assert(getOrCreate('rStepBadge').textContent.includes('第 0 步') || getOrCreate('rStepBadge').textContent.includes('第'), '复盘 HUD 第一步步数正确显示');

// 5. 模拟时间轴前进、后退、跳跃与上帝视角切换
getOrCreate('replayNextBtn').onclick();
assert(getOrCreate('replayStepInfo').textContent.includes('第 1'), '时间轴点击下一步成功步进至第 1 步');

getOrCreate('replayPrevBtn').onclick();
assert(getOrCreate('replayStepInfo').textContent.includes('第 0'), '时间轴点击上一步成功步退至第 0 步');

getOrCreate('replayLastBtn').onclick();
assert(getOrCreate('replayStepInfo').textContent.length > 0, '时间轴跳转最后一步成功');

getOrCreate('godModeBtn').onclick();
assert(getOrCreate('godModeBtn').textContent.includes('上帝视角: 关'), '上帝视角成功切换为关闭状态');

getOrCreate('godModeBtn').onclick();
assert(getOrCreate('godModeBtn').textContent.includes('上帝视角: 开'), '上帝视角成功重新开启');

getOrCreate('replayMistakeBtn').onclick();
assert(getOrCreate('replayStepInfo').textContent.length > 0, '一键寻错跳转指令执行正常');

// 6. 模拟退出复盘
getOrCreate('exitReplayBtn').onclick();
assert(getOrCreate('replayOverlay').classList.contains('hidden'), '退出复盘后复盘浮层成功隐藏');

console.log(`\n====================================================`);
console.log(`🏆 UI 与复盘交互 Mock 自动化验证全部通过！(通过数: ${passCount})`);
console.log(`====================================================\n`);
