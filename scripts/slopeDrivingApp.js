import {
  AUTO_BRAKE_SPRITE_FRAMES,
  CAB,
  DIRECTION_POSITIONS,
  INDEPENDENT_BRAKE_POSITIONS,
  PROJECT_ID,
  getScenario,
} from './slopeDrivingConfig.js';
import { SlopeDrivingSimulation } from './slopeDrivingSimulation.js';
import { SlopeDrivingAssessment } from './slopeDrivingAssessment.js';
import { SlopeDrivingScene } from './slopeDrivingScene.js';
import { SlopeLkjRuntime } from './slopeLkjRuntime.js';

const $ = (selector) => document.querySelector(selector);
const pct = (value, total) => `${value / total * 100}%`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const views = { front: 'HXD1C_front.png', left: 'HXD1C_left_full.png', right: 'HXD1C_right_full.png', rearLeft: 'HXD1C_left.png', rearRight: 'HXD1C_right.png' };
const brakeNames = ['运转位', '初制位', '常用Ⅱ', '常用Ⅲ', '常用Ⅳ', '紧急位'];

let simulation = new SlopeDrivingSimulation('uphill');
let assessment = new SlopeDrivingAssessment(simulation);
let routeScene = null;
let lkj = new SlopeLkjRuntime($('#lkj-dock'), simulation);
let selectedView = 'front';
let lastFrame = performance.now();
let resultShown = false;
let activeDrag = null;
let suppressControlClickUntil = 0;
let audioContext = null;
let lastAlertLevel = 'normal';
let cabNotice = '';
let cabNoticeUntil = 0;
let hornPointerId = null;
let pendingScenarioId = 'uphill';
const overlay = $('#cab-overlay');
const elements = {};
const hornAudio = new Audio('./assets/audio/HXD1C-horn.wav');
hornAudio.preload = 'auto';
hornAudio.loop = true;

function makeSprite(id, image, x, y, width, height, columns, rows, label) {
  const element = document.createElement('div');
  element.className = `sprite ${id}`;
  element.setAttribute('aria-label', label);
  Object.assign(element.style, { left: pct(x, CAB.width), top: pct(y, CAB.height), width: pct(width, CAB.width), height: pct(height, CAB.height), backgroundImage: `url("./assets/archive-cabview/${image}")`, backgroundSize: `${columns * 100}% ${rows * 100}%` });
  overlay.append(element);
  return element;
}

function makeBadge(label, x, y, width = 82) {
  const element = document.createElement('div');
  element.className = 'control-position-badge';
  element.setAttribute('aria-live', 'polite');
  element.innerHTML = `<b>${label}</b><span>—</span>`;
  Object.assign(element.style, { left: pct(x, CAB.width), top: pct(y, CAB.height), width: pct(width, CAB.width) });
  overlay.append(element);
  return element;
}

function makeTouchTarget(id, x, y, width, height, label) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'touch-target';
  element.dataset.dragTarget = id;
  element.setAttribute('aria-label', label);
  Object.assign(element.style, { left: pct(x, CAB.width), top: pct(y, CAB.height), width: pct(width, CAB.width), height: pct(height, CAB.height) });
  overlay.append(element);
  return element;
}

function makeNeedle(id, image, x, y, width, height, pivot, start, end, className = '') {
  const element = document.createElement('img');
  element.className = `needle ${className}`;
  element.dataset.id = id;
  element.dataset.start = start;
  element.dataset.end = end;
  element.src = `./assets/archive-cabview/${image}`;
  element.alt = '';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    left: pct(x, CAB.width), top: pct(y, CAB.height), width: pct(width, CAB.width), height: pct(height, CAB.height),
    transformOrigin: `50% ${pivot / height * 100}%`,
  });
  overlay.append(element);
  return element;
}

function makeBar(id, x, y, width, height, color = '#5dffd5') {
  const element = document.createElement('div');
  element.className = 'gauge-bar';
  element.dataset.id = id;
  Object.assign(element.style, { left: pct(x, CAB.width), top: pct(y, CAB.height), width: pct(width, CAB.width), height: pct(height, CAB.height), background: color });
  overlay.append(element);
  return element;
}

