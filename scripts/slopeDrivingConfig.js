export const PROJECT_ID = 'hxd1c-slope-driving-training-v2';

export const CAB = Object.freeze({ width: 640, height: 480 });

// 原 HXD1C 驾驶台 CVF 贴图共 12 帧，对应手柄从运转位到紧急位的连续行程。
// 自阀逻辑保留运转、初制、常用制动区、全制动、抑制、重联和紧急功能；
// 不设置“快速缓解位”。
export const AUTO_BRAKE_SPRITE_FRAMES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export const INDEPENDENT_BRAKE_MAX = 11;

export const INDEPENDENT_BRAKE_POSITIONS = Object.freeze([
  '运转位', '制动区 10%', '制动区 20%', '制动区 30%', '制动区 40%', '制动区 50%',
  '制动区 60%', '制动区 70%', '制动区 80%', '制动区 90%', '制动区 100%', '全制动位',
]);

export const DIRECTION_POSITIONS = Object.freeze(['F', 'N', 'R']);

export const BRAKE_POSITIONS = Object.freeze([
  { value: 0, label: '运转位', reduction: 0, function: '充风并缓解列车制动' },
  { value: 1, label: '初制动位', reduction: 50, function: '最小有效减压' },
  { value: 2, label: '常用制动区 1', reduction: 70, function: '常用制动区' },
  { value: 3, label: '常用制动区 2', reduction: 90, function: '常用制动区' },
  { value: 4, label: '常用制动区 3', reduction: 110, function: '常用制动区' },
  { value: 5, label: '常用制动区 4', reduction: 130, function: '常用制动区' },
  { value: 6, label: '常用制动区 5', reduction: 145, function: '常用制动区' },
  { value: 7, label: '常用制动区 6', reduction: 160, function: '常用制动区' },
  { value: 8, label: '全制动位', reduction: 170, function: '最大有效减压' },
  { value: 9, label: '抑制位', reduction: 170, function: '全制动并复位惩罚制动' },
  { value: 10, label: '重联位', reduction: 0, function: '非操纵端或无火回送使用' },
  { value: 11, label: '紧急制动位', reduction: 600, function: '列车管紧急排风' },
]);

