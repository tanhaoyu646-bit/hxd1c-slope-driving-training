import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_BRAKE_SPRITE_FRAMES,
  INDEPENDENT_BRAKE_POSITIONS,
  SCENARIOS,
  gradeAt,
  lineLimitAt,
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
  simulation.command('tail-query');
  simulation.command('callout');
  let lastCommand = simulation.state.traction;
  let lastSandAt = -99;
  return runUntilComplete(simulation, (sim) => {
    const s = sim.state;
    let target = 0;
    if (s.distance > 450 && s.distance < 1200) target = 3;
    else if (s.distance >= 1200 && s.distance < 2200) target = 5;
    else if (s.distance >= 2200 && s.distance < 7350) target = 6;
    else if (s.distance >= 7350 && s.distance < 8100) target = 3;
    else if (s.distance >= 8100) target = s.speed > 64 ? -2 : 0;
    if (target !== lastCommand) { sim.command('traction', target); lastCommand = target; }
    if (s.distance > 850 && s.distance < 7600 && s.elapsed - lastSandAt > 4.5) { sim.command('sand'); lastSandAt = s.elapsed; }
  });
}

function runDownhill() {
  const simulation = new SlopeDrivingSimulation('downhill');
  simulation.command('lkj-open');
  simulation.command('tail-query');
  simulation.command('callout');
  let targetTraction = 0;
  let firstBrakeApplied = false;
  let firstBrakeReleased = false;
  return runUntilComplete(simulation, (sim) => {
    const s = sim.state;
    let nextTraction = 0;
    if (s.distance > 700 && s.distance <= 1100) nextTraction = -2;
    else if (s.distance > 1100 && s.distance <= 1600) nextTraction = -4;
    else if (s.distance > 1600) nextTraction = -8;
    if (nextTraction !== targetTraction) { sim.command('traction', nextTraction); targetTraction = nextTraction; }

    if (!firstBrakeApplied && s.distance > 2600 && s.speed > 62) {
      sim.command('auto-brake', 2);
      firstBrakeApplied = true;
    }
    if (firstBrakeApplied && !firstBrakeReleased && s.speed < 55.5) {
      sim.command('auto-brake', 0);
      firstBrakeReleased = true;
    }
    if (firstBrakeReleased && s.rechargeReady && s.distance > 6500 && s.speed > 55.2 && s.autoBrake === 0) {
      sim.command('auto-brake', 1);
    }
    if (s.autoBrake > 0 && firstBrakeReleased && s.speed < 52.5) sim.command('auto-brake', 0);
  });
}

test('项目包含独立上坡和下坡配置以及真实坡度区段', () => {
  assert.equal(SCENARIOS.uphill.totalMassKg, 2_800_000);
  assert.equal(SCENARIOS.downhill.totalMassKg, 4_200_000);
  assert.equal(gradeAt(SCENARIOS.uphill, 3000), 12);
  assert.equal(gradeAt(SCENARIOS.downhill, 3000), -12);
  assert.equal(lineLimitAt(SCENARIOS.downhill, 8100), 55);
});

test('驾驶台手柄贴图、位置名称和运行联锁与仿真状态对应', () => {
  assert.deepEqual([...AUTO_BRAKE_SPRITE_FRAMES], [0, 1, 2, 9, 10, 11]);
  assert.deepEqual([...INDEPENDENT_BRAKE_POSITIONS], ['缓解位', '制动Ⅰ', '制动Ⅱ', '制动Ⅲ', '制动Ⅳ', '全制动位']);
  const simulation = new SlopeDrivingSimulation('uphill');
  assert.equal(simulation.command('direction', 'N'), false);
  assert.equal(simulation.state.direction, 'F');
  assert.ok(simulation.state.events.some((event) => event.type === 'direction-while-moving'));
  simulation.state.speed = 0;
  assert.equal(simulation.command('direction', 'N'), true);
  assert.equal(simulation.command('direction', 'R'), true);
  assert.equal(simulation.state.direction, 'R');
  simulation.command('horn-start');
  assert.equal(simulation.state.hornActive, true);
  simulation.command('horn-stop');
  assert.equal(simulation.state.hornActive, false);
  assert.equal(simulation.state.hornCount, 1);
});

test('上坡标准轨迹可完成坡前储能、撒砂、长坡牵引和坡顶调整', () => {
  const simulation = runUphill();
  const result = new SlopeDrivingAssessment(simulation).result();
  assert.equal(simulation.state.completed, true);
  assert.ok(simulation.state.events.some((event) => event.type === 'sand'));
  assert.ok(simulation.state.events.some((event) => event.type === 'traction' && event.distance > 7200 && event.value <= 3));
  assert.equal(result.redline, false);
  assert.equal(result.qualified, true, JSON.stringify(result.categories));
});

test('下坡标准轨迹包含动力制动、空气制动、先缓解空气和充分充风', () => {
  const simulation = runDownhill();
  const result = new SlopeDrivingAssessment(simulation).result();
  assert.equal(simulation.state.completed, true);
  assert.ok(simulation.state.events.some((event) => event.type === 'traction' && event.value < 0));
  assert.ok(simulation.state.events.some((event) => event.type === 'auto-brake' && event.value > 0));
  assert.ok(simulation.state.events.some((event) => event.type === 'auto-brake' && event.value === 0 && event.previous?.autoBrake > 0));
  assert.ok(simulation.state.events.some((event) => event.type === 'recharge-ready'));
  assert.ok(simulation.state.samples.some((sample) => sample.distance >= 8000 && sample.speed <= 55.5));
  assert.equal(result.redline, false);
  assert.equal(result.qualified, true, JSON.stringify(result.categories));
});

test('忽略坡道限速会触发LKJ安全红线', () => {
  const simulation = new SlopeDrivingSimulation('downhill');
  runUntilComplete(simulation, () => {}, 18_000);
  const result = new SlopeDrivingAssessment(simulation).result();
  assert.ok(simulation.state.events.some((event) => event.type === 'lkj-level' && ['service', 'emergency'].includes(event.to)));
  assert.equal(result.redline, true);
  assert.equal(result.qualified, false);
});
