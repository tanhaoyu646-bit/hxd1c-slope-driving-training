const CIR_SOURCE = './assets/cir/CIR-simulator.html';
const CIR_WIDTH = 918;
const CIR_HEIGHT = 600;

export class SlopeCirRuntime {
  constructor(root, simulation) {
    this.root = root;
    this.simulation = simulation;
    this.frame = root.querySelector('.cir-frame');
    this.workflow = root.querySelector('.cir-workflow');
    this.bridgeReady = false;
    this.open = false;
    this.notice = '';
    this.pollTimer = null;
    root.querySelector('[data-cir-close]').addEventListener('click', () => this.close());
    this.frame.addEventListener('load', () => this.installBridge());
    window.addEventListener('resize', () => this.fit());
  }

  setSimulation(simulation) {
    this.simulation = simulation;
    this.notice = '';
    this.renderWorkflow();
  }

  show() {
    this.open = true;
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('device-panel-active');
    this.simulation.command('cir-open');
    if (this.frame.getAttribute('src') !== CIR_SOURCE) this.frame.src = CIR_SOURCE;
    this.fit();
    this.ensureBridge();
    this.renderWorkflow();
  }

  close() {
    this.open = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('device-panel-active');
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  fit() {
    const wrap = this.root.querySelector('.cir-frame-wrap');
    const rect = wrap?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;
    const scale = Math.min(rect.width / CIR_WIDTH, rect.height / CIR_HEIGHT);
    this.root.style.setProperty('--cir-scale', String(Math.max(.16, scale)));
  }

  cirWindow() {
    try { return this.frame.contentWindow || null; } catch { return null; }
  }

  installBridge() {
    const target = this.cirWindow();
    let documentRef = null;
    try { documentRef = target?.document; } catch { return; }
    if (!documentRef?.getElementById('mmibody') || typeof target.buttonfix !== 'function') return;
    if (!target.__slopeCirBridge) {
      const original = target.buttonfix;
      target.buttonfix = (...args) => {
        const result = original.apply(target, args);
        this.onDeviceKey(String(args[0] || ''));
        return result;
      };
      target.__slopeCirBridge = true;
    }
    if (Array.isArray(target.mmiinfo)) {
      target.mmiinfo[0] = '46125';
      target.mmiinfo[1] = 'L' + (this.simulation.state.tailDeviceId || '100001');
      target.mmiinfo[2] = 'H0172';
      target.mmiinfo[3] = String(Math.round(this.simulation.state.tailPipe)).padStart(4, '0');
    }
    const trainCode = documentRef.getElementById('traincode');
    const locoNumber = documentRef.getElementById('loconum');
    if (trainCode) trainCode.textContent = '46125';
    if (locoNumber) locoNumber.textContent = 'H0172';
    this.bridgeReady = true;
    this.root.querySelector('.cir-loading')?.setAttribute('hidden', 'hidden');
    this.syncPressure();
    this.renderWorkflow();
  }

  ensureBridge() {
    clearTimeout(this.pollTimer);
    if (!this.open || this.bridgeReady) return;
    this.installBridge();
    if (!this.bridgeReady) this.pollTimer = setTimeout(() => this.ensureBridge(), 120);
  }

  linked() {
    const target = this.cirWindow();
    try { return String(target?.mmiinfo?.[1] || '').length === 7; } catch { return false; }
  }

  syncPressure() {
    if (!this.bridgeReady) return;
    const target = this.cirWindow();
    const pressure = Math.max(0, Math.round(this.simulation.state.tailPipe));
    try {
      if (Array.isArray(target?.mmiinfo)) target.mmiinfo[3] = String(pressure).padStart(4, '0').slice(-4);
      const shown = target?.document?.getElementById('lwfyvalue');
      if (shown) shown.textContent = String(pressure);
    } catch { /* iframe 未完成初始化时等待下一帧 */ }
  }

  update() {
    if (!this.open) return;
    this.syncPressure();
    this.renderWorkflow();
  }

  onDeviceKey(code) {
    const target = this.cirWindow();
    if (code === 'bt10') {
      this.simulation.command('tail-unlink');
      this.notice = '列尾装置已销号。';
    }
    if (code === 'bt12' && Number(target?.mmistate) === 1) {
      if (!this.linked()) {
        this.notice = '列尾尚未连接：请在CIR主控菜单中输入6位列尾装置ID。';
      } else {
        this.syncPressure();
        this.simulation.command('tail-query', this.simulation.state.tailPipe);
        this.notice = `列尾风压 ${Math.round(this.simulation.state.tailPipe)} kPa，查询已记录。`;
      }
    }
    if (this.linked() && !this.simulation.state.tailDeviceLinked) {
      let deviceId = '';
      try { deviceId = String(target?.mmiinfo?.[1] || '').slice(1); } catch { /* no-op */ }
      this.simulation.command('tail-link', deviceId);
    }
    this.renderWorkflow();
  }

  renderWorkflow() {
    if (!this.workflow) return;
    const state = this.simulation.state;
    const connected = this.linked() || state.tailDeviceLinked;
    const queried = state.tailQueryCount > 0;
    this.workflow.innerHTML = `
      <h3>坡道任务所需CIR功能</h3>
      <ol>
        <li class="done"><b>列尾装置已连接</b><span>坡道途中任务默认继承发车前已经建立的列尾连接。</span></li>
        <li class="${queried ? 'done' : 'active'}"><b>查询列尾风压</b><span>在CIR主界面按“列尾风压”键，核对返回压力。</span></li>
      </ol>
      <dl><div><dt>车次</dt><dd>46125</dd></div><div><dt>机车</dt><dd>H0172</dd></div><div><dt>尾部列车管</dt><dd>${state.tailPipe.toFixed(0)} kPa</dd></div></dl>
      <p>${this.notice || '本任务只考核列尾风压查询，不重复考核列尾连接。'}</p>`;
  }
}