export const TRACTION_MAX = 12;
export const DYNAMIC_BRAKE_MAX = 8;
export const TRACTION_TARGET_SPEEDS = Object.freeze([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);

export function tractionTargetSpeed(notch) {
  return TRACTION_TARGET_SPEEDS[Math.max(0, Math.min(TRACTION_MAX, Math.round(Number(notch) || 0)))] || 0;
}

const uphillProfile = Object.freeze([
  { id: 'approach', start: 0, end: 1500, gradeStart: 0, gradeEnd: 2, label: '坡前闯坡准备区', targetMin: 63, targetMax: 70 },
  { id: 'entry', start: 1500, end: 2500, gradeStart: 6, gradeEnd: 6, label: '上坡加载区', targetMin: 55, targetMax: 68 },
  { id: 'climb', start: 2500, end: 8000, gradeStart: 12, gradeEnd: 12, label: '长大上坡维持区', targetMin: 40, targetMax: 62 },
  { id: 'crest', start: 8000, end: 8600, gradeStart: 6, gradeEnd: 0, label: '坡顶预判区', targetMin: 42, targetMax: 65 },
  { id: 'after-crest', start: 8600, end: 9800, gradeStart: -4, gradeEnd: -4, label: '坡顶后控速区', targetMin: 45, targetMax: 68 },
]);

const downhillProfile = Object.freeze([
  { id: 'approach', start: 0, end: 1200, gradeStart: 0, gradeEnd: -3, label: '坡顶制动准备区', targetMin: 54, targetMax: 62 },
  { id: 'entry', start: 1200, end: 2200, gradeStart: -7, gradeEnd: -7, label: '再生制动建立区', targetMin: 52, targetMax: 62 },
  { id: 'descent', start: 2200, end: 8200, gradeStart: -13, gradeEnd: -13, label: '长大下坡稳速区', targetMin: 52, targetMax: 68 },
  { id: 'restriction', start: 8200, end: 9400, gradeStart: -8, gradeEnd: -8, label: '55 km/h限速区', targetMin: 45, targetMax: 55 },
  { id: 'runout', start: 9400, end: 10200, gradeStart: -3, gradeEnd: 0, label: '坡底调整区', targetMin: 45, targetMax: 58 },
]);

const uphillAssessmentItems = Object.freeze([
  { id: 'briefing', label: '坡前确认', points: 10, studentGoal: '1.5 km前完成LKJ、列尾压力和坡道呼唤确认。' },
  { id: 'rush', label: '先闯后爬与限速控制', points: 15, studentGoal: '在限速内储备动能，逐级建立牵引，避免快速越级。' },
  { id: 'entry', label: '坡道主机加载', points: 15, studentGoal: '坡度增加时按速度趋势逐级加载，已有足够牵引时允许保持。' },
  { id: 'climb', label: '长坡牵引与速度趋势控制', points: 20, studentGoal: '以稳定牵引为主，允许速度自然下降，避免频繁推拉手柄。' },
  { id: 'adhesion', label: '降级撒砂与黏着恢复', points: 15, studentGoal: '发生空转后先降低1～2级，再短时撒砂，黏着恢复后逐级加载。' },
  { id: 'crest', label: '坡顶预判与工况转换', points: 15, studentGoal: '到达坡顶前逐级退牵引，防止越顶后超速。' },
  { id: 'smooth', label: '平稳操纵与安全结果', points: 10, studentGoal: '避免大跨级和明显纵向冲动，全程不触发安全红线。' },
]);

const downhillAssessmentItems = Object.freeze([
  { id: 'briefing', label: '入坡确认', points: 10, studentGoal: '1.2 km前确认LKJ纵断面、列尾压力、-13‰长坡和8.2 km限速70→55。' },
  { id: 'dynamic', label: '提前建立动力制动', points: 15, studentGoal: '-7‰前牵引回零并预置低级动力制动，再按速度趋势调整。' },
  { id: 'descent', label: '长坡目标速度带控制', points: 20, studentGoal: '进入-13‰后以动力制动为主，控制在52～68 km/h；低于50为过量制动。' },
  { id: 'air', label: '空气制动补充与保持', points: 15, studentGoal: '电制6～8级且64 km/h仍增速时，保持动力制动并及时实施不小于50 kPa减压。' },
  { id: 'recharge', label: '缓解充风与空电联锁', points: 15, studentGoal: '速度回落且动力制动能控速时，先缓解空气制动，保持动力制动并确认首尾充风。' },
  { id: 'restriction', label: '限速点前完成减速', points: 15, studentGoal: '进入8.2 km限速点以前将速度降至55 km/h及以下。' },
  { id: 'smooth', label: '平稳操纵与安全结果', points: 10, studentGoal: '避免冲动、越级和频繁调整空气制动，全程不触发安全红线。' },
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
    nominalPipePressure: 600,
    weather: '阴天，雨后局部湿轨',
    adhesionZones: [{ start: 3300, end: 3900, coefficient: .255, label: '林荫湿轨低黏着区' }],
    initialSpeed: 67,
    initialTraction: 0,
    // 与“途中过分相”项目使用同一中途山区线路选段，避开车站场景。
    startOffset: 1_250,
    finishDistance: 9800,
    lineLimit: 70,
    targetBand: [40, 68],
    routeLabel: '坡前—长大上坡—坡顶',
    profile: uphillProfile,
    assessmentItems: uphillAssessmentItems,
    briefingSteps: ['坡前确认并在限速内储备动能', '进入+6‰后根据速度趋势保持或加载', '+12‰长坡稳定牵引，按需处置空转', '坡顶前预判退牵引', '全程控制超速、冲动和大跨级'],
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
    nominalPipePressure: 600,
    weather: '晴，轨面干燥，设备正常',
    adhesionZones: [],
    initialSpeed: 58,
    initialTraction: 0,
    startOffset: 1_250,
    finishDistance: 10200,
    lineLimit: 70,
    targetBand: [50, 68],
    routeLabel: '坡顶—长大下坡—限速区',
    profile: downhillProfile,
    assessmentItems: downhillAssessmentItems,
    briefingSteps: ['1.2 km前完成LKJ、列尾与坡道确认', '-7‰前牵引回零并预置低级动力制动', '进入-13‰后按速度趋势逐级调整动力制动', '64 km/h且高位电制仍增速时及时补充空气制动', '速度回落后先缓解空气制动，保持动力制动完成充风', '8.2 km限速70→55前完成预控'],
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
