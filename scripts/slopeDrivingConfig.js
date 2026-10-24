export const PROJECT_ID = 'hxd1c-slope-driving-training-v1';

export const CAB = Object.freeze({ width: 640, height: 480 });

// 原 HXD1C 驾驶台 CVF 贴图并非按 0—5 连续排列自阀位置。
// 前三帧位于第一行，后三帧位于最后一行。
export const AUTO_BRAKE_SPRITE_FRAMES = Object.freeze([0, 1, 2, 9, 10, 11]);

export const INDEPENDENT_BRAKE_POSITIONS = Object.freeze([
  '缓解位', '制动Ⅰ', '制动Ⅱ', '制动Ⅲ', '制动Ⅳ', '全制动位',
]);

export const DIRECTION_POSITIONS = Object.freeze(['F', 'N', 'R']);

export const BRAKE_POSITIONS = Object.freeze([
  { value: 0, label: '运转位', reduction: 0 },
  { value: 1, label: '初制位', reduction: 50 },
  { value: 2, label: '常用Ⅱ', reduction: 90 },
  { value: 3, label: '常用Ⅲ', reduction: 130 },
  { value: 4, label: '常用Ⅳ', reduction: 170 },
  { value: 5, label: '紧急位', reduction: 600 },
]);

const uphillProfile = Object.freeze([
  { id: 'approach', start: 0, end: 1200, gradeStart: 0, gradeEnd: 2, label: '坡前准备区' },
  { id: 'entry', start: 1200, end: 2200, gradeStart: 6, gradeEnd: 6, label: '一般上坡区' },
  { id: 'climb', start: 2200, end: 7700, gradeStart: 12, gradeEnd: 12, label: '长大上坡区' },
  { id: 'crest', start: 7700, end: 8300, gradeStart: 6, gradeEnd: 0, label: '坡顶调整区' },
  { id: 'after-crest', start: 8300, end: 9500, gradeStart: -4, gradeEnd: -4, label: '坡顶后控速区' },
]);

const downhillProfile = Object.freeze([
  { id: 'approach', start: 0, end: 1000, gradeStart: 0, gradeEnd: -3, label: '坡顶准备区' },
  { id: 'entry', start: 1000, end: 2000, gradeStart: -6, gradeEnd: -6, label: '动力制动建立区' },
  { id: 'descent', start: 2000, end: 8000, gradeStart: -12, gradeEnd: -12, label: '长大下坡区' },
  { id: 'restriction', start: 8000, end: 9200, gradeStart: -8, gradeEnd: -8, label: '限速调速区' },
  { id: 'runout', start: 9200, end: 10000, gradeStart: -3, gradeEnd: 0, label: '坡底调整区' },
]);

export const SCENARIOS = Object.freeze({
  uphill: Object.freeze({
    id: 'uphill',
    title: '长大上坡道驾驶与调速',
    shortTitle: '上坡调速',
    trainType: '普通货物列车',
    totalMassKg: 2_800_000,
    initialSpeed: 68,
    initialTraction: 0,
    startOffset: 18_500,
    finishDistance: 9500,
    lineLimit: 70,
    targetBand: [50, 68],
    routeLabel: '坡前—长大上坡—坡顶',
    profile: uphillProfile,
    restrictions: [{ start: 0, limit: 70 }],
    markers: [
      { distance: 1200, label: '+6‰  1.0 km' },
      { distance: 2200, label: '+12‰  5.5 km' },
      { distance: 7700, label: '+6‰  0.6 km' },
      { distance: 8300, label: '-4‰  1.2 km' },
    ],
  }),
  downhill: Object.freeze({
    id: 'downhill',
    title: '长大下坡道调速与制动',
    shortTitle: '下坡制动',
    trainType: '普通货物列车',
    totalMassKg: 4_200_000,
    initialSpeed: 60,
    initialTraction: 0,
    startOffset: 18_300,
    finishDistance: 10000,
    lineLimit: 70,
    targetBand: [52, 64],
    routeLabel: '坡顶—长大下坡—限速区',
    profile: downhillProfile,
    restrictions: [
      { start: 0, limit: 70 },
      { start: 8000, limit: 55 },
    ],
    markers: [
      { distance: 1000, label: '-6‰  1.0 km' },
      { distance: 2000, label: '-12‰  6.0 km' },
      { distance: 8000, label: '-8‰  限55' },
      { distance: 9200, label: '-3‰  0.8 km' },
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
