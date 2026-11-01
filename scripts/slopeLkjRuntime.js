import { BRAKE_POSITIONS, LKJ_KEYS } from './slopeDrivingConfig.js';

const pct = (value, total) => `${value / total * 100}%`;
const fmt = (value, digits = 0) => Number(value || 0).toFixed(digits);
const FACE_ROOT = './assets/lkj/native-states/';

const MENU = Object.freeze([
  ['current', '当前揭示'], ['condition', '工况显示'], ['all', '全部揭示'],
  ['equipment', '设备状态'], ['parameters', '设定参数'], ['records', '运行记录'],
  ['return', '返回监控'],
]);

export class SlopeLkjRuntime {
  constructor(root, simulation) {
    this.root = root;
    this.simulation = simulation;
    this.screen = root.querySelector('.lkj-screen');
    this.face = root.querySelector('[data-lkj-face]');
    this.page = 'main';
    this.menuIndex = 0;
    this.notice = '';
    this.open = false;
    this.buildKeys();
    root.querySelector('[data-lkj-close]').addEventListener('click', () => this.close());
  }

  buildKeys() {
    const keypad = this.root.querySelector('.lkj-keypad');
    for (const [id, label, x, y, width, height] of LKJ_KEYS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.key = id;
      button.setAttribute('aria-label', label);
      Object.assign(button.style, { left: pct(x, 800), top: pct(y, 615), width: pct(width, 800), height: pct(height, 615) });
      button.addEventListener('pointerdown', () => button.classList.add('pressed'));
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => button.addEventListener(name, () => button.classList.remove('pressed')));
      button.addEventListener('click', () => this.handleKey(id));
      keypad.append(button);
    }
  }

  show() {
    this.open = true;
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('device-panel-active');
    this.simulation.command('lkj-open');
    this.render();
  }

  close() {
    this.open = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('device-panel-active');
  }

  handleKey(id) {
    if (id === 'alarm') { this.simulation.command('lkj-ack'); this.flash('警惕报警已确认'); return; }
    if (id === 'relief') {
      this.simulation.command('lkj-relief');
      this.flash(this.simulation.state.lkjForcedBrake ? '速度未降至允许值，缓解无效' : '制动输出已缓解');
      return;
    }
    if (id === 'query') { this.page = 'menu'; this.menuIndex = 0; this.render(); return; }
    if (id === 'setting') { this.page = 'parameters'; this.render(); return; }
    if (id === 'dump') { this.page = 'records'; this.render(); return; }
    if (id === 'left') { this.page = this.page === 'main' ? 'main' : 'menu'; this.render(); return; }
    if (id === 'up' && this.page === 'menu') { this.menuIndex = (this.menuIndex - 1 + MENU.length) % MENU.length; this.render(); return; }
    if (id === 'down' && this.page === 'menu') { this.menuIndex = (this.menuIndex + 1) % MENU.length; this.render(); return; }
    if (id === 'confirm' && this.page === 'menu') {
      const page = MENU[this.menuIndex][0];
      this.page = page === 'return' ? 'main' : page;
      this.render();
      return;
    }
    if (id === 'digit-7') { this.flash('开车键有效：坡道运行监控中'); return; }
    if (id === 'unlock') { this.flash('当前无解锁条件'); return; }
    if (id.startsWith('digit-')) { this.flash(`数字键 ${id.slice(6)}`); return; }
    this.flash('该键在当前页面无对应操作');
  }

  flash(message) {
    this.notice = message;
    this.render();
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice = ''; this.render(); }, 1500);
  }

  setFace(file) {
    if (!this.face.src.endsWith(file)) this.face.src = `${FACE_ROOT}${file}`;
  }

  render() {
    const state = this.simulation.state;
    const scenario = this.simulation.scenario;
    if (this.page === 'main') {
      this.setFace('main-blank.png');
      this.screen.innerHTML = this.mainOverlay(state, scenario);
    } else if (this.page === 'menu') {
      this.setFace('query-menu.png');
      this.screen.innerHTML = this.menuOverlay();
    } else if (this.page === 'current' || this.page === 'all') {
      this.setFace('current-reveal.png');
      this.screen.innerHTML = this.revealOverlay(state, scenario);
    } else {
      this.setFace('main-blank.png');
      this.screen.innerHTML = this.detailOverlay(state, scenario);
    }
    if (this.notice) this.screen.insertAdjacentHTML('beforeend', `<div class="lkj-notice">${this.notice}</div>`);
  }

  mainOverlay(state, scenario) {
    const width = 710;
    const height = 320;
    const samples = state.samples.slice(-180);
    const maximum = Math.max(1, ...samples.map((sample) => sample.distance));
    const start = Math.max(0, maximum - 3000);
    const span = Math.max(800, maximum - start);
    const speedPoints = samples.map((sample) => `${((sample.distance - start) / span) * width},${height - sample.speed / 120 * height}`).join(' ');
    const limitPoints = samples.map((sample) => `${((sample.distance - start) / span) * width},${height - sample.limit / 120 * height}`).join(' ');
    return `<div class="lkj-native-main level-${state.lkjLevel}">
      <b class="native-speed">${fmt(state.speed)}</b><b class="native-limit">${fmt(state.lkjLimit)}</b><b class="native-distance">${fmt(Math.max(0, scenario.finishDistance - state.distance))}</b>
      <span class="native-signal">预告</span><span class="native-km">${fmt(state.distance / 1000, 3)}</span><span class="native-clock">${new Date().toLocaleTimeString('zh-CN', { hour12: false })}</span>
      <svg class="native-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline class="limit" points="${limitPoints}"/><polyline class="speed" points="${speedPoints}"/></svg>
      <div class="native-status">${state.phase.label}　${state.grade >= 0 ? '+' : ''}${fmt(state.grade, 1)}‰　尾压${fmt(state.tailPipe)}kPa</div>
    </div>`;
  }

  menuOverlay() {
    const row = Math.floor(this.menuIndex / 2);
    const column = this.menuIndex % 2;
    return `<div class="lkj-menu-cursor" style="--menu-row:${row};--menu-column:${column}">${MENU[this.menuIndex][1]}</div>`;
  }

  revealOverlay(state, scenario) {
    const restriction = scenario.id === 'downhill' ? '8.2 km起限55 km/h' : '无临时限速';
    return `<div class="lkj-reveal-row"><span>1</span><b>${scenario.routeLabel}</b><em>${state.phase.label}　${restriction}　控速${fmt(state.lkjLimit)} km/h</em></div>`;
  }

  detailOverlay(state, scenario) {
    let title = '工况显示';
    let rows = [
      ['速度', `${fmt(state.speed, 1)} km/h`], ['坡度', `${state.grade >= 0 ? '+' : ''}${fmt(state.grade, 1)}‰`],
      ['牵引/电制', `${state.traction} 级`], ['牵引给定', `${state.tractionTargetSpeed || 0} km/h`],
      ['自阀', BRAKE_POSITIONS[state.autoBrake]?.label || '—'], ['列车管', `${fmt(state.trainPipe)} kPa`],
    ];
    if (this.page === 'equipment') {
      title = '设备状态';
      rows = [['LKJ主机', '正常'], ['速度通道', '正常'], ['压力通道', '正常'], ['信号通道', '正常'], ['记录单元', '正常'], ['制动接口', state.lkjForcedBrake ? '输出中' : '正常']];
    }
    if (this.page === 'parameters') {
      title = '设定参数（考评锁定）';
      rows = [['机车', 'HXD1C'], ['车次', '46125'], ['列车类型', scenario.trainType], ['总重', `${fmt(scenario.totalMassKg / 1000)} t`], ['辆数', scenario.id === 'uphill' ? '35' : '53'], ['列车管定压', `${scenario.nominalPipePressure} kPa`]];
    }
    if (this.page === 'records') {
      title = '运行记录';
      rows = state.events.slice(-8).reverse().map((event) => [this.eventLabel(event.type), `${fmt(event.elapsed)}s / ${fmt(event.speed)}km/h`]);
    }
    return `<div class="lkj-native-detail"><header>${title}</header><dl>${rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl><footer>查询键返回菜单　←返回</footer></div>`;
  }

  eventLabel(type) {
    return ({
      'attempt-start': '考评开始', 'auto-brake': '自阀操作', traction: '主手柄操作',
      callout: '呼唤确认', 'tail-query': '列尾查询', sand: '撒砂', 'lkj-level': '监控状态',
      'phase-enter': '进入新区段', 'recharge-ready': '充风完成', 'lkj-ack': '警惕确认',
    })[type] || type;
  }
}
