import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTO_BRAKE_SPRITE_FRAMES,
  BRAKE_POSITIONS,
  INDEPENDENT_BRAKE_POSITIONS,
  SCENARIOS,
  gradeAt,
  lineLimitAt,
  tractionTargetSpeed,
} from '../scripts/slopeDrivingConfig.js';
import { SlopeDrivingSimulation } from '../scripts/slopeDrivingSimulation.js';
import { SlopeDrivingAssessment } from '../scripts/slopeDrivingAssessment.js';
import { SlopeLkjRuntime } from '../scripts/slopeLkjRuntime.js';
import {
  createCandidateAttempt,
  normalizeCandidate,
  validateCandidate,
} from '../scripts/slopeDrivingCandidate.js';

function runUntilComplete(simulation, driver, maximumSteps = 24_000) {
  simulation.start();
  for (let index = 0; index < maximumSteps && !simulation.state.completed; index += 1) {
    driver(simulation, index);
    simulation.tick(.05);
  }
  return simulation;
}

function runUphill() {
  const simulation = new SlopeDrivingSimulation('uphill');
  simulation.command('lkj-open');
  simulation.command('tail-link', '100001');
  simulation.command('tail-query');
  simulation.command('callout');
  let lastMoveAt = -99;
  let slipHandled = false;
  return runUntilComplete(simulation, (sim) => {
    const s = sim.state;
    let target = s.distance < 2400 ? 7
      : s.distance < 7600 ? 6
        : s.distance < 8000 ? 4
          : s.distance < 8400 ? 2 : 0;
    if (s.wheelSlip && !slipHandled) {
      sim.command('traction', s.traction - 1);
      sim.command('sand');
      slipHandled = true;
      lastMoveAt = s.elapsed;
    } else if (slipHandled && s.slipEndedAt != null && !s.slipRecoveryValid) {
      target = 6;
      if (s.elapsed - s.slipEndedAt >= 2 && s.traction < target && s.elapsed - lastMoveAt >= 1.3) {
        sim.command('traction', s.traction + 1);
        lastMoveAt = s.elapsed;
      }
    } else if (s.traction !== target && s.elapsed - lastMoveAt >= 1.3) {
      sim.command('traction', s.traction + Math.sign(target - s.traction));
      lastMoveAt = s.elapsed;
    }
  });
}

function runDownhill() {
  const simulation = new SlopeDrivingSimulation('downhill');
  simulation.command('lkj-open');
  simulation.command('tail-link', '100001');
  simulation.command('tail-query');
  simulation.command('callout');
  let brakePhase = 0;
  let lastTractionAt = -99;
  let lastBrakeAt = -99;
  return runUntilComplete(simulation, (sim) => {
    const s = sim.state;
    const targetTraction = s.distance < 400 ? 0
      : s.distance < 800 ? -1
        : s.distance < 1200 ? -2
          : s.distance < 1450 ? -3
            : s.distance < 1700 ? -4
              : s.distance < 1950 ? -5
                : s.distance < 2200 ? -6
                  : s.distance < 2450 ? -7
                    : s.distance < 9400 ? -8
                      : s.distance < 9700 ? -5
                        : s.distance < 9900 ? -3 : 0;
    if (s.traction !== targetTraction && s.elapsed - lastTractionAt >= 1.3) {
      sim.command('traction', s.traction + Math.sign(targetTraction - s.traction));
      lastTractionAt = s.elapsed;
    }
    if (brakePhase === 0 && s.airRequiredAt != null) {
      sim.command('auto-brake', 1);
      brakePhase = 1;
      lastBrakeAt = s.elapsed;
    } else if (brakePhase === 1 && s.airControlState.startsWith('effective') && s.speedTrend > -.02 && s.elapsed - lastBrakeAt > 8) {
      sim.command('auto-brake', 2);
      brakePhase = 2;
      lastBrakeAt = s.elapsed;
    } else if (brakePhase === 2 && s.speed <= 55 && s.speedTrend < 0 && s.elapsed - lastBrakeAt > 8) {
      sim.command('auto-brake', 0);
      brakePhase = 3;
      lastBrakeAt = s.elapsed;
    }
  });
}

