export const PROJECT_ID = 'hxd1c-slope-driving-training-v1';

export const CAB = Object.freeze({ width: 640, height: 480 });

// 原 HXD1C 驾驶台 CVF 贴图并非按 0—5 连续排列自阀位置。
// 前三帧位于第一行，后三帧位于最后一行。
export const AUTO_BRAKE_SPRITE_FRAMES = Object.freeze([0, 1, 2, 9, 10, 11]);

// 原游戏 HXD1C.cvf 将单独制动阀定义为 12 帧连续手柄，而不是 6 个固定档位。
// 网页端以 12 个可见帧离散连续行程，物理量仍按 0—100% 线性换算。
export const INDEPENDENT_BRAKE_POSITIONS = Object.freeze([
  '缓解位 0%', '制动 10%', '制动 20%', '制动 30%',
  '制动 40%', '制动 50%', '制动 60%', '制动 70%',
  '制动 80%', '制动 90%', '制动 95%', '全制动位 100%',
]);

export const INDEPENDENT_BRAKE_MAX = INDEPENDENT_BRAKE_POSITIONS.length - 1;

export const DIRECTION_POSITIONS = Object.freeze(['F', 'N', 'R']);

export const BRAKE_POSITIONS = Object.freeze([
  { value: 0, label: '快速缓解位', reduction: 0 },
  { value: 1, label: '运转／缓解位', reduction: 0 },
  { value: 2, label: '制动区（初减压）', reduction: 50 },
  { value: 3, label: '全制动位', reduction: 130 },
  { value: 4, label: '持续制动位', reduction: 170 },
  { value: 5, label: '紧急位', reduction: 600 },
]);

// 与“途中过分相”使用同一内江—内江南两站一区间。场景窗口包含两端站场，
// 训练从出站后的 1.25 km 开始，最长任务在到达内江南站前结束。
export const NEIJIANG_NEIJIANGNAN_CORRIDOR = Object.freeze({
  id: 'neijiang-neijiangnan',
  label: '内江—内江南两站一区间',
  start: 0,
  end: 12_150,
  trainingStart: 1_250,
});

const uphillProfile = Object.freeze([
  { id: 'approach', start: 0, end: 1500, gradeStart: 0, gradeEnd: 2, label: '坡前闯坡准备区', targetMin: 63, targetMax: 70 },
  { id: 'entry', start: 1500, end: 2500, gradeStart: 6, gradeEnd: 6, label: '上坡加载区', targetMin: 55, targetMax: 68 },
  { id: 'climb', start: 2500, end: 8000, gradeStart: 12, gradeEnd: 12, label: '长大上坡维持区', targetMin: 40, targetMax: 62 },
  { id: 'crest', start: 8000, end: 8600, gradeStart: 6, gradeEnd: 0, label: '坡顶预判区', targetMin: 42, targetMax: 65 },
  { id: 'after-crest', start: 8600, end: 9800, gradeStart: -4, gradeEnd: -4, label: '坡顶后控速区', targetMin: 45, targetMax: 68 },
]);

const downhillProfile = Object.freeze([
  { id: 'approach', start: 0, end: 1200, gradeStart: 0, gradeEnd: -3, label: '坡顶制动准备区', targetMin: 54, targetMax: 62 },
  { id: 'entry', start: 1200, end: 2200, gradeStart: -7, gradeEnd: -7, label: '再生制动建立区', targetMin: 52, targetMax: 60 },
  { id: 'descent', start: 2200, end: 8200, gradeStart: -13, gradeEnd: -13, label: '长大下坡稳速区', targetMin: 48, targetMax: 60 },
  { id: 'restriction', start: 8200, end: 9400, gradeStart: -8, gradeEnd: -8, label: '55 km/h限速区', targetMin: 45, targetMax: 55 },
  { id: 'runout', start: 9400, end: 10200, gradeStart: -3, gradeEnd: 0, label: '坡底调整区', targetMin: 45, targetMax: 58 },
]);

