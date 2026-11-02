const between = (value, min, max) => value >= min && value <= max;
const clampScore = (value) => Math.max(0, value);
const samplesBetween = (samples, min, max) => samples.filter((sample) => between(sample.distance, min, max));
const category = (name, score, maximum, evidence) => ({ name, score: clampScore(score), maximum, evidence });

export class SlopeDrivingAssessment {
  constructor(simulation) {
    this.simulation = simulation;
  }

  progress(state = this.simulation.state) {
    const events = state.events;
    const samples = state.samples;
    const uphill = this.simulation.scenario.id === 'uphill';
    const rawChecks = uphill ? [
      events.some((item) => item.type === 'lkj-open' && item.distance < 1500)
        && events.some((item) => item.type === 'tail-query' && item.distance < 1500)
        && events.some((item) => item.type === 'callout' && item.distance < 1500),
      state.distance >= 1500 && samples.filter((item) => item.distance < 1500 && item.speed >= 63).length >= 5,
      state.distance >= 2500 && samplesBetween(samples, 1200, 2700).some((item) => item.traction > 0),
      state.distance >= 3300 && samplesBetween(samples, 2500, state.distance).filter((item) => between(item.speed, 40, 62)).length >= 5,
      state.distance >= 3900 && state.slipEncountered && state.slipReductionValid
        && state.slipSandAfterReduction && state.slipDuration <= 6,
      state.distance >= 8600 && events.some((item) => item.type === 'traction' && between(item.distance, 7600, 8800) && item.value < item.previous?.traction),
      state.completed,
    ] : [
      events.some((item) => item.type === 'lkj-open' && item.distance < 1200)
        && events.some((item) => item.type === 'tail-query' && item.distance < 1200)
        && events.some((item) => item.type === 'callout' && item.distance < 1200),
      state.distance >= 2200 && events.some((item) => item.type === 'traction' && item.value < 0 && between(item.distance, 400, 1600)),
      state.distance >= 3500 && samplesBetween(samples, 2200, state.distance).filter((item) => between(item.speed, 52, 68)).length >= 5,
      state.distance >= 8200 && (!events.some((item) => item.type === 'air-brake-required')
        || events.some((item) => item.type === 'air-brake-effective')),
      state.distance >= 8200 && (!events.some((item) => item.type === 'auto-brake' && item.value > 0)
        || (events.some((item) => item.type === 'recharge-ready' && item.distance > 2200)
          && events.some((item) => item.type === 'auto-brake' && item.value === 0 && item.previous?.autoBrake > 0))),
      state.distance >= 8200 && samples.filter((item) => item.distance < 8200).at(-1)?.speed <= 55,
      state.completed,
    ];
    const checks = rawChecks.map(Boolean);
    const windows = uphill
      ? [[0, 1500], [0, 1500], [1200, 2700], [2500, 8000], [2500, 8000], [7600, 8800], [0, Infinity]]
      : [[0, 1200], [400, 2200], [2200, 8200], [2200, 8200], [2200, 9000], [7000, 8200], [0, Infinity]];
    const statuses = checks.map((done, index) => {
      if (done) return 'done';
      const [start, end] = windows[index];
      return state.distance >= start && state.distance <= end ? 'active' : state.distance > end ? 'settled' : 'pending';
    });
    const currentIndex = statuses.findIndex((status) => status === 'active');
    return {
      done: checks.filter(Boolean).length,
      total: checks.length,
      checks,
      rawChecks,
      statuses,
      currentIndex,
      items: this.simulation.scenario.assessmentItems,
    };
  }

  result(state = this.simulation.state) {
    return this.simulation.scenario.id === 'uphill'
      ? this.uphillResult(state)
      : this.downhillResult(state);
  }