function makeDigital(id, x, y, width, height, className = '') {
  const element = document.createElement('div');
  element.className = `digital ${className}`;
  element.dataset.id = id;
  Object.assign(element.style, { left: pct(x, CAB.width), top: pct(y, CAB.height), width: pct(width, CAB.width), height: pct(height, CAB.height) });
  overlay.append(element);
  return element;
}

function setNeedle(element, value, maximum) {
  const ratio = clamp((Number(value) || 0) / maximum, 0, 1);
  const start = Number(element.dataset.start);
  const end = Number(element.dataset.end);
  element.style.transform = `rotate(${start + (end - start) * ratio}deg)`;
}

function showCabNotice(message, duration = 3200) {
  cabNotice = message;
  cabNoticeUntil = performance.now() + duration;
}

function makePhysical(label, x, y, width, height, handler, className = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `physical-control ${className}`;
  element.setAttribute('aria-label', label);
  Object.assign(element.style, { left: pct(x, CAB.width), top: pct(y, CAB.height), width: pct(width, CAB.width), height: pct(height, CAB.height) });
  element.addEventListener('click', handler);
  overlay.append(element);
  return element;
}

function frame(element, index, columns, rows) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  element.style.backgroundPosition = `${columns === 1 ? 0 : column / (columns - 1) * 100}% ${rows === 1 ? 0 : row / (rows - 1) * 100}%`;
}

function tractionFrame(value) {
  return value > 0 ? Math.max(0, 7 - Math.min(7, value)) : value === 0 ? 7 : Math.min(15, 7 + Math.min(8, Math.abs(value)));
}