const uphillAssessmentItems = Object.freeze([
  { id: 'briefing', label: '确认坡道、LKJ与列车制动状态', points: 10, studentGoal: '入坡前完成LKJ、列尾压力和坡道呼唤确认。' },
  { id: 'rush', label: '坡前闯坡与限速控制', points: 15, studentGoal: '在限速内保持坡前速度，并逐级建立牵引。' },
  { id: 'entry', label: '入坡渐进加载', points: 15, studentGoal: '坡度增加时逐级加载，允许速度自然下降但不能突然失速。' },
  { id: 'climb', label: '长坡牵引与速度趋势控制', points: 20, studentGoal: '在持续能力范围内保持牵引，长坡速度保持在目标带内。' },
  { id: 'adhesion', label: '黏着与空转处置', points: 15, studentGoal: '无空转得满分；发生空转时及时降载并按需撒砂。' },
  { id: 'crest', label: '坡顶预判与工况转换', points: 15, studentGoal: '到达坡顶前逐级退牵引，防止越顶后超速。' },
  { id: 'smooth', label: '平稳操纵与安全结果', points: 10, studentGoal: '避免大跨级和明显纵向冲动，全程不触发安全红线。' },
]);

const downhillAssessmentItems = Object.freeze([
  { id: 'briefing', label: '确认制动条件、LKJ与列尾压力', points: 10, studentGoal: '入坡前确认LKJ、列尾压力和长大下坡任务。' },
  { id: 'dynamic', label: '提前建立再生制动', points: 15, studentGoal: '牵引回零后逐级建立再生制动，不等速度上涨后再追赶。' },
  { id: 'descent', label: '长坡目标速度带控制', points: 20, studentGoal: '以再生制动为主，将速度稳定在48～60 km/h。' },
  { id: 'air', label: '空气制动补充与保持', points: 15, studentGoal: '动力制动不足时实施有效减压，等待制动传播，不频繁移动自阀。' },
  { id: 'recharge', label: '空电联锁、缓解与充分充风', points: 15, studentGoal: '保持必要电制动，缓解空气制动并确认首尾列车管充分恢复。' },
  { id: 'restriction', label: '限速点前完成减速', points: 15, studentGoal: '进入8.2 km限速点以前将速度降至55 km/h及以下。' },
  { id: 'smooth', label: '平稳操纵与安全结果', points: 10, studentGoal: '控制纵向冲动和制动热负荷，全程不触发安全红线。' },
]);

export const SCENARIOS = Object.freeze({
  uphill: Object.freeze({
    id: 'uphill',
    title: '长大上坡道驾驶与调速',
    shortTitle: '上坡调速',
    trainType: '普通货物列车',
    consist: 'HXD1C（23 t轴重）+ 约35辆重车',
    totalMassKg: 2_800_000,
    trainLengthM: 560,
    nominalPipePressure: 500,
    weather: '阴天，雨后局部湿轨',
    adhesionZones: [{ start: 3300, end: 3900, coefficient: .255, label: '林荫湿轨低黏着区' }],
    initialSpeed: 67,
    initialTraction: 0,
    startOffset: NEIJIANG_NEIJIANGNAN_CORRIDOR.trainingStart,
    finishDistance: 9800,
    lineLimit: 70,
    targetBand: [40, 68],
    routeLabel: NEIJIANG_NEIJIANGNAN_CORRIDOR.label,
    corridor: NEIJIANG_NEIJIANGNAN_CORRIDOR,
    profile: uphillProfile,
    assessmentItems: uphillAssessmentItems,
    physicalExpectation: '坡前速度接近限速；进入+12‰长坡后，即使保持较高牵引，速度也应逐步下降；越过坡顶后速度重新回升。',
    restrictions: [{ start: 0, limit: 70 }],
    markers: [
      { distance: 1500, label: '+6‰  1.0 km' },
      { distance: 2500, label: '+12‰  5.5 km' },
      { distance: 8000, label: '+6‰  0.6 km' },
      { distance: 8600, label: '-4‰  1.2 km' },
    ],
  }),
  downhill: Object.freeze({
    id: 'downhill',
    title: '长大下坡道调速与制动',
    shortTitle: '下坡制动',
    trainType: '普通货物列车',
    consist: 'HXD1C（23 t轴重）+ 约53辆重车',
    totalMassKg: 4_200_000,
    trainLengthM: 820,
    nominalPipePressure: 500,
    weather: '晴，轨面干燥，设备正常',
    adhesionZones: [],
    initialSpeed: 58,
    initialTraction: 0,
    startOffset: NEIJIANG_NEIJIANGNAN_CORRIDOR.trainingStart,
    finishDistance: 10200,
    lineLimit: 70,
    targetBand: [45, 60],
    routeLabel: NEIJIANG_NEIJIANGNAN_CORRIDOR.label,
    corridor: NEIJIANG_NEIJIANGNAN_CORRIDOR,
    profile: downhillProfile,
    assessmentItems: downhillAssessmentItems,
    physicalExpectation: '进入-13‰长坡后列车持续增速；再生制动先承担持续制动力，空气制动用于补充，缓解后必须等待全列充分充风。',
    restrictions: [
      { start: 0, limit: 70 },
      { start: 8200, limit: 55 },
    ],
    markers: [
      { distance: 1200, label: '-7‰  1.0 km' },
      { distance: 2200, label: '-13‰  6.0 km' },
      { distance: 8200, label: '-8‰  限55' },
      { distance: 9400, label: '-3‰  0.8 km' },
    ],
  }),
});

