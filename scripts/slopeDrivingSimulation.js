import {
  adhesionAt,
  BRAKE_POSITIONS,
  getScenario,
  gradeAt,
  lineLimitAt,
  lkjControlLimit,
  phaseAt,
  targetBandAt,
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
      controlShock: 0,
      couplerForce: 0,
      traction: scenario.initialTraction,
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
      tailQueryCount: 0,
      sandRemaining: 0,
      sandingCount: 0,
      wheelSlip: false,
      slipDuration: 0,
      tractionForce: 0,
      dynamicBrakeForce: 0,
      airBrakeForce: 0,
      rollingResistance: 0,
      gradeForce: 0,
      tractionCurrent: 0,
      tractionThermal: 0,
      brakeHeat: 0,
      rechargeReady: true,
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
    if (type === 'traction') s.traction = clamp(Math.round(Number(value) || 0), -8, 7);
    else if (type === 'auto-brake') s.autoBrake = clamp(Math.round(Number(value) || 0), 0, 5);
    else if (type === 'independent-brake') s.independentBrake = clamp(Math.round(Number(value) || 0), 0, 5);
    else if (type === 'side-release') s.sideRelease = Boolean(value);
    else if (type === 'sand') {
      s.sandRemaining = Math.max(s.sandRemaining, 5);
      s.sandingCount += 1;
      this.log('sand');
    } else if (type === 'tail-query') {
      s.tailQueryCount += 1;
      this.log('tail-query', { tailPipe: s.tailPipe, headPipe: s.trainPipe });
    } else if (type === 'direction') {
      if (!['F', 'N', 'R'].includes(value)) return false;
      if (s.speed > 1) {
        this.log('direction-while-moving', { requested: value, retained: s.direction });
        return false;
      }
      s.direction = value;
      this.log('direction', { value });
    } else if (type === 'callout') {
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
    const requestedReduction = BRAKE_POSITIONS[Math.max(s.autoBrake, s.lkjForcedBrake)]?.reduction || 0;
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
    const independentCylinder = s.independentBrake * 62;
    s.trainBrakeCylinder += (automaticCylinder - s.trainBrakeCylinder) * (1 - Math.exp(-dt / 2.5));
    const dynamicRequested = s.traction < 0 && independentCylinder < 90;
    const desiredLoco = dynamicRequested
      ? independentCylinder
      : s.sideRelease ? independentCylinder : Math.max(automaticCylinder, independentCylinder);
    s.locomotiveCylinder += (desiredLoco - s.locomotiveCylinder) * (1 - Math.exp(-dt / 1.5));
    s.brakeCylinder = s.locomotiveCylinder;

    s.grade = gradeAt(this.scenario, s.distance);
    s.phase = phaseAt(this.scenario, s.distance);
    s.targetBand = targetBandAt(this.scenario, s.distance);
    s.adhesionCoefficient = adhesionAt(this.scenario, s.distance);
    s.lineLimit = lineLimitAt(this.scenario, s.distance);
    s.lkjLimit = lkjControlLimit(this.scenario, s.distance);
    if (s.phase.id !== this.previousPhaseId) {
      this.log('phase-enter', { from: this.previousPhaseId, to: s.phase.id });
      this.previousPhaseId = s.phase.id;
    }

    const speedMps = Math.max(.5, s.speed / 3.6);
    const mass = this.scenario.totalMassKg;
    const locomotiveMass = 138_000;
    const adhesionCoefficient = Math.max(s.adhesionCoefficient, s.sandRemaining > 0 ? .33 : 0);
    const adhesion = adhesionCoefficient * locomotiveMass * 9.81;
    const tractionFraction = Math.max(0, s.traction) / 7;
    const requestedTraction = tractionFraction * Math.min(520_000, 7_200_000 / speedMps);
    const thermalDerate = clamp(1 - Math.max(0, s.tractionThermal - 18) / 70, .66, 1);
    s.wheelSlip = requestedTraction > adhesion * 1.01 && s.traction > 0;
    const adhesionForce = s.wheelSlip ? adhesion * .92 : adhesion;
    s.tractionForce = s.autoBrake === 0 && s.lkjForcedBrake === 0
      ? Math.min(requestedTraction, adhesionForce) * thermalDerate
      : 0;
    s.tractionCurrent = s.tractionForce / 370_000 * 100;
    if (s.tractionForce > 370_000) s.tractionThermal += (s.tractionForce / 370_000 - 1) * dt;
    else s.tractionThermal = Math.max(0, s.tractionThermal - dt * .08);

    if (s.wheelSlip) s.slipDuration += dt;
    if (s.wheelSlip && !this.previousSlip) this.log('wheel-slip-start');
    if (!s.wheelSlip && this.previousSlip) this.log('wheel-slip-end');
    this.previousSlip = s.wheelSlip;

    const dynamicFraction = Math.abs(Math.min(0, s.traction)) / 8;
    const lowSpeedBrakeFactor = clamp(s.speed / 15, 0, 1);
    const requestedDynamic = dynamicFraction * Math.min(370_000, 7_200_000 / speedMps) * lowSpeedBrakeFactor;
    s.dynamicBrakeForce = independentCylinder >= 90 ? 0 : Math.min(requestedDynamic, adhesion);
    s.airBrakeForce = Math.max(0, s.trainBrakeCylinder * 1_050 + s.locomotiveCylinder * 260);
    s.rollingResistance = 34_000 + mass * 0.0045 + speedMps * speedMps * 55;
    s.gradeForce = mass * 9.81 * s.grade / 1000;
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
    s.couplerForce = Math.abs(newAcceleration - s.acceleration) * mass * .22;
    s.speedTrend = s.acceleration * 3.6;
    this.previousAcceleration = newAcceleration;
    s.speed = Math.max(0, s.speed + s.acceleration * dt * 3.6);
    s.distance += s.speed / 3.6 * dt;

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

  updateLkjProtection() {
    const s = this.state;
    const excess = s.speed - s.lkjLimit;
    const previous = s.lkjLevel;
    if (excess >= 8) { s.lkjLevel = 'emergency'; s.lkjForcedBrake = 5; }
    else if (excess >= 5) { s.lkjLevel = 'service'; s.lkjForcedBrake = Math.max(s.lkjForcedBrake, 3); }
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