function createCabControls() {
  overlay.replaceChildren();
  elements.auto = makeSprite('auto-brake', 'HXD1C_DZ.png', 35, 341, 45, 60, 4, 3, '自动制动阀');
  elements.independent = makeSprite('independent-brake', 'HXD1C_XZ.png', 138, 341, 35, 60, 4, 3, '单独制动阀');
  elements.traction = makeSprite('traction', 'HXD1C_GL.png', 464, 345, 46, 81, 2, 8, '牵引和电制动手柄');
  elements.direction = makeSprite('direction', 'HXD1C_HX.png', 530, 366, 60, 40, 3, 1, '换向手柄');
  elements.autoBadge = makeBadge('自阀', 20, 311, 80);
  elements.independentBadge = makeBadge('单阀', 116, 311, 78);
  elements.tractionBadge = makeBadge('牵引/电制', 433, 315, 96);
  elements.directionBadge = makeBadge('换向手柄', 521, 331, 88);
  elements.sideRelease = makePhysical('单阀侧压：单独缓解机车制动缸', 116, 405, 82, 27, () => {
    const next = !simulation.state.sideRelease;
    simulation.command('side-release', next);
    showCabNotice(next ? '单阀侧压：机车制动缸单独缓解' : '单阀侧压已释放');
  }, 'side-release-control');
  elements.sideRelease.innerHTML = '<b>单阀侧压</b><span>未动作</span>';
  makePhysical('放大LKJ监控装置', 210, 226, 101, 94, () => lkj.show(), 'lkj-hotspot');
  makePhysical('警惕／复位', 386, 312, 32, 32, () => {
    simulation.command('lkj-ack');
    showCabNotice('警惕／复位已确认');
  }, 'vigilance-hotspot');

  elements.horn = makePhysical('风笛（按住）', 577, 408, 37, 39, null, 'horn-hotspot');
  elements.horn.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    hornPointerId = event.pointerId;
    elements.horn.classList.add('pressed');
    simulation.command('horn-start');
    hornAudio.currentTime = 0;
    hornAudio.play().catch(() => {});
    elements.horn.setPointerCapture?.(event.pointerId);
  });

  elements.speedNeedle = makeNeedle('speed-needle', 'HXD1C_SDZ.png', 493, 277, 3, 18, 2, 68, 300, 'speed');
  elements.mainNeedle = makeNeedle('main-needle', 'HXD1C_red.png', 154, 253, 7, 21, 14, 230, 100);
  elements.pipeNeedle = makeNeedle('pipe-needle', 'HXD1C_black.png', 154, 253, 7, 21, 14, 230, 130);
  elements.eqNeedle = makeNeedle('eq-needle', 'HXD1C_black.png', 162, 295, 7, 21, 14, 224, 136);
  elements.cylNeedle = makeNeedle('cyl-needle', 'HXD1C_red.png', 162, 295, 7, 21, 14, 230, 130);
  elements.mainNeedle2 = makeNeedle('main-needle-2', 'HXD1C_PPW.png', 75, 299, 7, 18, 1, 3, 358);
  elements.pipeNeedle2 = makeNeedle('pipe-needle-2', 'HXD1C_PPR.png', 75, 299, 7, 18, 1, 3, 336);
  elements.eqNeedle2 = makeNeedle('eq-needle-2', 'HXD1C_PPW.png', 36, 312, 7, 18, 1, 3, 336);
  elements.cylNeedle2 = makeNeedle('cyl-needle-2', 'HXD1C_PPR.png', 36, 312, 7, 18, 1, 3, 300);
  elements.voltageBar = makeBar('voltage-bar', 351, 266, 4, 30, '#56e9aa');
  elements.currentBars = [362, 370, 381, 388].map((x, index) => makeBar(`current-${index + 1}`, x, 266, 4, 30));
  elements.speedDigital = makeDigital('speed-digital', 229, 251, 20, 7);
  elements.limitDigital = makeDigital('limit-digital', 244, 251, 20, 7, 'limit');
  elements.clockDigital = makeDigital('clock-digital', 230, 268, 45, 10, 'clock');

  const controls = [
    ['auto', elements.auto, 0, 5, 13],
    ['independent', elements.independent, 0, 5, 13],
    ['traction', elements.traction, -8, 7, 19],
  ];
  for (const [id, sprite, min, max, step] of controls) {
    const begin = (event) => {
      event.preventDefault();
      const stateKey = id === 'auto' ? 'autoBrake' : id === 'independent' ? 'independentBrake' : 'traction';
      activeDrag = { id, stateKey, pointerId: event.pointerId, startY: event.clientY, startValue: simulation.state[stateKey], min, max, step, moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    sprite.addEventListener('pointerdown', begin);
    const zones = {
      auto: [23, 326, 76, 91, '上下拖动自动制动阀'],
      independent: [121, 326, 78, 91, '上下拖动单独制动阀'],
      traction: [447, 326, 82, 116, '上下拖动牵引和电制动手柄'],
    };
    const zone = makeTouchTarget(id, ...zones[id]);
    zone.addEventListener('pointerdown', begin);
    zone.addEventListener('click', () => {
      if (performance.now() < suppressControlClickUntil) return;
      adjustControl(id, 1);
    });
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); adjustControl(id, 1); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); adjustControl(id, -1); }
      if (event.key === 'Home') { event.preventDefault(); simulation.command(id === 'auto' ? 'auto-brake' : id === 'independent' ? 'independent-brake' : 'traction', 0); }
    });
    if (id === 'traction') zone.addEventListener('dblclick', () => simulation.command('traction', 0));
  }
  const directionZone = makeTouchTarget('direction', 516, 350, 90, 72, '切换换向手柄');
  directionZone.addEventListener('click', setDirection);
  elements.traction.addEventListener('dblclick', () => simulation.command('traction', 0));
}

function adjustControl(id, delta) {
  const stateKey = id === 'auto' ? 'autoBrake' : id === 'independent' ? 'independentBrake' : 'traction';
  const type = id === 'auto' ? 'auto-brake' : id === 'independent' ? 'independent-brake' : 'traction';
  const min = id === 'traction' ? -8 : 0;
  const max = id === 'traction' ? 7 : 5;
  simulation.command(type, clamp(simulation.state[stateKey] + delta, min, max));
}