export const LKJ_KEYS = Object.freeze([
  ['alarm', '警惕', 12, 533, 61, 59],
  ['unlock', '解锁', 91, 520, 62, 40], ['relief', '缓解', 91, 563, 62, 40],
  ['digit-1', '向前／1', 161, 520, 63, 40], ['digit-6', '向后／6', 161, 563, 63, 40],
  ['digit-2', '调车／2', 231, 520, 63, 40], ['digit-7', '开车／7', 231, 563, 63, 40],
  ['digit-3', '车位／3', 301, 520, 63, 40], ['digit-8', '自动校正／8', 301, 563, 63, 40],
  ['digit-4', '进路号／4', 371, 520, 63, 40], ['digit-9', '出入库／9', 371, 563, 63, 40],
  ['digit-5', '定标／5', 441, 520, 63, 40], ['digit-0', '巡检／0', 441, 563, 63, 40],
  ['query', '查询', 511, 520, 63, 40], ['left', '左箭头／删除', 511, 563, 63, 40],
  ['up', '上箭头', 581, 520, 63, 40], ['down', '下箭头', 581, 563, 63, 40],
  ['dump', '转储', 651, 520, 63, 40], ['right', '右箭头', 651, 563, 63, 40],
  ['setting', '设定', 721, 520, 63, 40], ['confirm', '确认', 721, 563, 63, 40],
]);

export function getScenario(id) {
  return SCENARIOS[id] || SCENARIOS.uphill;
}

export function phaseAt(scenario, distance) {
  return scenario.profile.find((phase) => distance >= phase.start && distance < phase.end)
    || scenario.profile.at(-1);
}

export function gradeAt(scenario, distance) {
  const phase = phaseAt(scenario, distance);
  const span = Math.max(1, phase.end - phase.start);
  const ratio = Math.max(0, Math.min(1, (distance - phase.start) / span));
  return phase.gradeStart + (phase.gradeEnd - phase.gradeStart) * ratio;
}

export function lineLimitAt(scenario, distance) {
  return [...scenario.restrictions].reverse().find((item) => distance >= item.start)?.limit
    || scenario.lineLimit;
}

export function adhesionAt(scenario, distance) {
  return scenario.adhesionZones?.find((zone) => distance >= zone.start && distance < zone.end)?.coefficient || .30;
}

export function targetBandAt(scenario, distance) {
  const phase = phaseAt(scenario, distance);
  return [phase.targetMin ?? scenario.targetBand[0], phase.targetMax ?? scenario.targetBand[1]];
}

export function nextRestriction(scenario, distance) {
  return scenario.restrictions.find((item) => item.start > distance) || null;
}

export function lkjControlLimit(scenario, distance) {
  const currentLimit = lineLimitAt(scenario, distance);
  const next = nextRestriction(scenario, distance);
  if (!next) return currentLimit;
  const remaining = Math.max(0, next.start - distance);
  const targetMps = next.limit / 3.6;
  const serviceDeceleration = .32;
  const curve = Math.sqrt(targetMps ** 2 + 2 * serviceDeceleration * remaining) * 3.6;
  return Math.min(currentLimit, Math.max(next.limit, curve));
}