test('项目包含独立上坡和下坡配置以及真实坡度区段', () => {
  assert.equal(SCENARIOS.uphill.totalMassKg, 2_800_000);
  assert.equal(SCENARIOS.downhill.totalMassKg, 4_200_000);
  assert.equal(gradeAt(SCENARIOS.uphill, 3000), 12);
  assert.equal(gradeAt(SCENARIOS.downhill, 3000), -13);
  assert.equal(lineLimitAt(SCENARIOS.downhill, 8199), 70);
  assert.equal(lineLimitAt(SCENARIOS.downhill, 8200), 55);
  assert.equal(SCENARIOS.uphill.nominalPipePressure, 600);
  assert.equal(SCENARIOS.downhill.nominalPipePressure, 600);
  assert.equal(SCENARIOS.uphill.startOffset, 1_250);
  assert.equal(SCENARIOS.downhill.startOffset, 1_250);
  assert.equal(SCENARIOS.uphill.assessmentItems.length, 7);
  assert.equal(SCENARIOS.downhill.assessmentItems.reduce((sum, item) => sum + item.points, 0), 100);
});

test('登录登记沿用过分相项目的姓名学号校验并生成独立考核记录', () => {
  assert.deepEqual(normalizeCandidate({ name: '  张  三  ', studentId: ' 2026-001 ' }), { name: '张 三', studentId: '2026-001' });
  assert.equal(validateCandidate({ name: '张三', studentId: '20260001' }).valid, true);
  assert.equal(validateCandidate({ name: '<script>', studentId: '1' }).valid, false);
  const attempt = createCandidateAttempt({ name: '李四', studentId: 'ABCD-1234' }, new Date('2026-10-26T00:00:00.000Z'));
  assert.equal(attempt.name, '李四');
  assert.equal(attempt.studentId, 'ABCD-1234');
  assert.equal(attempt.startedAt, '2026-10-26T00:00:00.000Z');
});