  commonRedlines(state) {
    const events = state.events.filter((event) => (
      event.type === 'slope-stall'
      || event.type === 'manual-emergency-brake'
      || (event.type === 'lkj-level' && ['service', 'emergency'].includes(event.to))
      || event.type === 'direction-while-moving'
    ));
    const overspeed = state.samples.find((sample) => sample.speed > sample.lineLimit + .5);
    if (overspeed) events.push({ type: 'line-overspeed', distance: overspeed.distance, speed: overspeed.speed, limit: overspeed.lineLimit });
    return events;
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
    const rushNotes = [];
    if (approachFastRatio < .65) { rush -= 5; rushNotes.push('坡前63 km/h以上时间不足'); }
    if (approachSamples.some((sample) => sample.speed > sample.lineLimit + .5)) { rush -= 5; rushNotes.push('坡前超过线路限速'); }
    if (!earlyTraction) { rush -= 3; rushNotes.push('1.5 km前未建立3级以上牵引'); }
    const approachSkips = events.filter((event) => event.type === 'traction-skip' && event.distance < 1500);
    if (approachSkips.length) { rush -= Math.min(5, approachSkips.reduce((sum, event) => sum + event.skipped, 0)); rushNotes.push(`坡前越级累计${approachSkips.reduce((sum, event) => sum + event.skipped, 0)}级`); }
    categories.push(category('坡前储能', rush, 15, rushNotes.join('；') || '限速内逐级建立牵引，保持63—70 km/h'));

    const entrySamples = samplesBetween(samples, 1200, 2700);
    let entry = 15;
    const entryNotes = [];
    if (!entrySamples.some((sample) => sample.traction > 0)) { entry -= 6; entryNotes.push('入坡阶段未保持牵引'); }
    const entrySkips = events.filter((event) => event.type === 'traction-skip' && between(event.distance, 1200, 2700));
    if (entrySkips.length) { entry -= Math.min(5, entrySkips.reduce((sum, event) => sum + event.skipped, 0)); entryNotes.push('入坡加载存在越级'); }
    if (!entrySamples.length || Math.min(...entrySamples.map((sample) => sample.speed)) < 50 || state.maxShockIndex > 72) { entry -= 4; entryNotes.push('入坡速度或冲动控制不合格'); }
    categories.push(category('坡道主机加载', entry, 15, entryNotes.join('；') || '按速度趋势逐级加载，已有牵引足够时合理保持'));

    const climbSamples = samplesBetween(samples, 2500, 8000);
    const outsideClimbRatio = climbSamples.length
      ? climbSamples.filter((sample) => !between(sample.speed, 40, 62)).length / climbSamples.length
      : 1;
    let climb = 20;
    if (!climbSamples.length || Math.min(...climbSamples.map((sample) => sample.speed)) < 38) climb -= 8;
    if (outsideClimbRatio > .35) climb -= 6;
    if (state.tractionThermal > 35) climb -= 6;
    categories.push(category('持续爬坡', climb, 20, '40—62 km/h速度带内管理牵引与温升'));

    let adhesion = 15;
    if (!state.slipEncountered) adhesion -= 5;
    if (!state.slipReductionValid || state.slipReducedAt == null) adhesion -= 5;
    if (!state.slipSandAfterReduction || state.slipSandedAt == null) adhesion -= 4;
    if (state.slipDuration > 6) adhesion -= 4;
    if (state.slipRecoveryError) adhesion -= 2;
    if (state.unnecessarySandingCount > 0) adhesion -= Math.min(3, state.unnecessarySandingCount);
    const adhesionNotes = [];
    if (!state.slipReductionValid) adhesionNotes.push('空转后未正确降低1～2级');
    if (!state.slipSandAfterReduction) adhesionNotes.push('未在降级后4秒内短时撒砂');
    if (state.slipRecoveryError) adhesionNotes.push('黏着恢复后加载过早或越级');
    if (state.unnecessarySandingCount > 0) adhesionNotes.push(`无效撒砂${state.unnecessarySandingCount}次`);
    categories.push(category('降级撒砂', adhesion, 15, adhesionNotes.join('；') || '降级、撒砂和恢复加载顺序正确'));

    let crest = 15;
    const crestMoves = events.filter((event) => event.type === 'traction' && between(event.distance, 7600, 8800));
    if (!crestMoves.some((event) => event.value < event.previous?.traction)) crest -= 8;
    if (samples.some((sample) => sample.distance > 8000 && sample.speed > sample.lineLimit + .5)) crest -= 7;
    categories.push(category('坡顶预控', crest, 15, '坡顶前回牵引，防止越顶加速超限'));

    const tractionMoves = events.filter((event) => event.type === 'traction');
    let smoothness = 10;
    if (state.maxShockIndex > 72) smoothness -= 5;
    if (state.notchSkipCount > 0) smoothness -= Math.min(5, state.notchSkipCount);
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
    const dynamicNotes = [];
    if (!firstDynamic || !between(firstDynamic.distance, 400, 1600)) { dynamic -= 7; dynamicNotes.push('动力制动投入位置不正确'); }
    if (events.some((event) => event.type === 'traction-skip' && event.distance < 2200)) { dynamic -= 4; dynamicNotes.push('入坡前动力制动越级'); }
    const entrySamples = samplesBetween(samples, 1200, 2200);
    if (entrySamples.some((sample) => sample.speed > 62)) { dynamic -= 4; dynamicNotes.push('-13‰入口速度超过62 km/h'); }
    if (entrySamples.length && Math.min(...entrySamples.map((sample) => sample.speed)) < 50) { dynamic -= 4; dynamicNotes.push('入口低于50 km/h，存在过量制动'); }
    categories.push(category('预置动力制动', dynamic, 15, dynamicNotes.join('；') || '逐级建立动力制动，入口速度控制合理'));

    const descentSamples = samplesBetween(samples, 2200, 8200);
    const outsideRatio = descentSamples.length
      ? descentSamples.filter((sample) => !between(sample.speed, 50, 68)).length / descentSamples.length
      : 1;
    const dynamicRatio = descentSamples.length
      ? descentSamples.filter((sample) => sample.dynamicBrakeForce > 0).length / descentSamples.length
      : 0;
    let descent = 20;
    if (outsideRatio > .18) descent -= 8;
    if (descentSamples.some((sample) => sample.speed > 68)) descent -= 5;
    if (descentSamples.some((sample) => sample.speed > 70)) descent -= 4;
    if (dynamicRatio < .7) descent -= 5;
    const descentNotes = [];
    if (outsideRatio > .18) descentNotes.push('50—68 km/h范围外时间过长');
    if (descentSamples.some((sample) => sample.speed > 68)) descentNotes.push('超过68 km/h教学预控上限');
    if (descentSamples.some((sample) => sample.speed > 70)) descentNotes.push('超过70 km/h线路限速');
    categories.push(category('长坡稳速', descent, 20, descentNotes.join('；') || '动力制动为主，速度与趋势控制正确'));

    const applications = events.filter((event) => event.type === 'auto-brake' && event.value > 0 && event.previous?.autoBrake === 0);
    const airNeeded = events.some((event) => event.type === 'air-brake-required');
    const timelyAir = events.some((event) => event.type === 'air-brake-timely');
    const effectiveAir = events.some((event) => event.type === 'air-brake-effective');
    let air = 15;
    if (airNeeded && !applications.length) air -= 8;
    else if (airNeeded && !timelyAir) air -= 5;
    if (airNeeded && !effectiveAir) air -= 3;
    if (!airNeeded && applications.some((event) => event.speed < 60)) air -= 4;
    if (applications.some((event) => event.previous?.traction >= 0)) air -= 4;
    const maximumReduction = Math.max(0, ...samples.map((sample) => this.simulation.scenario.nominalPipePressure - sample.trainPipe));
    if (applications.length && maximumReduction < 50) air -= 4;
    const autoEvents = events.filter((event) => event.type === 'auto-brake');
    if (autoEvents.some((event, index) => index > 0 && event.elapsed - autoEvents[index - 1].elapsed < 6)) air -= 3;
    if (state.combinedBrakeErrors > 0) air -= Math.min(5, state.combinedBrakeErrors * 3);
    const airNotes = [];
    if (airNeeded && !timelyAir) airNotes.push('64 km/h持续增速后未在6秒内投入空气制动');
    if (airNeeded && !effectiveAir) airNotes.push('空气制动未形成有效减压');
    if (state.combinedBrakeErrors > 0) airNotes.push(`电空联合制动配合错误${state.combinedBrakeErrors}次`);
    categories.push(category('空气补充制动', air, 15, airNotes.join('；') || (airNeeded ? '空气制动投入及时且保持动力制动' : '未达到空气制动触发条件')));

    const releases = events.filter((event) => event.type === 'auto-brake' && event.value === 0 && event.previous?.autoBrake > 0);
    let recharge = 15;
    if (applications.length && (!releases.length || releases.some((event) => event.previous?.traction >= 0))) recharge -= 5;
    if (applications.length && !events.some((event) => event.type === 'recharge-ready' && event.distance > 2200)) recharge -= 6;
    const interlockSamples = samples.filter((sample) => sample.brake > 0 && sample.traction < 0);
    if (applications.length && !interlockSamples.some((sample) => sample.locomotiveCylinder < 90 && sample.dynamicBrakeForce > 0)) recharge -= 4;
    if (state.combinedBrakeErrors > 0) recharge -= Math.min(5, state.combinedBrakeErrors * 3);
    const rechargeNotes = [];
    if (applications.length && !releases.length) rechargeNotes.push('未完成空气制动缓解');
    if (applications.length && !events.some((event) => event.type === 'recharge-ready' && event.distance > 2200)) rechargeNotes.push('未等待首尾充分充风');
    if (state.combinedBrakeErrors > 0) rechargeNotes.push('空气制动作用时错误回退动力制动');
    categories.push(category('缓解充风与联锁', recharge, 15, rechargeNotes.join('；') || '先缓解空气制动，保持动力制动并完成充风'));

    const restrictionSamples = samples.filter((sample) => sample.distance >= 8200);
    const preRestriction = samples.filter((sample) => sample.distance < 8200).at(-1);
    let restriction = 15;
    if (!preRestriction || preRestriction.speed > 55) restriction -= 10;
    if (restrictionSamples.some((sample) => sample.speed > sample.lineLimit + .5)) restriction -= 5;
    categories.push(category('限速预控', restriction, 15, '限速点前降至55 km/h及以下，严禁压点制动'));

    const autoMoves = events.filter((event) => event.type === 'auto-brake');
    let smoothness = 10;
    if (state.maxShockIndex > 72) smoothness -= 4;
    if (state.notchSkipCount > 0) smoothness -= Math.min(4, state.notchSkipCount);
    if (autoMoves.length > 10) smoothness -= 3;
    categories.push(category('纵向平稳与制动操作', smoothness, 10, '避免冲动、越级和频繁调整空气制动'));

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
