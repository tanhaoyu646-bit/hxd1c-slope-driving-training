const between = (value, min, max) => value >= min && value <= max;
const clampScore = (value) => Math.max(0, value);
const samplesBetween = (samples, min, max) => samples.filter((sample) => between(sample.distance, min, max));
const eventJump = (event, key) => Math.abs(event.value - (event.previous?.[key] ?? event.value));
const category = (name, score, maximum, evidence) => ({ name, score: clampScore(score), maximum, evidence });

export class SlopeDrivingAssessment {
  constructor(simulation) {
    this.simulation = simulation;
  }

  progress(state = this.simulation.state) {
    const events = state.events;
    const samples = state.samples;
    const uphill = this.simulation.scenario.id === 'uphill';
    const checks = uphill ? [
      events.some((item) => item.type === 'lkj-open')
        && events.some((item) => item.type === 'tail-query')
        && events.some((item) => item.type === 'callout'),
      state.distance >= 1500 && samples.filter((item) => item.distance < 1500 && item.speed >= 63).length >= 5,
      state.distance >= 2500 && events.some((item) => item.type === 'traction' && item.distance < 2700 && item.value >= 4),
      state.distance >= 8000 && samplesBetween(samples, 2500, 8000).some((item) => between(item.speed, 40, 62)),
      state.distance >= 3900 && state.slipDuration <= 6,
      state.distance >= 8600 && events.some((item) => item.type === 'traction' && between(item.distance, 7600, 8600) && item.value <= 3),
      state.completed,
    ] : [
      events.some((item) => item.type === 'lkj-open')
        && events.some((item) => item.type === 'tail-query' && item.distance < 1200)
        && events.some((item) => item.type === 'callout'),
      state.distance >= 2200 && events.some((item) => item.type === 'traction' && item.value < 0 && item.distance < 2200),
      state.distance >= 8200 && samplesBetween(samples, 2200, 8200).some((item) => between(item.speed, 48, 60)),
      events.some((item) => item.type === 'auto-brake' && item.value > 0),
      events.some((item) => item.type === 'recharge-ready' && item.distance > 2200),
      state.distance >= 8200 && samples.filter((item) => item.distance < 8200).at(-1)?.speed <= 55,
      state.completed,
    ];
    return {
      done: checks.filter(Boolean).length,
      total: checks.length,
      checks,
      items: this.simulation.scenario.assessmentItems,
    };
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
    if (!events.some((event) => event.type === 'lkj-open' && event.distance < 1500)) preparation -= 4;
    if (!events.some((event) => event.type === 'tail-query' && event.distance < 1500)) preparation -= 3;
    if (!events.some((event) => event.type === 'callout' && event.distance < 1500)) preparation -= 3;
    categories.push(category('坡前确认', preparation, 10, 'LKJ、列尾、呼唤应答在坡前完成'));

    const approachSamples = samplesBetween(samples, 0, 1500);
    const approachFastRatio = approachSamples.length
      ? approachSamples.filter((sample) => sample.speed >= 63).length / approachSamples.length
      : 0;
    const earlyTraction = events.find((event) => event.type === 'traction' && event.distance < 1500 && event.value >= 3);
    let rush = 15;
    if (approachFastRatio < .65) rush -= 5;
    if (approachSamples.some((sample) => sample.speed > sample.lineLimit + .5)) rush -= 5;
    if (!earlyTraction || events.some((event) => event.type === 'traction' && event.distance < 1500 && eventJump(event, 'traction') > 2)) rush -= 5;
    categories.push(category('坡前储能', rush, 15, '不超限、平稳加牵引，保持63—70 km/h'));

    const entrySamples = samplesBetween(samples, 1200, 2700);
    let entry = 15;
    if (!events.some((event) => event.type === 'traction' && event.distance < 2700 && event.value >= 4)) entry -= 6;
    if (events.some((event) => event.type === 'traction' && between(event.distance, 1200, 2700) && eventJump(event, 'traction') > 2)) entry -= 5;
    if (Math.min(state.speed, ...entrySamples.map((sample) => sample.speed)) < 52 || state.maxShockIndex > 72) entry -= 4;
    categories.push(category('入坡稳牵引', entry, 15, '先闯后爬但不猛推，允许速度自然回落'));

    const climbSamples = samplesBetween(samples, 2500, 8000);
    const outsideClimbRatio = climbSamples.length
      ? climbSamples.filter((sample) => !between(sample.speed, 40, 62)).length / climbSamples.length
      : 1;
    let climb = 20;
    if (Math.min(state.speed, ...climbSamples.map((sample) => sample.speed)) < 38) climb -= 8;
    if (outsideClimbRatio > .35) climb -= 6;
    if (state.tractionThermal > 35) climb -= 6;
    categories.push(category('持续爬坡', climb, 20, '40—62 km/h速度带内管理牵引与温升'));

    let adhesion = 15;
    if (state.slipDuration > 6) adhesion -= 8;
    const slipEvent = events.find((event) => event.type === 'wheel-slip-start');
    if (slipEvent) {
      const correction = events.find((event) => event.elapsed >= slipEvent.elapsed
        && event.elapsed - slipEvent.elapsed <= 4
        && (event.type === 'sand' || (event.type === 'traction' && event.value < event.previous.traction)));
      if (!correction) adhesion -= 7;
    }
    categories.push(category('黏着处置', adhesion, 15, '不强制撒砂；出现空转后4秒内降级或撒砂'));

    let crest = 15;
    if (!events.some((event) => event.type === 'traction' && between(event.distance, 7600, 8600) && event.value <= 3)) crest -= 8;
    if (samples.some((sample) => sample.distance > 8000 && sample.speed > sample.lineLimit + .5)) crest -= 7;
    categories.push(category('坡顶预控', crest, 15, '坡顶前回牵引，防止越顶加速超限'));

    const tractionMoves = events.filter((event) => event.type === 'traction');
    let smoothness = 10;
    if (state.maxShockIndex > 72) smoothness -= 5;
    if (tractionMoves.some((event) => eventJump(event, 'traction') > 3)) smoothness -= 3;
    if (tractionMoves.length > 28) smoothness -= 2;
    categories.push(category('纵向平稳', smoothness, 10, '避免大级位跳变和明显冲动'));

    return this.finalize(state, categories);
  }