test('驾驶台手柄贴图、位置名称和运行联锁与仿真状态对应', () => {
  assert.deepEqual([...AUTO_BRAKE_SPRITE_FRAMES], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(BRAKE_POSITIONS[0].label, '运转位');
  assert.equal(BRAKE_POSITIONS[9].label, '抑制位');
  assert.equal(BRAKE_POSITIONS[10].label, '重联位');
  assert.equal(BRAKE_POSITIONS[11].label, '紧急制动位');
  assert.ok(BRAKE_POSITIONS.every((item) => !item.label.includes('快速缓解')));
  assert.equal(INDEPENDENT_BRAKE_POSITIONS.length, 12);
  assert.equal(INDEPENDENT_BRAKE_POSITIONS[0], '运转位');
  assert.equal(INDEPENDENT_BRAKE_POSITIONS.at(-1), '全制动位');
  const simulation = new SlopeDrivingSimulation('uphill');
  assert.equal(simulation.command('auto-brake', 10), false);
  assert.equal(simulation.state.autoBrake, 0);
  assert.equal(simulation.command('direction', 'N'), false);
  assert.equal(simulation.state.direction, 'F');
  assert.ok(simulation.state.events.some((event) => event.type === 'direction-while-moving'));
  simulation.state.speed = 0;
  assert.equal(simulation.command('direction', 'N'), true);
  assert.equal(simulation.command('auto-brake', 10), true);
  assert.equal(simulation.state.autoBrake, 10);
  simulation.command('auto-brake', 0);
  assert.equal(simulation.command('direction', 'R'), true);
  assert.equal(simulation.state.direction, 'R');
  simulation.command('horn-start');
  assert.equal(simulation.state.hornActive, true);
  simulation.command('horn-stop');
  assert.equal(simulation.state.hornActive, false);
  assert.equal(simulation.state.hornCount, 1);
});

test('坡道任务默认继承列尾连接，七项考评独立监测不相互锁定', () => {
  const simulation = new SlopeDrivingSimulation('uphill');
  simulation.command('tail-query');
  assert.equal(simulation.state.tailQueryCount, 1);
  simulation.state.distance = 9_000;
  simulation.state.events.push({ type: 'traction', distance: 8_000, value: 2, previous: { traction: 4 } });
  const progress = new SlopeDrivingAssessment(simulation).progress();
  assert.equal(progress.statuses[0], 'settled');
  assert.ok(progress.statuses.every((status) => status !== 'locked'));
});

test('牵引区扩展到12级，6级对应60 km/h且物理牵引上限不被放大', () => {
  assert.equal(tractionTargetSpeed(6), 60);
  assert.equal(tractionTargetSpeed(7), 70);
  assert.equal(tractionTargetSpeed(12), 120);
  const maximum = new SlopeDrivingSimulation('uphill');
  maximum.command('traction', 12);
  assert.equal(maximum.state.traction, 12);
  for (let index = 0; index < 100; index += 1) maximum.tick(.05);
  assert.ok(maximum.state.tractionForce <= 520_000);
  const level = new SlopeDrivingSimulation('uphill');
  level.state.speed = 45;
  level.command('traction', 6);
  for (let index = 0; index < 8_000; index += 1) level.tick(.05);
  assert.ok(level.state.speed >= 56 && level.state.speed <= 61, level.state.speed);
  const climb = new SlopeDrivingSimulation('uphill');
  climb.state.distance = 3_000;
  climb.state.speed = 60;
  climb.command('traction', 6);
  for (let index = 0; index < 4_000; index += 1) climb.tick(.05);
  assert.ok(climb.state.speed < 60, climb.state.speed);
});

test('上坡满分轨迹体现先闯后爬、速度自然下降和坡顶预控', () => {
  const simulation = runUphill();
  const result = new SlopeDrivingAssessment(simulation).result();
  assert.equal(simulation.state.completed, true);
  const beforeClimb = simulation.state.samples.find((sample) => sample.distance >= 2500);
  const lateClimb = simulation.state.samples.find((sample) => sample.distance >= 7000);
  assert.ok(beforeClimb.speed - lateClimb.speed > 5, `${beforeClimb.speed} -> ${lateClimb.speed}`);
  assert.ok(simulation.state.events.some((event) => event.type === 'traction' && event.distance > 7600 && event.value <= 4));
  assert.equal(result.redline, false);
  assert.equal(result.score, 100, JSON.stringify(result.categories));
});

test('下坡满分轨迹包含动力制动、空气补充、先缓解空气和充分充风', () => {
  const simulation = runDownhill();
  const result = new SlopeDrivingAssessment(simulation).result();
  assert.equal(simulation.state.completed, true);
  assert.ok(simulation.state.events.some((event) => event.type === 'traction' && event.value < 0));
  assert.ok(simulation.state.events.some((event) => event.type === 'auto-brake' && event.value > 0));
  assert.ok(simulation.state.events.some((event) => event.type === 'auto-brake' && event.value === 0 && event.previous?.autoBrake > 0));
  assert.ok(simulation.state.events.some((event) => event.type === 'recharge-ready'));
  assert.ok(simulation.state.samples.some((sample) => sample.distance >= 8200 && sample.speed <= 55));
  assert.equal(result.redline, false);
  assert.equal(result.score, 100, JSON.stringify(result.categories));
});

test('空电联锁区分列车制动缸与机车制动缸，单阀达到90 kPa后切除动力制动', () => {
  const simulation = new SlopeDrivingSimulation('downhill');
  simulation.command('traction', -4);
  simulation.command('auto-brake', 1);
  for (let index = 0; index < 700; index += 1) simulation.tick(.05);
  assert.ok(simulation.state.trainBrakeCylinder > 50);
  assert.ok(simulation.state.locomotiveCylinder < 90);
  assert.ok(simulation.state.dynamicBrakeForce > 0);
  simulation.command('independent-brake', 3);
  for (let index = 0; index < 100; index += 1) simulation.tick(.05);
  assert.equal(simulation.state.dynamicBrakeForce, 0);
  simulation.command('side-release', true);
  for (let index = 0; index < 100; index += 1) simulation.tick(.05);
  assert.ok(simulation.state.locomotiveCylinder < 10);
  assert.ok(simulation.state.trainBrakeCylinder > 50);
  simulation.command('side-release', false);
});

test('大跨级操纵产生的纵向冲动高于逐级操纵', () => {
  const abrupt = new SlopeDrivingSimulation('uphill');
  abrupt.command('traction', 6);
  for (let index = 0; index < 20; index += 1) abrupt.tick(.05);
  const gradual = new SlopeDrivingSimulation('uphill');
  for (let level = 1; level <= 6; level += 1) {
    gradual.command('traction', level);
    for (let index = 0; index < 35; index += 1) gradual.tick(.05);
  }
  assert.ok(abrupt.state.maxShockIndex > gradual.state.maxShockIndex, `${abrupt.state.maxShockIndex} <= ${gradual.state.maxShockIndex}`);
});

test('跨2级至少倒一根冲动棒，快速连续相邻级位不能规避越级记录', () => {
  const direct = new SlopeDrivingSimulation('uphill');
  direct.command('traction', 2);
  assert.equal(direct.state.notchSkipCount, 1);
  assert.equal(direct.state.shockStickFallen, 1);
  assert.ok(direct.state.events.some((event) => event.type === 'traction-skip' && event.kind === 'direct'));

  const rapid = new SlopeDrivingSimulation('uphill');
  rapid.command('traction', 1);
  for (let index = 0; index < 8; index += 1) rapid.tick(.05);
  rapid.command('traction', 2);
  assert.equal(rapid.state.notchSkipCount, 1);
  assert.equal(rapid.state.shockStickFallen, 1);
  assert.ok(rapid.state.events.some((event) => event.type === 'traction-skip' && event.kind === 'rapid'));

  const steady = new SlopeDrivingSimulation('uphill');
  steady.command('traction', 1);
  for (let index = 0; index < 28; index += 1) steady.tick(.05);
  steady.command('traction', 2);
  assert.equal(steady.state.notchSkipCount, 0);
  assert.equal(steady.state.shockStickFallen, 0);
});

test('同一级位重复拖动不重复记录操作次数', () => {
  const simulation = new SlopeDrivingSimulation('uphill');
  assert.equal(simulation.command('traction', 1), true);
  assert.equal(simulation.command('traction', 1), false);
  assert.equal(simulation.command('traction', 1), false);
  assert.equal(simulation.state.events.filter((event) => event.type === 'traction').length, 1);
});

test('上坡空转要求先降1至2级再短时撒砂并延迟恢复加载', () => {
  const correct = new SlopeDrivingSimulation('uphill');
  correct.start();
  correct.state.distance = 3_350;
  correct.command('traction', 6);
  correct.tick(.05);
  assert.equal(correct.state.wheelSlip, true);
  correct.command('traction', 5);
  correct.command('sand');
  correct.tick(.05);
  assert.equal(correct.state.slipReductionValid, true);
  assert.equal(correct.state.slipSandAfterReduction, true);
  assert.equal(correct.state.wheelSlip, false);
  for (let index = 0; index < 45; index += 1) correct.tick(.05);
  correct.command('traction', 6);
  assert.equal(correct.state.slipRecoveryValid, true);

  const wrong = new SlopeDrivingSimulation('uphill');
  wrong.start();
  wrong.state.distance = 3_350;
  wrong.command('traction', 6);
  wrong.tick(.05);
  wrong.command('sand');
  wrong.command('traction', 5);
  assert.equal(wrong.state.slipSandAfterReduction, false);
});

test('下坡电制8级单独运行会超过68，64持续增速时及时空气制动可控制速度', () => {
  const noAir = new SlopeDrivingSimulation('downhill');
  noAir.start();
  let lastMoveAt = -99;
  for (let index = 0; index < 20_000 && noAir.state.distance < 8_000; index += 1) {
    const s = noAir.state;
    const target = s.distance < 400 ? 0
      : s.distance < 800 ? -1
        : s.distance < 1200 ? -2
          : s.distance < 1450 ? -3
            : s.distance < 1700 ? -4
              : s.distance < 1950 ? -5
                : s.distance < 2200 ? -6
                  : s.distance < 2450 ? -7 : -8;
    if (s.traction !== target && s.elapsed - lastMoveAt >= 1.3) {
      noAir.command('traction', s.traction + Math.sign(target - s.traction));
      lastMoveAt = s.elapsed;
    }
    noAir.tick(.05);
  }
  assert.ok(Math.max(...noAir.state.samples.map((sample) => sample.speed)) > 68);
  assert.ok(noAir.state.events.some((event) => event.type === 'air-brake-missed'));

  const controlled = runDownhill();
  const coreMaximum = Math.max(...controlled.state.samples.filter((sample) => sample.distance < 8_200).map((sample) => sample.speed));
  assert.ok(controlled.state.events.some((event) => event.type === 'air-brake-timely'));
  assert.ok(controlled.state.events.some((event) => event.type === 'air-brake-effective'));
  assert.ok(coreMaximum <= 68, coreMaximum);
});

test('电空联合制动中动力制动直接回零记录错误并产生明显倒棒', () => {
  const simulation = new SlopeDrivingSimulation('downhill');
  simulation.command('traction', -8);
  simulation.command('auto-brake', 1);
  simulation.command('traction', 0);
  assert.equal(simulation.state.combinedBrakeErrors, 1);
  assert.equal(simulation.state.shockStickFallen, 6);
  assert.ok(simulation.state.events.some((event) => event.type === 'combined-brake-error'));
});

test('忽略坡道限速会触发LKJ安全红线', () => {
  const simulation = new SlopeDrivingSimulation('downhill');
  runUntilComplete(simulation, () => {}, 18_000);
  const result = new SlopeDrivingAssessment(simulation).result();
  assert.ok(simulation.state.events.some((event) => event.type === 'lkj-level' && ['service', 'emergency'].includes(event.to)));
  assert.equal(result.redline, true);
  assert.equal(result.qualified, false);
});

test('呼唤与撒砂不能连续刷事件，冲动检测仪扶正不清除历史扣分', () => {
  const simulation = new SlopeDrivingSimulation('uphill');
  assert.equal(simulation.command('callout'), true);
  assert.equal(simulation.command('callout'), false);
  assert.equal(simulation.state.calloutCount, 1);
  assert.equal(simulation.command('sand'), true);
  assert.equal(simulation.command('sand'), false);
  assert.equal(simulation.state.sandingCount, 1);
  simulation.command('traction', 12);
  for (let index = 0; index < 20; index += 1) simulation.tick(.05);
  const retained = simulation.state.maxShockIndex;
  simulation.command('shock-reset');
  assert.equal(simulation.state.shockStickTilt, 0);
  assert.equal(simulation.state.maxShockIndex, retained);
});

test('手机登录提交直接调用沉浸全屏流程并保留CSS兜底', () => {
  const app = readFileSync(new URL('../scripts/slopeDrivingApp.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/slope-driving.css', import.meta.url), 'utf8');
  assert.match(app, /if \(isMobileLike\(\)\) await enterImmersive\(\)/);
  assert.match(app, /screen\.orientation\?\.lock\?\.\('landscape'\)/);
  assert.match(app, /visualViewport/);
  assert.match(css, /html\.immersive/);
});

test('简化手机入口并只保留驾驶台实体手柄操作', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /请选择独立考评项目/);
  assert.doesNotMatch(html, /独立教学仿真项目/);
  assert.doesNotMatch(html, /id="mobile-controls"/);
  assert.doesNotMatch(html, /briefing-physics|notch-reference|briefing-scores/);
  assert.match(html, /class="shock-rack"/);
  assert.match(html, />冲动检测仪</);
  assert.doesNotMatch(html, /冲动棒/);
});

