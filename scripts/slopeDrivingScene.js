import * as THREE from '../lib/three/three.module.js';
import { MstsRouteScene } from './mstsRouteScene.js';

export class SlopeDrivingScene extends MstsRouteScene {
  constructor(canvas, scenario) {
    super(canvas, { profile: 'power-training' });
    this.slopeScenario = scenario;
    this.startOffset = scenario.startOffset;
    this.slopeBoards = [];
  }

  async load() {
    await super.load();
    this.startOffset = this.slopeScenario.startOffset;
    this.buildRouteGround();
    this.buildSlopeBoards();
    this.applyCamera();
  }

  buildRouteGround() {
    this.routeGround?.geometry?.dispose?.();
    this.routeGround?.material?.dispose?.();
    if (this.routeGround) this.routeRoot.remove(this.routeGround);
    const endDistance = Math.min(this.pathLength, 11_700);
    const step = 55;
    const halfWidth = 145;
    const positions = [];
    const uvs = [];
    const indices = [];
    const point = new THREE.Vector3();
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    const right = new THREE.Vector3();
    let row = 0;
    for (let distance = 0; distance <= endDistance; distance += step) {
      this.getPathPosition(distance, point);
      this.getPathPosition(Math.max(0, distance - 3), before);
      this.getPathPosition(Math.min(endDistance, distance + 3), after);
      right.subVectors(after, before).setY(0).normalize();
      right.set(right.z, 0, -right.x).normalize();
      positions.push(
        point.x - right.x * halfWidth, point.y - .28, point.z - right.z * halfWidth,
        point.x + right.x * halfWidth, point.y - .28, point.z + right.z * halfWidth,
      );
      uvs.push(0, distance / 90, 1, distance / 90);
      if (row > 0) {
        const current = row * 2;
        const previous = current - 2;
        indices.push(previous, current, previous + 1, previous + 1, current, current + 1);
      }
      row += 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: '#667758', roughness: 1, side: THREE.DoubleSide });
    this.routeGround = new THREE.Mesh(geometry, material);
    this.routeGround.name = 'SLOPE_ROUTE_GROUND_CONTINUITY';
    this.routeGround.renderOrder = -8;
    this.routeRoot.add(this.routeGround);
  }

  setScenario(scenario) {
    for (const { root } of this.slopeBoards) {
      this.routeRoot.remove(root);
      root.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => {
          material.map?.dispose?.();
          material.dispose?.();
        });
        else {
          object.material?.map?.dispose?.();
          object.material?.dispose?.();
        }
      });
    }
    this.slopeBoards = [];
    this.slopeScenario = scenario;
    this.startOffset = scenario.startOffset;
    if (this.ready) this.buildSlopeBoards();
    this.applyCamera();
  }

  buildSlopeBoards() {
    for (const config of this.slopeScenario.markers) {
      const root = new THREE.Group();
      root.name = `SLOPE_BOARD_${config.distance}`;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(.055, .075, 2.5, 8),
        new THREE.MeshStandardMaterial({ color: '#d9d9d4', roughness: .8 }),
      );
      pole.position.y = 1.25;
      root.add(pole);
      const board = this.makeBoard(config.label);
      board.position.set(0, 2.72, 0);
      root.add(board);
      this.placeLookoutObject3D(root, this.slopeScenario.startOffset + config.distance, 3.3, 0);
      this.routeRoot.add(root);
      this.slopeBoards.push({ root, config });
    }
  }

  makeBoard(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 448;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f4f0dc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#171b1d';
    context.lineWidth = 8;
    context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    context.fillStyle = '#111';
    context.font = 'bold 38px Microsoft YaHei, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(5.6, 1.6, 1);
    return sprite;
  }

  update(distance, speed, view = this.view) {
    super.update(distance, speed, view, true, 1);
    for (const board of this.slopeBoards) {
      const remaining = board.config.distance - distance;
      board.root.visible = remaining > -100 && remaining < 1800;
    }
  }
}
