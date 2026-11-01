import test from 'node:test';
import assert from 'node:assert/strict';
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
  let lastCommand = simulation.state.traction;
  return runUntilComplete(simulation, (sim) => {
    const s = sim.state;
    const target = s.elapsed < 2 ? 2
      : s.elapsed < 4 ? 4
        : s.elapsed < 6 ? 6
          : s.distance < 2400 ? 7
            : s.distance < 7600 ? 6
              : s.distance < 8000 ? 4
                : s.distance < 8400 ? 2 : 0;
    if (target !== lastCommand) { sim.command('traction', target); lastCommand = target; }
    if (s.wheelSlip && s.sandRemaining < 1) sim.command('sand');
  });
}

function runDownhill() {
  const simulation = new SlopeDrivingSimulation('downhill');
  simulation.command('lkj-open');
  simulation.command('tail-link', '100001');
  simulation.command('tail-query');
  simulation.command('callout');
  let targetTraction = 0;
  let brakePhase = 0;
  return runUntilComplete(simulation, (sim) => {
    const s = sim.state;
    const nextTraction = s.distance < 400 ? 0
      : s.distance < 800 ? -1
        : s.distance < 1200 ? -2
          : s.distance < 1600 ? -4
            : s.distance < 2000 ? -6
              : s.distance < 8200 ? -8
                : s.distance < 9400 ? -6 : -4;
    if (nextTraction !== targetTraction) { sim.command('traction', nextTraction); targetTraction = nextTraction; }
    if (brakePhase === 0 && s.distance > 2250) { sim.command('auto-brake', 1); brakePhase = 1; }
    else if (brakePhase === 1 && s.distance > 7600 && s.speed < 51.8) { sim.command('auto-brake', 0); brakePhase = 2; }
  });
}

test('项目包含独立上坡和下坡配置以及真实坡度区段', () => {
  assert.equal(SCENARIOS.uphill.totalMassKg, 2_800_000);
  assert.equal(SCENARIOS.downhill.totalMassKg, 4_200_000);
  assert.equal(gradeAt(SCENARIOS.uphill, 3000), 12);
  assert.equal(gradeAt(SCENARIOS.downhill, 3000), -13);
  assert.equal(lineLimitAt(SCENARIOS.downhill, 8199), 70);
  assert.equal(lineLimitAt(SCENARIOS.downhill, 8200), 55);
  assert.equal(SCENARIOS.downhill.nominalPipePressure, 500);
  assert.equal(SCENARIOS.uphill.assessmentItems.length, 7);
  assert.equal(SCENARIOS.downhill.assessmentItems.reduce((sum, item) => sum + item.points, 0), 100);
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

test('CIR列尾查询不能绕过连接流程，考评进度必须按顺序解锁', () => {
  const simulation = new SlopeDrivingSimulation('uphill');
  simulation.command('tail-query');
  assert.equal(simulation.state.tailQueryCount, 0);
  assert.ok(simulation.state.events.some((event) => event.type === 'tail-query-rejected'));
  simulation.command('tail-link', '123456');
  simulation.command('tail-query');
  assert.equal(simulation.state.tailQueryCount, 1);
  simulation.state.distance = 9_000;
  simulation.state.events.push({ type: 'traction', distance: 8_000, value: 2, previous: { traction: 4 } });
  const progress = new SlopeDrivingAssessment(simulation).progress();
  assert.equal(progress.statuses[0], 'active');
  assert.ok(progress.statuses.slice(1).every((status) => status === 'locked'));
});

test('牵引级位按教学目标速度工作，6级对应60 km/h并保留坡度影响', () => {
  assert.equal(tractionTargetSpeed(6), 60);
  assert.equal(tractionTargetSpeed(7), 70);
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

test('忽略坡道限速会触发LKJ安全红线', () => {
  const simulation = new SlopeDrivingSimulation('downhill');
  runUntilComplete(simulation, () => {}, 18_000);
  const result = new SlopeDrivingAssessment(simulation).result();
  assert.ok(simulation.state.events.some((event) => event.type === 'lkj-level' && ['service', 'emergency'].includes(event.to)));
  assert.equal(result.redline, true);
  assert.equal(result.qualified, false);
});
