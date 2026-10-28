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
    this.buildSlopeBoards();
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