function setDirection() {
  const current = DIRECTION_POSITIONS.indexOf(simulation.state.direction);
  const next = DIRECTION_POSITIONS[(current + 1) % DIRECTION_POSITIONS.length];
  if (!simulation.command('direction', next)) showCabNotice('列车运行中禁止改变换向手柄位置');
}

function stopHorn(event) {
  if (hornPointerId == null) return;
  if (event?.pointerId != null && event.pointerId !== hornPointerId) return;
  hornPointerId = null;
  elements.horn?.classList.remove('pressed');
  hornAudio.pause();
  hornAudio.currentTime = 0;
  simulation.command('horn-stop');
}

window.addEventListener('pointermove', (event) => {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  const change = Math.round((activeDrag.startY - event.clientY) / activeDrag.step);
  if (change !== 0) activeDrag.moved = true;
  const value = clamp(activeDrag.startValue + change, activeDrag.min, activeDrag.max);
  simulation.command(activeDrag.id === 'auto' ? 'auto-brake' : activeDrag.id === 'independent' ? 'independent-brake' : 'traction', value);
});
window.addEventListener('pointerup', (event) => {
  if (activeDrag?.pointerId === event.pointerId) {
    if (activeDrag.moved) suppressControlClickUntil = performance.now() + 250;
    activeDrag = null;
  }
  stopHorn(event);
});
window.addEventListener('pointercancel', (event) => { activeDrag = null; stopHorn(event); });
window.addEventListener('blur', () => stopHorn());
window.addEventListener('pagehide', () => stopHorn());

function chooseScenario(id) {
  const scenario = getScenario(id);
  simulation = new SlopeDrivingSimulation(scenario.id);
  assessment = new SlopeDrivingAssessment(simulation);
  lkj.simulation = simulation;
  lkj.page = 'main';
  lkj.menuIndex = 0;
  routeScene?.resizeObserver?.disconnect();
  routeScene?.renderer?.dispose();
  const oldCanvas = $('#route-scene');
  const newCanvas = oldCanvas.cloneNode(false);
  oldCanvas.replaceWith(newCanvas);
  routeScene = new SlopeDrivingScene(newCanvas, scenario);
  routeScene.loadPromise.catch((error) => { $('#status-message').textContent = `线路加载失败：${error.message}`; });
  simulation.addEventListener('change', render);
  simulation.addEventListener('complete', showResult);
  localStorage.setItem(`${PROJECT_ID}:last-scenario`, scenario.id);
  resultShown = false;
  $('#skill-name').textContent = scenario.shortTitle;
  $('#skill-picker').classList.remove('open');
  $('#result-modal').classList.remove('open');
  $('#lkj-dock').classList.remove('open');
  selectedView = 'front';
  selectView('front');
  simulation.start();
  lastFrame = performance.now();
  render();
}

function openBriefing(id) {
  const scenario = getScenario(id);
  pendingScenarioId = scenario.id;
  $('#briefing-title').textContent = scenario.title;
  $('#briefing-meta').innerHTML = [
    ['编组', scenario.consist],
    ['列车管定压', `${scenario.nominalPipePressure} kPa`],
    ['线路', scenario.routeLabel],
    ['天气/黏着', scenario.weather],
  ].map(([key, value]) => `<div><span>${key}</span><b>${value}</b></div>`).join('');
  $('#briefing-physics').innerHTML = `<b>应当观察到的物理现象：</b>${scenario.physicalExpectation}`;
  $('#briefing-scores').innerHTML = scenario.assessmentItems.map((item) => `<li><b>${item.label}<em>${item.points}分</em></b><span>${item.studentGoal}</span></li>`).join('');
  $('#skill-picker').classList.remove('open');
  $('#briefing-modal').classList.add('open');
  $('#briefing-modal').setAttribute('aria-hidden', 'false');
}

