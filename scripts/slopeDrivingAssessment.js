const between = (value, min, max) => value >= min && value <= max;
const firstEvent = (events, predicate) => events.find(predicate);

export class SlopeDrivingAssessment {
  constructor(simulation) {
    this.simulation = simulation;
  }

  progress(state = this.simulation.state) {
    const e = state.events;
    const uphill = this.simulation.scenario.id === 'uphill';
    const checks = uphill ? [
      e.some((item) => item.type === 'lkj-open'),
      e.some((item) => item.type === 'callout'),
      e.some((item) => item.type === 'traction' && item.distance < 1400 && item.value >= 4),
      e.some((item) => item.type === 'sand' && item.distance < 3000),
      e.some((item) => item.type === 'traction' && item.distance > 7300 && item.value <= 3),
      state.completed,
    ] : [
      e.some((item) => item.type === 'lkj-open'),
      e.some((item) => item.type === 'tail-query' && item.distance < 1200),
      e.some((item) => item.type === 'callout'),
      e.some((item) => item.type === 'traction' && item.value < 0 && item.distance < 2400),
      e.some((item) => item.type === 'auto-brake' && item.value > 0),
      e.some((item) => item.type === 'auto-brake' && item.value === 0 && item.previous?.autoBrake > 0),
      e.some((item) => item.type === 'recharge-ready' && item.distance > 2000),
      state.samples.some((sample) => sample.distance >= 8000 && sample.speed <= 55.5),
      state.completed,
    ];
    return { done: checks.filter(Boolean).length, total: checks.length, checks };
  }

  result(state = this.simulation.state) {
    return this.simulation.scenario.id === 'uphill'
      ? this.uphillResult(state)
      : this.downhillResult(state);
  }

  commonRedlines(state) {
    return state.events.filter((event) => (
      event.type === 'slope-stall'
      || (event.type === 'lkj-level' && ['service', 'emergency'].includes(event.to))
      || event.type === 'direction-while-moving'
    ));
  }

  uphillResult(state) {
    const events = state.events;
    const samples = state.samples;
    const categories = [];

    let preparation = 10;
    if (!events.some((event) => event.type === 'lkj-open')) preparation -= 4;
    if (!events.some((event) => event.type === 'callout')) preparation -= 3;
    if (!events.some((event) => event.type === 'tail-query')) preparation -= 3;
    categories.push({ name: '坡道与设备确认', score: Math.max(0, preparation), maximum: 10 });

    const earlyTraction = firstEvent(events, (event) => event.type === 'traction' && event.value >= 4);
    let approach = 15;
    if (!earlyTraction || !between(earlyTraction.distance, 100, 1450)) approach -= 10;
    if (samples.some((sample) => sample.distance < 1200 && sample.speed > 70.8)) approach -= 5;
    categories.push({ name: '坡前牵引与动能储备', score: Math.max(0, approach), maximum: 15 });

    let climb = 25;
    const climbSamples = samples.filter((sample) => between(sample.distance, 2200, 7700));
    if (climbSamples.some((sample) => sample.speed < 35)) climb -= 10;
    if (state.tractionThermal > 35) climb -= 8;
    if (climbSamples.filter((sample) => sample.traction <= 1).length > 12) climb -= 7;
    categories.push({ name: '长大上坡牵引控制', score: Math.max(0, climb), maximum: 25 });

    let adhesion = 15;
    if (!events.some((event) => event.type === 'sand' && between(event.distance, 700, 3000))) adhesion -= 7;
    if (state.slipDuration > 8) adhesion -= 8;
    categories.push({ name: '撒砂与空转控制', score: Math.max(0, adhesion), maximum: 15 });

    let crest = 20;
    const crestReduction = events.find((event) => event.type === 'traction' && event.distance > 7200 && event.distance < 8500 && event.value <= 3);
    if (!crestReduction) crest -= 12;
    if (samples.some((sample) => sample.distance > 7700 && sample.speed > 70.8)) crest -= 8;
    categories.push({ name: '坡顶预判与控速', score: Math.max(0, crest), maximum: 20 });

    let smoothness = 15;
    const tractionMoves = events.filter((event) => event.type === 'traction');
    if (tractionMoves.length > 18) smoothness -= 5;
    if (tractionMoves.some((event) => Math.abs(event.value - event.previous.traction) >= 5)) smoothness -= 5;
    if (Math.max(0, ...samples.map((sample) => Math.abs(sample.acceleration))) > .75) smoothness -= 5;
    categories.push({ name: '平稳操纵', score: Math.max(0, smoothness), maximum: 15 });

    return this.finalize(state, categories);
  }