  downhillResult(state) {
    const events = state.events;
    const samples = state.samples;
    const categories = [];

    let preparation = 10;
    if (!events.some((event) => event.type === 'lkj-open' && event.distance < 1200)) preparation -= 4;
    if (!events.some((event) => event.type === 'tail-query' && event.distance < 1200)) preparation -= 3;
    if (!events.some((event) => event.type === 'callout' && event.distance < 1200)) preparation -= 3;
    categories.push(category('入坡确认', preparation, 10, 'LKJ、列尾、呼唤应答在入坡前完成'));

    const firstDynamic = events.find((event) => event.type === 'traction' && event.value < 0);
    let dynamic = 15;
    if (!firstDynamic || !between(firstDynamic.distance, 400, 2200)) dynamic -= 7;
    if (events.some((event) => event.type === 'traction' && event.distance < 2200 && eventJump(event, 'traction') > 2)) dynamic -= 4;
    if (samplesBetween(samples, 0, 2200).some((sample) => sample.speed > 62)) dynamic -= 4;
    categories.push(category('预置动力制动', dynamic, 15, '入坡前逐级建立动力制动，入口不超过62 km/h'));

    const descentSamples = samplesBetween(samples, 2200, 8200);
    const outsideRatio = descentSamples.length
      ? descentSamples.filter((sample) => !between(sample.speed, 48, 60)).length / descentSamples.length
      : 1;
    const dynamicRatio = descentSamples.length
      ? descentSamples.filter((sample) => sample.dynamicBrakeForce > 0).length / descentSamples.length
      : 0;
    let descent = 20;
    if (outsideRatio > .18) descent -= 10;
    if (descentSamples.some((sample) => sample.speed > 64)) descent -= 5;
    if (dynamicRatio < .7) descent -= 5;
    categories.push(category('长坡稳速', descent, 20, '动力制动为主，48—60 km/h稳定运行'));

    const applications = events.filter((event) => event.type === 'auto-brake' && event.value > 0 && event.previous?.autoBrake === 0);
    let air = 15;
    if (!applications.length) air -= 8;
    const maximumReduction = Math.max(0, ...samples.map((sample) => this.simulation.scenario.nominalPipePressure - sample.trainPipe));
    if (maximumReduction < 45) air -= 4;
    const autoEvents = events.filter((event) => event.type === 'auto-brake');
    if (autoEvents.some((event, index) => index > 0 && event.elapsed - autoEvents[index - 1].elapsed < 6)) air -= 3;
    categories.push(category('空气补充制动', air, 15, '速度上沿时一次有效减压，避免频繁小减压'));

    const releases = events.filter((event) => event.type === 'auto-brake' && event.value === 0 && event.previous?.autoBrake > 0);
    let recharge = 15;
    if (!releases.length || releases.some((event) => event.previous?.traction >= 0)) recharge -= 5;
    if (!events.some((event) => event.type === 'recharge-ready' && event.distance > 2200)) recharge -= 6;
    const interlockSamples = samples.filter((sample) => sample.brake > 0 && sample.traction < 0);
    if (!interlockSamples.some((sample) => sample.locomotiveCylinder < 90 && sample.dynamicBrakeForce > 0)) recharge -= 4;
    categories.push(category('缓解充风与联锁', recharge, 15, '保留动力制动缓解空气制动，确认充风；单缓≥90 kPa切除动力制动'));

    const restrictionSamples = samples.filter((sample) => sample.distance >= 8200);
    const preRestriction = samples.filter((sample) => sample.distance < 8200).at(-1);
    let restriction = 15;
    if (!preRestriction || preRestriction.speed > 55) restriction -= 10;
    if (restrictionSamples.some((sample) => sample.speed > sample.lineLimit + .5)) restriction -= 5;
    categories.push(category('限速预控', restriction, 15, '限速点前降至55 km/h及以下，严禁压点制动'));

    const autoMoves = events.filter((event) => event.type === 'auto-brake');
    let smoothness = 10;
    if (state.maxShockIndex > 72) smoothness -= 4;
    if (state.brakeHeat > 80) smoothness -= 3;
    if (autoMoves.length > 10) smoothness -= 3;
    categories.push(category('纵向与热负荷', smoothness, 10, '冲动、闸瓦热负荷和制动次数受控'));

    return this.finalize(state, categories);
  }

  finalize(state, categories) {
    let score = categories.reduce((sum, item) => sum + item.score, 0);
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