function selectView(view) {
  selectedView = view;
  $('#cab-view').src = `./assets/archive-cabview/${views[view]}`;
  overlay.classList.toggle('hidden', view !== 'front');
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  routeScene?.setView(view);
}

function render() {
  const s = simulation.state;
  const scenario = simulation.scenario;
  frame(elements.auto, AUTO_BRAKE_SPRITE_FRAMES[s.autoBrake], 4, 3);
  frame(elements.independent, s.independentBrake, 4, 3);
  frame(elements.traction, tractionFrame(s.traction), 2, 8);
  frame(elements.direction, s.direction === 'R' ? 0 : s.direction === 'N' ? 1 : 2, 3, 1);
  elements.autoBadge.querySelector('span').textContent = brakeNames[s.autoBrake];
  elements.independentBadge.querySelector('span').textContent = INDEPENDENT_BRAKE_POSITIONS[s.independentBrake];
  elements.tractionBadge.querySelector('span').textContent = s.traction > 0 ? `牵引 ${s.traction}级` : s.traction < 0 ? `电制 ${Math.abs(s.traction)}级` : '零位';
  elements.directionBadge.querySelector('span').textContent = s.direction === 'F' ? '前进位' : s.direction === 'R' ? '后退位' : '中立位';
  elements.sideRelease.classList.toggle('active', s.sideRelease);
  elements.sideRelease.querySelector('span').textContent = s.sideRelease ? '已单缓' : '未动作';
  elements.horn.classList.toggle('active', s.hornActive);

  setNeedle(elements.speedNeedle, s.speed, 158);
  setNeedle(elements.mainNeedle, s.mainReservoir, 1600);
  setNeedle(elements.pipeNeedle, s.trainPipe, 1000);
  setNeedle(elements.eqNeedle, s.equalizingReservoir, 1600);
  setNeedle(elements.cylNeedle, s.brakeCylinder, 1600);
  setNeedle(elements.mainNeedle2, s.mainReservoir, 1600);
  setNeedle(elements.pipeNeedle2, s.trainPipe, 1600);
  setNeedle(elements.eqNeedle2, s.equalizingReservoir, 1600);
  setNeedle(elements.cylNeedle2, s.brakeCylinder, 1600);
  elements.voltageBar.style.transform = 'scaleY(.83)';
  const load = clamp(Math.max(s.tractionCurrent, s.dynamicBrakeForce / 3700) / 100, 0, 1);
  elements.currentBars.forEach((bar, index) => { bar.style.transform = `scaleY(${Math.max(.02, load - index * .025)})`; });
  elements.speedDigital.textContent = s.speed < 10 ? s.speed.toFixed(1) : Math.round(s.speed);
  elements.limitDigital.textContent = Math.round(s.lkjLimit);
  elements.clockDigital.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  $('#phase-name').textContent = s.phase?.label || '坡道考评区段';
  const levelText = { normal: '监控正常', warning: 'LKJ报警', unload: 'LKJ卸载', service: 'LKJ常用制动', emergency: 'LKJ紧急制动' }[s.lkjLevel];
  const normalStatus = `${levelText} · 当前坡度 ${s.grade >= 0 ? '+' : ''}${s.grade.toFixed(1)}‰ · 剩余 ${Math.max(0, scenario.finishDistance - s.distance).toFixed(0)} m`;
  $('#status-message').textContent = performance.now() < cabNoticeUntil ? cabNotice : normalStatus;
  const progress = assessment.progress(s);
  $('#progress-count').textContent = `${progress.done}/${progress.total}`;
  renderProgress(progress);
  renderData(s);
  renderSlopeProfile(s);
  $('#sand').classList.toggle('active', s.sandRemaining > 0);
  $('#adhesion-state').textContent = s.wheelSlip ? '空转' : s.sandRemaining > 0 ? '撒砂中' : '黏着正常';
  $('#adhesion-state').classList.toggle('danger', s.wheelSlip);
  $('#target-speed').textContent = `${s.targetBand[0]}—${s.targetBand[1]} km/h`;
  const trendText = s.speedTrend > .12 ? `上升 ${s.speedTrend.toFixed(2)}` : s.speedTrend < -.12 ? `下降 ${Math.abs(s.speedTrend).toFixed(2)}` : '基本稳定';
  $('#speed-trend').textContent = trendText;
  const shockLabel = s.shockIndex >= 72 ? '明显' : s.shockIndex >= 42 ? '可感' : '低';
  $('#shock-state').textContent = `${shockLabel} ${s.shockIndex.toFixed(0)}`;
  $('#shock-state').className = s.shockIndex >= 72 ? 'danger' : s.shockIndex >= 42 ? 'warning' : '';
  const shake = Math.min(3.2, Math.max(0, s.shockIndex - 34) / 18);
  const shakePhase = s.elapsed * 34;
  $('#stage').style.setProperty('--shock-x', `${Math.sin(shakePhase) * shake}px`);
  $('#stage').style.setProperty('--shock-y', `${Math.cos(shakePhase * .73) * shake * .48}px`);
  if (lkj.open) lkj.render();
  if (s.lkjLevel !== lastAlertLevel && s.lkjLevel !== 'normal') alertTone(s.lkjLevel);
  lastAlertLevel = s.lkjLevel;
}

