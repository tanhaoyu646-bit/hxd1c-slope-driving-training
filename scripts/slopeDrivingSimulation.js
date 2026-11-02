import {
  adhesionAt,
  BRAKE_POSITIONS,
  DYNAMIC_BRAKE_MAX,
  getScenario,
  gradeAt,
  INDEPENDENT_BRAKE_MAX,
  lineLimitAt,
  lkjControlLimit,
  phaseAt,
  targetBandAt,
  TRACTION_MAX,
  tractionTargetSpeed,
} from './slopeDrivingConfig.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class SlopeDrivingSimulation extends EventTarget {
  constructor(scenarioId = 'uphill') {
    super();
    this.reset(scenarioId);
  }

  reset(scenarioId = this.state?.scenarioId || 'uphill') {
    const scenario = getScenario(scenarioId);
    const nominalPipe = scenario.nominalPipePressure;
    this.scenario = scenario;
    this.state = {
      scenarioId: scenario.id,
      mode: 'assessment',
      status: 'ready',
      elapsed: 0,
      distance: 0,
      speed: scenario.initialSpeed,
      acceleration: 0,
      jerk: 0,
      speedTrend: 0,
      shockIndex: 0,
      maxShockIndex: 0,
      shockStickTilt: 0,
      shockStickFallen: 0,
      controlShock: 0,
      notchSkipCount: 0,
      couplerForce: 0,
      traction: scenario.initialTraction,
      tractionTargetSpeed: tractionTargetSpeed(scenario.initialTraction),
      balanceSpeed: 0,
      direction: 'F',
      autoBrake: 0,
      independentBrake: 0,
      sideRelease: false,
      hornActive: false,
      hornCount: 0,
      mainReservoir: 900,
      equalizingReservoir: nominalPipe,
      trainPipe: nominalPipe,
      tailPipe: nominalPipe,
      trainBrakeCylinder: 0,
      brakeCylinder: 0,
      locomotiveCylinder: 0,
      grade: gradeAt(scenario, 0),
      phase: phaseAt(scenario, 0),
      targetBand: targetBandAt(scenario, 0),
      adhesionCoefficient: adhesionAt(scenario, 0),
      lineLimit: lineLimitAt(scenario, 0),
      lkjLimit: lkjControlLimit(scenario, 0),
      lkjLevel: 'normal',
      lkjAcknowledged: true,
      lkjForcedBrake: 0,
      lkjOpenCount: 0,
      calloutCount: 0,
      cirOpenCount: 0,
      tailDeviceId: '100001',
      tailDeviceLinked: true,
      tailQueryCount: 0,
      sandRemaining: 0,
      sandingCount: 0,
      unnecessarySandingCount: 0,
      lastSandAt: -999,
      lastCalloutAt: -999,
      wheelSlip: false,
      slipDuration: 0,
      slipEncountered: false,
      slipReducedAt: null,
      slipReductionValid: false,
      slipSandedAt: null,
      slipSandAfterReduction: false,
      slipEndedAt: null,
      slipRecoveryValid: false,
      slipRecoveryError: false,
      tractionForce: 0,
      dynamicBrakeForce: 0,
      airBrakeForce: 0,
      rollingResistance: 0,
      gradeForce: 0,
      tractionCurrent: 0,
      tractionThermal: 0,
      brakeHeat: 0,
      rechargeReady: true,
      airNeedTimer: 0,
      airRequiredAt: null,
      airControlState: 'idle',
      combinedBrakeErrors: 0,
      suppressionHeld: 0,
      completed: false,
      qualified: null,
      events: [],
      samples: [],
    };
    this.lastSampleAt = -1;
    this.previousPhaseId = this.state.phase.id;
    this.previousSlip = false;
    this.previousRecharge = true;
    this.lowSpeedTime = 0;
    this.previousAcceleration = 0;
    this.rapidTraction = { start: scenario.initialTraction, direction: 0, lastAt: -999, counted: 0 };
    this.adhesionSeed = Math.random() * Math.PI * 2;
    this.dispatchEvent(new CustomEvent('reset', { detail: this.state }));
    return this.state;
  }

  start() {
    if (this.state.status === 'ready') {
      this.state.status = 'running';
      this.log('attempt-start', { scenarioId: this.state.scenarioId });
      this.emitChange();
    }
  }

  command(type, value) {
    const s = this.state;
    if (s.completed) return false;
    if (s.status === 'ready' && type !== 'lkj-open') this.start();
    const previous = {
      traction: s.traction,
      autoBrake: s.autoBrake,
      independentBrake: s.independentBrake,
      sideRelease: s.sideRelease,
    };
    if (type === 'traction') {
      const requested = clamp(Math.round(Number(value) || 0), -DYNAMIC_BRAKE_MAX, TRACTION_MAX);
      if (requested === s.traction) return false;
      const previousTraction = s.traction;
      const delta = requested - previousTraction;
      const step = Math.abs(delta);
      const direction = Math.sign(delta);
      let skipped = Math.max(0, step - 1);
      let skipKind = step > 1 ? 'direct' : '';
      if (step === 1) {
        const rapid = direction === this.rapidTraction.direction && s.elapsed - this.rapidTraction.lastAt <= 1.2;
        if (!rapid) {
          this.rapidTraction.start = previousTraction;
          this.rapidTraction.counted = 0;
        }
        const rapidSpan = Math.abs(requested - this.rapidTraction.start);
        const rapidSkipped = Math.max(0, rapidSpan - 1);
        skipped = Math.max(0, rapidSkipped - this.rapidTraction.counted);
        if (skipped > 0) skipKind = 'rapid';
        this.rapidTraction.counted = rapidSkipped;
      } else {
        this.rapidTraction.start = requested;
        this.rapidTraction.counted = 0;
      }
      this.rapidTraction.direction = direction;
      this.rapidTraction.lastAt = s.elapsed;
      s.traction = requested;
      s.tractionTargetSpeed = tractionTargetSpeed(s.traction);
      if (skipped > 0) {
        s.notchSkipCount += skipped;
        s.shockStickFallen = clamp(s.shockStickFallen + skipped, 0, 6);
        s.shockStickTilt = Math.max(s.shockStickTilt, s.shockStickFallen * 15);
        s.controlShock = clamp(s.controlShock + 34 + skipped * 8, 0, 100);
        this.log('traction-skip', { value: requested, from: previousTraction, skipped, kind: skipKind });
      }
      if (s.slipEncountered && s.slipReducedAt == null && requested < previousTraction) {
        const reduction = previousTraction - requested;
        s.slipReducedAt = s.elapsed;
        s.slipReductionValid = reduction >= 1 && reduction <= 2;
        this.log('slip-traction-reduced', { reduction, valid: s.slipReductionValid });
      } else if (s.slipEndedAt != null && requested > previousTraction && !s.slipRecoveryValid) {
        const delay = s.elapsed - s.slipEndedAt;
        const valid = step === 1 && delay >= 2;
        s.slipRecoveryValid = valid;
        s.slipRecoveryError = !valid;
        this.log('slip-traction-recovery', { delay, valid });
      }
      if (s.autoBrake > 0 && previousTraction < 0 && requested > previousTraction) {
        const reason = requested === 0 ? '空气制动作用中动力制动提前回零' : step > 1 ? '空气制动作用中动力制动跨级回退' : '';
        if (reason) {
          s.combinedBrakeErrors += 1;
          this.log('combined-brake-error', { reason, from: previousTraction, to: requested });
        }
      }
    } else if (type === 'auto-brake') {
      const requested = clamp(Math.round(Number(value) || 0), 0, BRAKE_POSITIONS.length - 1);
      if (requested === s.autoBrake) return false;
      if (requested === 10 && (s.speed > 1 || s.direction !== 'N')) {
        this.log('auto-brake-rejected', { requested, reason: '操纵端运行中不得置重联位' });
        return false;
      }
      s.autoBrake = requested;
      if (requested === 11) this.log('manual-emergency-brake');
      if (previous.autoBrake === 0 && requested > 0 && s.airRequiredAt != null) {
        const delay = s.elapsed - s.airRequiredAt;
        s.airControlState = delay <= 6 && s.speed < 68 ? 'commanded-timely' : 'commanded-late';
        this.log(delay <= 6 && s.speed < 68 ? 'air-brake-timely' : 'air-brake-late', { delay, requiredAt: s.airRequiredAt });
      }
    } else if (type === 'independent-brake') {
      s.independentBrake = clamp(Math.round(Number(value) || 0), 0, INDEPENDENT_BRAKE_MAX);
    }
    else if (type === 'side-release') s.sideRelease = Boolean(value);
    else if (type === 'sand') {
      if (s.elapsed - s.lastSandAt < 2.5) {
        this.log('sand-rejected', { reason: '重复撒砂间隔不足' });
        return false;
      }
      s.lastSandAt = s.elapsed;
      s.sandRemaining = Math.max(s.sandRemaining, 5);
      s.sandingCount += 1;
      const useful = s.traction > 0 && (s.wheelSlip || s.adhesionCoefficient < .285);
      if (!useful) s.unnecessarySandingCount += 1;
      this.log('sand', { useful });
      if (s.slipEncountered && s.slipSandedAt == null) {
        s.slipSandedAt = s.elapsed;
        s.slipSandAfterReduction = s.slipReducedAt != null && s.elapsed - s.slipReducedAt <= 4;
        this.log('slip-sand-sequence', { valid: useful && s.slipSandAfterReduction });
      }
    } else if (type === 'shock-reset') {
      s.shockStickTilt = 0;
      s.shockStickFallen = 0;
      this.log('shock-stick-reset', { retainedMaximum: s.maxShockIndex });
    } else if (type === 'cir-open') {
      s.cirOpenCount += 1;
      this.log('cir-open');
    } else if (type === 'tail-link') {
      s.tailDeviceId = String(value || '').replace(/\D/g, '').slice(-6);
      s.tailDeviceLinked = s.tailDeviceId.length === 6;
      this.log('tail-link', { id: s.tailDeviceId, linked: s.tailDeviceLinked });
    } else if (type === 'tail-unlink') {
      s.tailDeviceId = '';
      s.tailDeviceLinked = false;
      this.log('tail-unlink');
    } else if (type === 'tail-query') {
      if (!s.tailDeviceLinked) {
        this.log('tail-query-rejected', { reason: '列尾装置未连接' });
        return false;
      }
      s.tailQueryCount += 1;
      this.log('tail-query', { tailPipe: Number(value) || s.tailPipe, headPipe: s.trainPipe, deviceId: s.tailDeviceId });
    } else if (type === 'direction') {
      if (!['F', 'N', 'R'].includes(value)) return false;
      if (s.speed > 1) {
        this.log('direction-while-moving', { requested: value, retained: s.direction });
        return false;
      }
      s.direction = value;
      this.log('direction', { value });
    } else if (type === 'callout') {
      if (s.elapsed - s.lastCalloutAt < 3) {
        this.log('callout-rejected', { reason: '重复呼唤间隔不足' });
        return false;
      }
      s.lastCalloutAt = s.elapsed;
      s.calloutCount += 1;
      this.log('callout', { phase: s.phase.id, grade: s.grade });
    } else if (type === 'lkj-open') {
      s.lkjOpenCount += 1;
      this.log('lkj-open');
    } else if (type === 'lkj-ack') {
      s.lkjAcknowledged = true;
      this.log('lkj-ack', { level: s.lkjLevel });
    } else if (type === 'lkj-relief') {
      if (s.lkjLevel === 'normal' && s.speed <= s.lkjLimit + 1) {
        s.lkjForcedBrake = 0;
        this.log('lkj-relief', { accepted: true });
      } else this.log('lkj-relief', { accepted: false });
    } else if (type === 'horn-start') {
      if (!s.hornActive) {
        s.hornActive = true;
        s.hornCount += 1;
        this.log('horn-start');
      }
    } else if (type === 'horn-stop') {
      if (s.hornActive) this.log('horn-stop');
      s.hornActive = false;
    } else return false;

    if (['traction', 'auto-brake', 'independent-brake', 'side-release'].includes(type)) {
      const key = type === 'auto-brake' ? 'autoBrake' : type === 'independent-brake' ? 'independentBrake' : type === 'side-release' ? 'sideRelease' : 'traction';
      const before = type === 'side-release' ? Number(previous.sideRelease) : Number(previous[key]);
      const after = type === 'side-release' ? Number(s.sideRelease) : Number(s[key]);
      const step = Math.abs(after - before);
      const impulse = type === 'auto-brake' ? step * 10 : type === 'traction' ? step * 7 : step * 6;
      s.controlShock = clamp(s.controlShock + impulse, 0, 100);
      this.log(type, { value: s[key], previous });
    }
    this.emitChange();
    return true;
  }

  log(type, data = {}) {
    this.state.events.push({
      type,
      elapsed: this.state.elapsed,
      distance: this.state.distance,
      speed: this.state.speed,
      grade: this.state.grade,
      ...data,
    });
  }

  tick(dt) {
    const s = this.state;
    if (s.status !== 'running' || s.completed) return;
    dt = clamp(Number(dt) || 0, 0, .08);
    s.elapsed += dt;
    s.sandRemaining = Math.max(0, s.sandRemaining - dt);

    const nominalPipe = this.scenario.nominalPipePressure;
    const handleReduction = BRAKE_POSITIONS[s.autoBrake]?.reduction || 0;
    const lkjReduction = BRAKE_POSITIONS[s.lkjForcedBrake]?.reduction || 0;
    const requestedReduction = Math.max(handleReduction, lkjReduction);
    const targetPipe = Math.max(0, nominalPipe - requestedReduction);
    const pipeTau = targetPipe < s.trainPipe ? 5.8 : 13.5;
    s.equalizingReservoir += (targetPipe - s.equalizingReservoir) * (1 - Math.exp(-dt / 2.6));
    s.trainPipe += (targetPipe - s.trainPipe) * (1 - Math.exp(-dt / pipeTau));
    const tailTarget = s.trainPipe;
    const tailTau = tailTarget < s.tailPipe ? 7.8 : 18.5;
    s.tailPipe += (tailTarget - s.tailPipe) * (1 - Math.exp(-dt / tailTau));
    const rechargeDemand = Math.max(0, targetPipe - s.trainPipe);
    s.mainReservoir += (900 - s.mainReservoir) * (1 - Math.exp(-dt / 24));
    s.mainReservoir = clamp(s.mainReservoir - rechargeDemand * dt * .012, 720, 920);
    s.rechargeReady = s.trainPipe >= nominalPipe - 5 && s.tailPipe >= nominalPipe - 10;
    if (s.rechargeReady && !this.previousRecharge) this.log('recharge-ready', { tailPipe: s.tailPipe });
    this.previousRecharge = s.rechargeReady;

    const effectivePipe = s.trainPipe * .42 + s.tailPipe * .58;
    const automaticCylinder = clamp((nominalPipe - effectivePipe) / 170 * 350, 0, 430);
    const independentCylinder = s.independentBrake / INDEPENDENT_BRAKE_MAX * 370;
    s.trainBrakeCylinder += (automaticCylinder - s.trainBrakeCylinder) * (1 - Math.exp(-dt / 2.5));
    // 动力制动投入时，列车管减压只建立车辆空气制动；机车制动缸由空电联锁保持缓解。
    // 单阀仍可单独建立机车制动缸压力，达到切除阈值后退出动力制动。
    const automaticLocoCylinder = s.traction < 0 ? 0 : automaticCylinder;
    const desiredLoco = s.sideRelease ? 0 : Math.max(automaticLocoCylinder, independentCylinder);
    s.locomotiveCylinder += (desiredLoco - s.locomotiveCylinder) * (1 - Math.exp(-dt / 1.5));
    s.brakeCylinder = s.locomotiveCylinder;

    if (s.autoBrake === 9) {
      s.suppressionHeld += dt;
      if (s.suppressionHeld >= 1 && s.lkjForcedBrake > 0 && s.speed <= s.lkjLimit + 1) {
        s.lkjForcedBrake = 0;
        this.log('penalty-reset', { position: '抑制位' });
      }
    } else s.suppressionHeld = 0;

    s.grade = gradeAt(this.scenario, s.distance);
    s.phase = phaseAt(this.scenario, s.distance);
    s.targetBand = targetBandAt(this.scenario, s.distance);
    const baseAdhesion = adhesionAt(this.scenario, s.distance);
    const lowAdhesionDisturbance = baseAdhesion < .29
      ? Math.sin(s.distance * .021 + this.adhesionSeed) * .009 + Math.sin(s.elapsed * .73 + this.adhesionSeed) * .004
      : 0;
    s.adhesionCoefficient = clamp(baseAdhesion + lowAdhesionDisturbance, .22, .34);
    s.lineLimit = lineLimitAt(this.scenario, s.distance);
    s.lkjLimit = lkjControlLimit(this.scenario, s.distance);
    if (s.phase.id !== this.previousPhaseId) {
      this.log('phase-enter', { from: this.previousPhaseId, to: s.phase.id });
      this.previousPhaseId = s.phase.id;
    }

    const speedMps = Math.max(.5, s.speed / 3.6);
    const mass = this.scenario.totalMassKg;
    const locomotiveMass = 138_000;
    s.rollingResistance = 34_000 + mass * 0.0045 + speedMps * speedMps * 55;
    s.gradeForce = mass * 9.81 * s.grade / 1000;
    const adhesionCoefficient = Math.max(s.adhesionCoefficient, s.sandRemaining > 0 ? .33 : 0);
    const adhesion = adhesionCoefficient * locomotiveMass * 9.81;
    // 牵引级位表示目标速度给定，不把12级按比例放大物理牵引上限。
    // 6级保持与上一版接近的牵引权限，8—12级只增加目标速度和少量可用裕量。
    const tractionAuthority = s.traction > 0 ? clamp(.72 + .28 * s.traction / TRACTION_MAX, 0, 1) : 0;
    const tractionEnvelope = Math.min(520_000, 7_200_000 / speedMps);
    const notchMaximum = tractionAuthority * tractionEnvelope;
    const speedError = s.tractionTargetSpeed - s.speed;
    const holdingForce = Math.max(0, s.rollingResistance + s.gradeForce);
    const controllerForce = holdingForce + speedError * mass * .0075;
    const requestedTraction = s.traction > 0 ? clamp(controllerForce, 0, notchMaximum) : 0;
    const thermalDerate = clamp(1 - Math.max(0, s.tractionThermal - 18) / 70, .66, 1);
    // 正常黏着条件下由机车防空转控制自动限流；本课题只在明确的低黏着区
    // 暴露空转现象，让学生进行降级或短时撒砂处置。
    const slipSequenceResolved = s.slipReductionValid && s.slipSandAfterReduction;
    const trainingSlip = this.scenario.id === 'uphill'
      && s.distance >= 3_300 && s.distance <= 3_900
      && s.traction > 0 && s.slipReducedAt == null;
    s.wheelSlip = !slipSequenceResolved
      && (trainingSlip || (s.adhesionCoefficient < .28 && requestedTraction > adhesion * 1.01 && s.traction > 0));
    const adhesionForce = s.wheelSlip ? adhesion * .92 : adhesion;
    s.tractionForce = s.autoBrake === 0 && s.lkjForcedBrake === 0
      ? Math.min(requestedTraction, adhesionForce) * thermalDerate
      : 0;
    s.balanceSpeed = this.estimateBalanceSpeed(s.traction, s.grade, s.adhesionCoefficient);
    s.tractionCurrent = s.tractionForce / 370_000 * 100;
    if (s.tractionForce > 370_000) s.tractionThermal += (s.tractionForce / 370_000 - 1) * dt;
    else s.tractionThermal = Math.max(0, s.tractionThermal - dt * .08);

    if (s.wheelSlip) s.slipDuration += dt;
    if (s.wheelSlip && !this.previousSlip) {
      s.slipEncountered = true;
      this.log('wheel-slip-start');
    }
    if (!s.wheelSlip && this.previousSlip) {
      s.slipEndedAt = s.elapsed;
      this.log('wheel-slip-end');
    }
    this.previousSlip = s.wheelSlip;

    const dynamicFraction = Math.abs(Math.min(0, s.traction)) / 8;
    const lowSpeedBrakeFactor = clamp(s.speed / 15, 0, 1);
    const requestedDynamic = dynamicFraction * Math.min(370_000, 7_200_000 / speedMps) * lowSpeedBrakeFactor;
    s.dynamicBrakeForce = s.locomotiveCylinder >= 90 ? 0 : Math.min(requestedDynamic, adhesion);
    s.airBrakeForce = Math.max(0, s.trainBrakeCylinder * 1_050 + s.locomotiveCylinder * 260);
    s.brakeHeat = clamp(s.brakeHeat + (s.airBrakeForce / 420_000) * dt * .7 - dt * .035, 0, 100);
    const fade = clamp(1 - Math.max(0, s.brakeHeat - 70) / 180, .72, 1);
    s.airBrakeForce *= fade;

    const netForce = s.tractionForce - s.dynamicBrakeForce - s.airBrakeForce - s.rollingResistance - s.gradeForce;
    const newAcceleration = netForce / mass;
    const rawJerk = (newAcceleration - this.previousAcceleration) / Math.max(dt, .01);
    s.acceleration += (newAcceleration - s.acceleration) * (1 - Math.exp(-dt / .75));
    s.jerk += (rawJerk - s.jerk) * (1 - Math.exp(-dt / .28));
    s.controlShock *= Math.exp(-dt / 1.15);
    s.shockIndex = clamp(Math.abs(s.jerk) * 24 + s.controlShock, 0, 100);
    s.maxShockIndex = Math.max(s.maxShockIndex, s.shockIndex);
    if (s.shockIndex > 35) s.shockStickTilt = Math.max(s.shockStickTilt, clamp((s.shockIndex - 35) / 65 * 88, 0, 88));
    s.couplerForce = Math.abs(newAcceleration - s.acceleration) * mass * .22;
    s.speedTrend = s.acceleration * 3.6;
    this.previousAcceleration = newAcceleration;
    s.speed = Math.max(0, s.speed + s.acceleration * dt * 3.6);
    s.distance += s.speed / 3.6 * dt;

    if (this.scenario.id === 'downhill' && s.distance >= 2_200 && s.distance < 8_200
      && s.speed >= 64 && s.speedTrend > .04 && s.traction <= -6) {
      s.airNeedTimer += dt;
      if (s.airNeedTimer >= 2 && s.airRequiredAt == null) {
        s.airRequiredAt = s.elapsed;
        s.airControlState = 'required';
        this.log('air-brake-required', { speed: s.speed, trend: s.speedTrend });
      }
    } else s.airNeedTimer = Math.max(0, s.airNeedTimer - dt * 2);
    if (s.airRequiredAt != null && s.autoBrake === 0 && s.elapsed - s.airRequiredAt > 6 && s.airControlState === 'required') {
      s.airControlState = 'missed';
      this.log('air-brake-missed', { delay: s.elapsed - s.airRequiredAt });
    }
    if (s.autoBrake > 0 && s.airControlState.startsWith('commanded') && s.trainPipe <= nominalPipe - 45) {
      s.airControlState = s.airControlState === 'commanded-timely' ? 'effective-timely' : 'effective-late';
      this.log('air-brake-effective', { trainPipe: s.trainPipe, tailPipe: s.tailPipe });
    }

    this.updateLkjProtection();
    if (s.elapsed - this.lastSampleAt >= .5) {
      this.lastSampleAt = s.elapsed;
      s.samples.push({
        elapsed: s.elapsed,
        distance: s.distance,
        speed: s.speed,
        limit: s.lkjLimit,
        lineLimit: s.lineLimit,
        grade: s.grade,
        pipe: s.trainPipe,
        tailPipe: s.tailPipe,
        brake: s.autoBrake,
        traction: s.traction,
        tractionTargetSpeed: s.tractionTargetSpeed,
        balanceSpeed: s.balanceSpeed,
        tractionForce: s.tractionForce,
        dynamicBrakeForce: s.dynamicBrakeForce,
        airBrakeForce: s.airBrakeForce,
        acceleration: s.acceleration,
        jerk: s.jerk,
        shockIndex: s.shockIndex,
        trainBrakeCylinder: s.trainBrakeCylinder,
        locomotiveCylinder: s.locomotiveCylinder,
        rechargeReady: s.rechargeReady,
      });
      if (s.samples.length > 2200) s.samples.shift();
    }

    if (this.scenario.id === 'uphill' && s.grade > 5 && s.speed < 2) this.lowSpeedTime += dt;
    else this.lowSpeedTime = 0;
    if (this.lowSpeedTime > 4) {
      this.log('slope-stall');
      s.qualified = false;
      s.completed = true;
      s.status = 'completed';
    }
    if (s.distance >= this.scenario.finishDistance) {
      s.completed = true;
      s.status = 'completed';
      if (s.qualified == null) s.qualified = true;
      this.log('attempt-complete');
    }
    if (s.completed) this.dispatchEvent(new CustomEvent('complete', { detail: s }));
    this.emitChange();
  }

  estimateBalanceSpeed(notch, grade, adhesionCoefficient) {
    if (notch <= 0) return 0;
    const mass = this.scenario.totalMassKg;
    const target = tractionTargetSpeed(notch);
    const adhesion = Math.max(.2, adhesionCoefficient) * 138_000 * 9.81;
    let balance = 0;
    for (let speed = 2; speed <= target; speed += 1) {
      const speedMps = Math.max(.5, speed / 3.6);
      const authority = clamp(.72 + .28 * notch / TRACTION_MAX, 0, 1);
      const available = Math.min(adhesion, authority * Math.min(520_000, 7_200_000 / speedMps));
      const resistance = 34_000 + mass * .0045 + speedMps * speedMps * 55 + mass * 9.81 * grade / 1000;
      if (available >= Math.max(0, resistance)) balance = speed;
    }
    return balance;
  }

  updateLkjProtection() {
    const s = this.state;
    const excess = s.speed - s.lkjLimit;
    const previous = s.lkjLevel;
    if (excess >= 8) { s.lkjLevel = 'emergency'; s.lkjForcedBrake = 11; }
    else if (excess >= 5) { s.lkjLevel = 'service'; s.lkjForcedBrake = Math.max(s.lkjForcedBrake, 4); }
    else if (excess >= 3) s.lkjLevel = 'unload';
    else if (excess >= 2) s.lkjLevel = 'warning';
    else s.lkjLevel = 'normal';
    if (s.lkjLevel !== previous) {
      if (s.lkjLevel !== 'normal') s.lkjAcknowledged = false;
      this.log('lkj-level', { from: previous, to: s.lkjLevel, excess });
    }
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
  }
}