  downhillResult(state) {
    const events = state.events;
    const samples = state.samples;
    const categories = [];

    let preparation = 15;
    if (!events.some((event) => event.type === 'lkj-open')) preparation -= 4;
    if (!events.some((event) => event.type === 'tail-query' && event.distance < 1200)) preparation -= 7;
    if (!events.some((event) => event.type === 'callout')) preparation -= 4;
    categories.push({ name: '入坡检查与列尾查询', score: Math.max(0, preparation), maximum: 15 });

    const firstDynamic = events.find((event) => event.type === 'traction' && event.value < 0);
    let dynamic = 20;
    if (!firstDynamic || !between(firstDynamic.distance, 700, 2400)) dynamic -= 12;
    if (events.some((event) => event.type === 'traction' && event.value <= -7 && Math.abs(event.value - event.previous.traction) >= 6)) dynamic -= 5;
    if (samples.some((sample) => sample.distance > 2000 && sample.distance < 8000 && sample.speed > 68)) dynamic -= 3;
    categories.push({ name: '动力制动建立与稳速', score: Math.max(0, dynamic), maximum: 20 });

    const applications = events.filter((event) => event.type === 'auto-brake' && event.value > 0 && event.previous?.autoBrake === 0);
    let air = 20;
    if (!applications.length) air = 0;
    if (applications.some((event) => event.value < 1)) air -= 5;
    const rapidChanges = events.filter((event, index, list) => event.type === 'auto-brake' && list.slice(0, index).reverse().find((item) => item.type === 'auto-brake' && event.elapsed - item.elapsed < 4));
    if (rapidChanges.length) air -= 6;
    if (events.filter((event) => event.type === 'auto-brake' && event.value > 0).length > 7) air -= 4;
    categories.push({ name: '空气制动时机与减压', score: Math.max(0, air), maximum: 20 });

    const releases = events.filter((event) => event.type === 'auto-brake' && event.value === 0 && event.previous?.autoBrake > 0);
    let recharge = 20;
    if (!releases.length) recharge -= 10;
    const badRelease = releases.some((release) => release.previous?.traction >= 0);
    if (badRelease) recharge -= 5;
    if (!events.some((event) => event.type === 'recharge-ready' && event.distance > 2000)) recharge -= 5;
    categories.push({ name: '缓解顺序与充分充风', score: Math.max(0, recharge), maximum: 20 });

    let speedControl = 15;
    if (samples.some((sample) => sample.speed > sample.lineLimit + .8)) speedControl = 0;
    else if (!samples.some((sample) => sample.distance >= 8000 && sample.speed <= 55.5)) speedControl -= 8;
    if (samples.filter((sample) => sample.distance > 2000 && sample.speed < 40).length > 20) speedControl -= 4;
    categories.push({ name: '限速与速度带控制', score: Math.max(0, speedControl), maximum: 15 });

    let smoothness = 10;
    if (Math.max(0, ...samples.map((sample) => Math.abs(sample.acceleration))) > .8) smoothness -= 5;
    if (state.brakeHeat > 82) smoothness -= 5;
    categories.push({ name: '纵向平稳与热负荷', score: Math.max(0, smoothness), maximum: 10 });

    return this.finalize(state, categories);
  }

  finalize(state, categories) {
    let score = categories.reduce((sum, category) => sum + category.score, 0);
    const safetyEvents = this.commonRedlines(state);
    const redline = safetyEvents.length > 0;
    if (redline) score = Math.min(score, 59);
    const qualified = state.completed && !redline && score >= 80;
    return {
      score,
      qualified,
      redline,
      categories,
      duration: state.elapsed,
      distance: state.distance,
      finalSpeed: state.speed,
      maximumSpeed: Math.max(state.speed, ...state.samples.map((sample) => sample.speed)),
      summary: qualified ? '考评合格' : '考评不合格',
      safetyEvents,
    };
  }
}