function renderProgress(progress) {
  $('#progress-list').innerHTML = progress.items.map((item, index) => `<li class="${progress.checks[index] ? 'done' : 'pending'}"><b>${item.label}（${item.points}分）</b><span>${item.studentGoal}</span></li>`).join('');
}

function renderData(s) {
  const rows = [
    ['速度', `${s.speed.toFixed(1)} km/h`], ['控制速度', `${s.lkjLimit.toFixed(0)} km/h`],
    ['当前坡度', `${s.grade >= 0 ? '+' : ''}${s.grade.toFixed(1)}‰`], ['运行距离', `${s.distance.toFixed(0)} m`],
    ['总风缸', `${s.mainReservoir.toFixed(0)} kPa`], ['均衡风缸', `${s.equalizingReservoir.toFixed(0)} kPa`],
    ['首部列车管', `${s.trainPipe.toFixed(0)} kPa`], ['尾部列车管', `${s.tailPipe.toFixed(0)} kPa`],
    ['列车制动缸', `${s.trainBrakeCylinder.toFixed(0)} kPa`], ['机车制动缸', `${s.locomotiveCylinder.toFixed(0)} kPa`],
    ['充风状态', s.rechargeReady ? '充分' : '未充分'], ['目标速度带', `${s.targetBand[0]}—${s.targetBand[1]} km/h`],
    ['牵引力', `${(s.tractionForce / 1000).toFixed(0)} kN`], ['电制动力', `${(s.dynamicBrakeForce / 1000).toFixed(0)} kN`],
    ['空气制动力', `${(s.airBrakeForce / 1000).toFixed(0)} kN`], ['牵引负荷', `${s.tractionCurrent.toFixed(0)}%`],
    ['速度趋势', `${s.speedTrend >= 0 ? '+' : ''}${s.speedTrend.toFixed(2)} km/h/s`], ['纵向冲动', `${s.shockIndex.toFixed(0)} / 100`],
  ];
  $('#run-data').innerHTML = rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('');
}