test('LKJ在左上角打开，限速线为红色、运行线为绿色且历史轨迹不消失', () => {
  const css = readFileSync(new URL('../styles/slope-driving.css', import.meta.url), 'utf8');
  const lkj = readFileSync(new URL('../scripts/slopeLkjRuntime.js', import.meta.url), 'utf8');
  assert.match(css, /body\.mobile-controls-enabled \.lkj-dock\{top:max\(5px/);
  assert.match(css, /native-chart \.limit\{stroke:#ff3247/);
  assert.match(css, /native-chart \.speed\{stroke:#24ee67/);
  assert.match(lkj, /native-route-profile/);
  assert.doesNotMatch(lkj, /slice\(-180\)/);
  const overlay = SlopeLkjRuntime.prototype.mainOverlay({
    speed: 55,
    lkjLimit: 70,
    samples: [
      { distance: 100, speed: 50, limit: 70 },
      { distance: 4_000, speed: 55, limit: 70 },
      { distance: 8_000, speed: 48, limit: 55 },
    ],
    lkjLevel: 'normal',
    distance: 8_000,
    phase: { label: '长坡' },
    grade: -13,
    tailPipe: 598,
  }, {
    finishDistance: 10_000,
    profile: [{ start: 0, end: 10_000, gradeStart: -13, gradeEnd: -13 }],
  });
  assert.match(overlay, /class="speed" points="7\.1000000000000005,186\.66666666666666 284,173\.33333333333334 568,192"/);
});

test('考评抽屉支持点击框外收起，手机端保留三类手柄位置显示', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../scripts/slopeDrivingApp.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/slope-driving.css', import.meta.url), 'utf8');
  assert.match(html, /id="panel-backdrop"/);
  assert.match(app, /panel-backdrop.*addEventListener\('click', closePanels\)/s);
  assert.match(css, /body\.mobile-controls-enabled \.control-position-badge\{display:block/);
  assert.doesNotMatch(css, /body\.mobile-controls-enabled \.control-position-badge\{display:none/);
});

test('成绩单沿用过分相项目的标题栏、主体和关闭结构', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /class="result-card result-shell"/);
  assert.match(html, /class="result-head"/);
  assert.match(html, /class="result-body"/);
  assert.match(html, /id="result-close"/);
});