function renderSlopeProfile(s) {
  const scenario = simulation.scenario;
  const width = 660;
  const height = 82;
  const points = [];
  let elevation = 44;
  points.push(`0,${elevation}`);
  for (const phase of scenario.profile) {
    const segmentWidth = (phase.end - phase.start) / scenario.finishDistance * width;
    const averageGrade = (phase.gradeStart + phase.gradeEnd) / 2;
    elevation -= averageGrade * segmentWidth / 28;
    points.push(`${phase.end / scenario.finishDistance * width},${clamp(elevation, 8, 74)}`);
  }
  const markerX = clamp(s.distance / scenario.finishDistance * width, 0, width);
  $('#slope-profile').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="线路纵断面"><path class="profile-fill" d="M0,82 L${points.join(' L')} L${width},82 Z"/><polyline points="${points.join(' ')}"/><line class="train-marker" x1="${markerX}" x2="${markerX}" y1="2" y2="80"/></svg>`;
}

function showResult() {
  if (resultShown) return;
  resultShown = true;
  const result = assessment.result();
  $('#result-score').textContent = result.score;
  $('#result-grade').textContent = result.summary;
  $('.result-score').classList.toggle('fail', !result.qualified);
  $('#result-title').textContent = simulation.scenario.title;
  $('#result-summary').textContent = `全程 ${(result.distance / 1000).toFixed(2)} km，最高速度 ${result.maximumSpeed.toFixed(1)} km/h，用时 ${result.duration.toFixed(0)} s。${result.redline ? '本次触发安全红线。' : ''}`;
  $('#result-categories').innerHTML = result.categories.map((category) => `<div><span>${category.name}<small>${category.evidence || ''}</small></span><b>${category.score}/${category.maximum}</b></div>`).join('');
  $('#result-modal').classList.add('open');
  $('#result-modal').setAttribute('aria-hidden', 'false');
}

function alertTone(level) {
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = level === 'emergency' ? 880 : level === 'service' ? 720 : 560;
    gain.gain.setValueAtTime(.05, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .22);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .23);
  } catch { /* 首次用户手势前浏览器可能禁止音频。 */ }
}

function togglePanel(panel) {
  document.querySelectorAll('.side-panel').forEach((item) => {
    const open = item === panel && !item.classList.contains('open');
    item.classList.toggle('open', open);
    item.setAttribute('aria-hidden', String(!open));
  });
}

function animationFrame(now) {
  const dt = Math.min(.08, (now - lastFrame) / 1000);
  lastFrame = now;
  simulation.tick(dt);
  if (routeScene) {
    routeScene.update(simulation.state.distance, simulation.state.speed, selectedView);
    routeScene.render();
  }
  requestAnimationFrame(animationFrame);
}

createCabControls();
document.querySelectorAll('[data-scenario]').forEach((button) => button.addEventListener('click', () => openBriefing(button.dataset.scenario)));
$('#briefing-back').addEventListener('click', () => { $('#briefing-modal').classList.remove('open'); $('#skill-picker').classList.add('open'); });
$('#briefing-start').addEventListener('click', () => { $('#briefing-modal').classList.remove('open'); chooseScenario(pendingScenarioId); });
$('#callout').addEventListener('click', () => simulation.command('callout'));
$('#tail-query').addEventListener('click', () => simulation.command('tail-query'));
$('#sand').addEventListener('click', () => simulation.command('sand'));
$('#progress-toggle').addEventListener('click', () => togglePanel($('#progress-panel')));
$('#rules-toggle').addEventListener('click', () => togglePanel($('#rules-panel')));
$('#data-toggle').addEventListener('click', () => togglePanel($('#data-panel')));
$('#view-toggle').addEventListener('click', () => $('#view-menu').classList.toggle('open'));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { selectView(button.dataset.view); $('#view-menu').classList.remove('open'); }));
document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', () => togglePanel(button.closest('.side-panel'))));
$('#fullscreen').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : $('#stage').requestFullscreen());
$('#retry').addEventListener('click', () => chooseScenario(simulation.state.scenarioId));
$('#choose-skill').addEventListener('click', () => { $('#result-modal').classList.remove('open'); $('#skill-picker').classList.add('open'); });
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { document.querySelectorAll('.side-panel').forEach((panel) => panel.classList.remove('open')); $('#view-menu').classList.remove('open'); lkj.close(); }
  if (event.key.toLowerCase() === 's') simulation.command('sand');
});

window.__slopeDriving = { get simulation() { return simulation; }, get assessment() { return assessment; }, chooseScenario, openBriefing };
render();
requestAnimationFrame(animationFrame);
