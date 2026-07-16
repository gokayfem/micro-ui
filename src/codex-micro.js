import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import {
  createBeveledCylinderGeometry,
  createHexSocketScrew,
  createLowProfileKeycapGeometry,
  createMXStemGeometry,
  createRoundedRectanglePath,
  createRoundedRectangleShape,
  createRoundedRectRingGeometry,
  createRoundedSlabGeometry,
} from './geometry.js';
import { createCodexMicroMaterials } from './materials.js';
import {
  createFrostedSurfaceMaps,
  createKeyIconTextures,
  createTopDeckSilkscreenTexture,
  createUndersideMarkingsTexture,
} from './textures.js';

const BODY_WIDTH = 110;
const BODY_DEPTH = 108.8;
const PLATE_WIDTH = 92.2;
const PLATE_DEPTH = 90.8;
const KEY_PITCH = 19.05;
const GRID = [-1.5, -0.5, 0.5, 1.5].map((value) => value * KEY_PITCH);
const SHARED_GEOMETRIES = new Map();

function sharedGeometry(key, factory) {
  if (!SHARED_GEOMETRIES.has(key)) SHARED_GEOMETRIES.set(key, factory());
  return SHARED_GEOMETRIES.get(key);
}

function setShadowFlags(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = cast;
    child.receiveShadow = receive;
  });
  return object;
}

function namedMesh(name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function centerGeometryY(geometry, centerY = 0) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  geometry.translate(
    -(box.min.x + box.max.x) * 0.5,
    centerY - (box.min.y + box.max.y) * 0.5,
    -(box.min.z + box.max.z) * 0.5,
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function extrudeYUp(shape, {
  height = 1,
  bevelSize = 0,
  bevelThickness = bevelSize,
  bevelSegments = 3,
  curveSegments = 12,
} = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, height - bevelThickness * 2),
    steps: 1,
    curveSegments,
    bevelEnabled: bevelSize > 0 && bevelThickness > 0,
    bevelSize,
    bevelThickness,
    bevelSegments,
  });
  geometry.rotateX(-Math.PI / 2);
  return centerGeometryY(geometry, 0);
}

function createCircularRingGeometry({
  outerRadius,
  innerRadius,
  height,
  bevelSize = 0.15,
  bevelThickness = bevelSize,
  segments = 96,
}) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius - bevelSize, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius + bevelSize, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return extrudeYUp(shape, {
    height,
    bevelSize,
    bevelThickness,
    bevelSegments: 3,
    curveSegments: Math.max(24, Math.round(segments / 4)),
  });
}

function createClippedSlabGeometry({
  width,
  depth,
  height,
  clip = 2,
  bevelSize = 0.2,
}) {
  const x = width * 0.5 - bevelSize;
  const z = depth * 0.5 - bevelSize;
  const c = Math.min(clip, x, z);
  const shape = new THREE.Shape();
  shape.moveTo(-x + c, -z);
  shape.lineTo(x - c, -z);
  shape.lineTo(x, -z + c);
  shape.lineTo(x, z - c);
  shape.lineTo(x - c, z);
  shape.lineTo(-x + c, z);
  shape.lineTo(-x, z - c);
  shape.lineTo(-x, -z + c);
  shape.closePath();
  return extrudeYUp(shape, {
    height,
    bevelSize,
    bevelThickness: bevelSize,
    bevelSegments: 3,
    curveSegments: 2,
  });
}

function createTexturePlane(texture, width, depth, {
  name,
  y,
  color = 0xffffff,
  opacity = 1,
  depthWrite = false,
  polygonOffsetFactor = -2,
} = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    map: texture,
    transparent: true,
    opacity,
    alphaTest: 0.018,
    depthWrite,
    side: THREE.FrontSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor,
    polygonOffsetUnits: polygonOffsetFactor,
  });
  material.name = `${name ?? 'graphic'}-material`;
  const plane = namedMesh(
    name ?? 'graphic-plane',
    new THREE.PlaneGeometry(width, depth),
    material,
    [0, y ?? 0, 0],
    [-Math.PI / 2, 0, 0],
  );
  plane.castShadow = false;
  plane.receiveShadow = false;
  plane.userData.noShadow = true;
  return plane;
}

function createRosetteGeometry(radius = 12.5, height = 0.82) {
  const shape = new THREE.Shape();
  const points = 96;
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const lobe = 0.89 + 0.11 * Math.cos(angle * 6 - Math.PI * 0.22);
    const shoulder = 1 + 0.018 * Math.cos(angle * 12 + 0.4);
    const r = radius * lobe * shoulder;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r * 0.93;
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  return extrudeYUp(shape, {
    height,
    bevelSize: 0.45,
    bevelThickness: 0.28,
    bevelSegments: 3,
    curveSegments: 2,
  });
}

function createDialHalfGeometry(radius = 7.55, height = 1.9) {
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(radius, 0);
  shape.absarc(0, 0, radius, 0, Math.PI, false);
  shape.closePath();
  const geometry = extrudeYUp(shape, {
    height,
    bevelSize: Math.min(0.3, height * 0.24),
    bevelThickness: Math.min(0.3, height * 0.24),
    bevelSegments: 3,
    curveSegments: 32,
  });
  // extrudeYUp centers the half-disc's bounds, but the relief must rotate
  // around the original full circle center on its straight diameter.
  geometry.translate(0, 0, -radius * 0.5);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createStatusLed(material, carrierMaterial, x, z, width = 2.4, depth = 1.35, y = 13.18) {
  const carrier = namedMesh(
    'status-led-carrier',
    sharedGeometry(
      `status-carrier-${width}-${depth}`,
      () => new THREE.BoxGeometry(width + 0.65, 0.38, depth + 0.65),
    ),
    carrierMaterial,
    [x, y - 0.18, z],
  );
  const diode = namedMesh(
    'status-led-diode',
    sharedGeometry(`status-diode-${width}-${depth}`, () => createRoundedSlabGeometry({
      width,
      depth,
      height: 0.62,
      radius: 0.25,
      bevelSize: 0.1,
      bevelSegments: 2,
      curveSegments: 8,
    })),
    material,
    [x, y + 0.1, z],
  );
  return { carrier, diode };
}

function makeKeyTextureMaterial(texture, name) {
  const material = new THREE.MeshBasicMaterial({
    name,
    map: texture,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.025,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  return material;
}

function createIconPlane(texture, width, depth, y, name) {
  const plane = namedMesh(
    name,
    sharedGeometry(`key-icon-plane-${width}-${depth}`, () => new THREE.PlaneGeometry(width, depth)),
    makeKeyTextureMaterial(texture, `${name}-ink`),
    [0, y, 0],
    [-Math.PI / 2, 0, 0],
  );
  plane.castShadow = false;
  plane.receiveShadow = false;
  plane.userData.noShadow = true;
  return plane;
}

function createSwitchAssembly({
  x,
  z,
  materials,
  plusMaterial,
  showPlus = false,
  name = 'mechanical-switch',
}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, 0, z);

  const base = namedMesh(
    'black-pom-switch-base',
    sharedGeometry('switch-base-v2', () => createRoundedSlabGeometry({
      width: 14.25,
      depth: 14.25,
      height: 1.8,
      radius: 1.55,
      bevelSize: 0.25,
      bevelSegments: 2,
      curveSegments: 8,
    })),
    materials.blackPlastic,
    [0, 13.12, 0],
  );
  group.add(base);

  const upper = namedMesh(
    'translucent-switch-upper',
    sharedGeometry('switch-upper-v2', () => createRoundedSlabGeometry({
      width: 12.45,
      depth: 12.45,
      height: 1.25,
      radius: 1.15,
      bevelSize: 0.22,
      bevelSegments: 2,
      curveSegments: 8,
    })),
    materials.lavenderSwitch,
    [0, 14.37, 0],
  );
  group.add(upper);

  const stemCollar = namedMesh(
    'stem-collar',
    sharedGeometry('switch-stem-collar-v2', () => createBeveledCylinderGeometry({
      radius: 3.25,
      height: 1.2,
      bevelRadius: 0.25,
      radialSegments: 28,
      bevelSegments: 3,
    })),
    materials.periwinkleStem,
    [0, 15.1, 0],
  );
  group.add(stemCollar);

  const stem = namedMesh(
    'mx-cross-stem',
    sharedGeometry('mx-cross-stem-v2', () => createMXStemGeometry({
      armLength: 4.55,
      armWidth: 1.35,
      height: 3.05,
      bevelSize: 0.08,
    })),
    materials.periwinkleStem,
    [0, 15.82, 0],
  );
  group.add(stem);

  let plus = null;
  if (showPlus && plusMaterial) {
    plus = namedMesh(
      'agent-key-plus-mark',
      sharedGeometry('agent-plus-plane-v2', () => new THREE.PlaneGeometry(5.25, 5.25)),
      plusMaterial,
      [0, 17.64, 0],
      [-Math.PI / 2, 0, 0],
    );
    plus.castShadow = false;
    plus.receiveShadow = false;
    group.add(plus);
  }

  group.userData.parts = { base, upper, stemCollar, stem, plus };
  return group;
}

function createOpaqueKey({
  x,
  z,
  units = 1,
  texture,
  materials,
  name,
}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, 0, z);

  const geometry = sharedGeometry(`opaque-keycap-${units}u-v2`, () => createLowProfileKeycapGeometry({
    units,
    unitSize: KEY_PITCH,
    gap: units === 1 ? 0.92 : 1.0,
    height: 5.45,
    cornerRadius: units === 1 ? 2.55 : 3.35,
    topInset: 1.18,
    bottomBevel: 0.52,
    topBevel: 0.68,
    dishDepth: 0.63,
    dishExponent: 2.15,
    wallThickness: 0.85,
    topThickness: 1.15,
    cornerSegments: 8,
    dishSegments: 10,
    openBottom: true,
  }));
  const cap = namedMesh(
    `${name}-pbt-cap`,
    geometry,
    [materials.whitePBT, materials.whitePBT, materials.whitePBT],
    [0, 13.62, 0],
  );
  group.add(cap);

  const iconSize = units === 1 ? 7.6 : 8.0;
  const icon = createIconPlane(
    texture,
    units === 1 ? iconSize : iconSize * 1.18,
    iconSize,
    18.58,
    `${name}-icon`,
  );
  group.add(icon);
  group.userData.cap = cap;
  group.userData.icon = icon;
  return group;
}

function createAgentKey({ x, z, materials, name, active = false }) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, 0, z);

  const well = namedMesh(
    `${name}-recess-well`,
    sharedGeometry('agent-key-recess-well-v2', () => createRoundedRectRingGeometry({
      width: 18.05,
      depth: 18.05,
      height: 0.88,
      radius: 3.05,
      frameWidth: 1.15,
      bevelSize: 0.18,
      bevelSegments: 2,
      curveSegments: 8,
    })),
    materials.clearDeck,
    [0, 13.08, 0],
  );
  group.add(well);

  const cap = namedMesh(
    `${name}-opal-cap`,
    sharedGeometry('agent-keycap-v2', () => createLowProfileKeycapGeometry({
      units: 1,
      unitSize: KEY_PITCH,
      gap: 0.94,
      height: 4.45,
      cornerRadius: 2.7,
      topInset: 1.05,
      bottomBevel: 0.48,
      topBevel: 0.62,
      dishDepth: 0.36,
      dishExponent: 2,
      wallThickness: 0.74,
      topThickness: 0.92,
      cornerSegments: 9,
      dishSegments: 15,
      openBottom: true,
    })),
    active
      ? [materials.activeOpalKeycap, materials.activeOpalKeycap, materials.activeOpalKeycap]
      : [materials.opalKeycap, materials.opalKeycap, materials.opalKeycap],
    [0, 13.46, 0],
  );
  group.add(cap);
  group.userData.cap = cap;
  group.userData.well = well;
  return group;
}

function createDial(materials) {
  const group = new THREE.Group();
  group.name = 'reasoning-effort-dial';
  group.position.set(GRID[0], 0, GRID[0]);

  const encoderBase = namedMesh(
    'dial-encoder-base',
    sharedGeometry('dial-encoder-base-v2', () => createBeveledCylinderGeometry({
      radius: 6.8,
      height: 2.2,
      bevelRadius: 0.35,
      radialSegments: 40,
      bevelSegments: 4,
    })),
    materials.blackPlastic,
    [0, 13.55, 0],
  );
  group.add(encoderBase);

  const shaft = namedMesh(
    'dial-metal-shaft',
    sharedGeometry('dial-metal-shaft-v2', () => createBeveledCylinderGeometry({
      radius: 2.1,
      height: 3.4,
      bevelRadius: 0.18,
      radialSegments: 32,
      bevelSegments: 3,
    })),
    materials.satinSilver,
    [0, 15.6, 0],
  );
  group.add(shaft);

  const knob = namedMesh(
    'dial-cylindrical-skirt',
    sharedGeometry('dial-cylindrical-skirt-v2', () => createBeveledCylinderGeometry({
      radius: 8.3,
      height: 5.0,
      bevelRadius: 0.9,
      radialSegments: 64,
      bevelSegments: 5,
      topCrown: 0.22,
    })),
    materials.dialPBT,
    [0, 18.1, 0],
  );
  group.add(knob);

  const grip = namedMesh(
    'dial-raised-diagonal-relief',
    sharedGeometry('dial-raised-diagonal-relief-v2', () => createDialHalfGeometry(8.0, 3.2)),
    materials.dialPBT,
    [0, 21.4, 0],
    [0, Math.PI / 4, 0],
  );
  group.add(grip);
  group.userData.contactPart = encoderBase;
  group.userData.parts = { encoderBase, shaft, knob, grip };
  return group;
}

function createJoystick(materials) {
  const group = new THREE.Group();
  group.name = 'planar-joystick';
  group.position.set(GRID[3], 0, GRID[0]);

  const board = namedMesh(
    'joystick-clipped-metal-module',
    sharedGeometry('joystick-clipped-module-v2', () => createClippedSlabGeometry({
      width: 17.25,
      depth: 17.25,
      height: 1.35,
      clip: 2.15,
      bevelSize: 0.18,
    })),
    materials.satinSilver,
    [0, 13.15, 0],
  );
  group.add(board);

  const contactMaterial = materials.blackPlastic;
  const contactOffsets = [-5.7, -1.9, 1.9, 5.7];
  const xContactGeometry = sharedGeometry(
    'joystick-x-contact-v2',
    () => new THREE.BoxGeometry(1.45, 1.22, 2.55),
  );
  const zContactGeometry = sharedGeometry(
    'joystick-z-contact-v2',
    () => new THREE.BoxGeometry(2.55, 1.22, 1.45),
  );
  for (const side of [-1, 1]) {
    for (const offset of contactOffsets) {
      const xContact = namedMesh(
        'joystick-edge-contact',
        xContactGeometry,
        contactMaterial,
        [side * 8.15, 14.12, offset],
      );
      const zContact = namedMesh(
        'joystick-edge-contact',
        zContactGeometry,
        contactMaterial,
        [offset, 14.12, side * 8.15],
      );
      group.add(xContact, zContact);
    }
  }

  const collar = namedMesh(
    'joystick-silver-collar',
    sharedGeometry('joystick-silver-collar-v2', () => createBeveledCylinderGeometry({
      radius: 6.15,
      height: 3.4,
      bevelRadius: 0.5,
      radialSegments: 48,
      bevelSegments: 4,
    })),
    materials.satinSilver,
    [0, 15.25, 0],
  );
  group.add(collar);

  const neck = namedMesh(
    'joystick-neck',
    sharedGeometry('joystick-neck-v2', () => createBeveledCylinderGeometry({
      radius: 3.7,
      height: 2.3,
      bevelRadius: 0.4,
      radialSegments: 36,
      bevelSegments: 3,
    })),
    materials.blackPlastic,
    [0, 17.6, 0],
  );
  group.add(neck);

  const cap = namedMesh(
    'joystick-rubber-cap',
    sharedGeometry('joystick-rubber-cap-v2', () => createBeveledCylinderGeometry({
      radius: 6.45,
      height: 3.65,
      bevelRadius: 0.92,
      radialSegments: 64,
      bevelSegments: 5,
      topCrown: 0.34,
    })),
    materials.blackRubber,
    [0, 19.35, 0],
  );
  group.add(cap);

  const grooveMaterial = materials.socketInterior;
  const grooveGeometry = sharedGeometry(
    'joystick-recessed-groove-v2',
    () => new RoundedBoxGeometry(3.4, 0.28, 0.62, 3, 0.25),
  );
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI * 0.25 + index * Math.PI * 0.5;
    const groove = namedMesh(
      'joystick-recessed-groove',
      grooveGeometry,
      grooveMaterial,
      [Math.cos(angle) * 3.15, 21.28, Math.sin(angle) * 3.15],
      [0, -angle + Math.PI * 0.5, 0],
    );
    groove.castShadow = false;
    group.add(groove);
  }

  group.userData.contactPart = board;
  group.userData.parts = { board, collar, neck, cap };
  return group;
}

function createTouchModule(materials) {
  const group = new THREE.Group();
  group.name = 'capacitive-touch-module';
  group.position.set(GRID[0], 0, GRID[3]);

  const outerRing = namedMesh(
    'touch-clear-outer-ring',
    sharedGeometry('touch-clear-outer-ring-v2', () => createCircularRingGeometry({
      outerRadius: 7.2,
      innerRadius: 6.0,
      height: 0.72,
      bevelSize: 0.14,
      segments: 72,
    })),
    materials.clearDeck,
    [0, 12.82, 0],
  );
  const innerRing = namedMesh(
    'touch-silver-inner-ring',
    sharedGeometry('touch-silver-inner-ring-v2', () => createCircularRingGeometry({
      outerRadius: 5.95,
      innerRadius: 5.35,
      height: 0.48,
      bevelSize: 0.08,
      segments: 72,
    })),
    materials.satinSilver,
    [0, 13.05, 0],
  );
  const touchMaterial = materials.blackRubber.clone();
  touchMaterial.name = 'touch-sensor-charcoal-rubber';
  touchMaterial.color.set(0x242a28);
  touchMaterial.roughness = 0.66;
  touchMaterial.envMapIntensity = 0.38;
  const sensor = namedMesh(
    'touch-black-sensor',
    sharedGeometry('touch-black-sensor-v2', () => createBeveledCylinderGeometry({
      radius: 5.25,
      height: 0.82,
      bevelRadius: 0.32,
      radialSegments: 48,
      bevelSegments: 4,
    })),
    touchMaterial,
    [0, 13.13, 0],
  );
  group.add(outerRing, innerRing, sensor);
  group.userData.contactPart = outerRing;
  group.userData.parts = { outerRing, innerRing, sensor };
  return group;
}

function createUnderside(materials, undersideTexture) {
  const group = new THREE.Group();
  group.name = 'lower-shell-and-underside';

  const lowerShell = namedMesh(
    'frosted-lower-shell',
    createRoundedSlabGeometry({
      width: 108.4,
      depth: 107.2,
      height: 7.15,
      radius: 10.5,
      bevelSize: 1.15,
      bevelThickness: 1.05,
      bevelSegments: 5,
      curveSegments: 18,
    }),
    materials.lowerPolycarbonate,
    [0, 3.45, 0],
  );
  group.add(lowerShell);

  const lowerInset = namedMesh(
    'lower-inner-frosted-inset',
    createRoundedSlabGeometry({
      width: 97,
      depth: 95.8,
      height: 1.55,
      radius: 8.9,
      bevelSize: 0.5,
      bevelSegments: 4,
    }),
    materials.clearDeck,
    [0, 0.65, 0],
  );
  group.add(lowerInset);

  // The real unit does not suspend its PCB in empty air. These molded bosses
  // rise from the lower shell and meet the PCB underside in the compact state.
  const standoffs = [];
  const standoffGeometry = sharedGeometry('lower-pcb-standoff-v2', () => createBeveledCylinderGeometry({
    radius: 2.55,
    height: 3.2,
    bevelRadius: 0.24,
    radialSegments: 32,
    bevelSegments: 3,
  }));
  for (const [x, z] of [[-36.5, -35.2], [36.5, -35.2], [-36.5, 35.2], [36.5, 35.2]]) {
    const standoff = namedMesh(
      'molded-pcb-support-standoff',
      standoffGeometry,
      materials.lowerPolycarbonate,
      [x, 8.52, z],
    );
    group.add(standoff);
    standoffs.push(standoff);
  }

  const medallion = namedMesh(
    'cnc-aluminum-bottom-medallion',
    sharedGeometry('bottom-medallion-v2', () => createBeveledCylinderGeometry({
      radius: 43.4,
      height: 4.25,
      bevelRadius: 0.72,
      radialSegments: 96,
      bevelSegments: 5,
    })),
    materials.anodizedAluminum,
    [0, -1.45, 0],
  );
  group.add(medallion);

  const footRing = namedMesh(
    'textured-anti-slip-ring',
    sharedGeometry('bottom-foot-ring-v2', () => createCircularRingGeometry({
      outerRadius: 42.2,
      innerRadius: 34.35,
      height: 1.05,
      bevelSize: 0.16,
      segments: 96,
    })),
    materials.footElastomer,
    [0, -3.98, 0],
  );
  group.add(footRing);

  const markings = createTexturePlane(undersideTexture, 70, 70, {
    name: 'underside-regulatory-markings',
    y: -3.69,
    opacity: 0.88,
    polygonOffsetFactor: -3,
  });
  // Turn the decal outward.  The transparent texture is double-sided so it is
  // readable both in the underside view and during the exploded flip.
  markings.rotation.x = Math.PI / 2;
  group.add(markings);

  const rosette = namedMesh(
    'embossed-codex-terminal-head',
    createRosetteGeometry(16.3, 0.86),
    materials.anodizedAluminum,
    [0, -3.965, 0],
  );
  group.add(rosette);

  const faceBarGeometry = sharedGeometry(
    'terminal-face-mark-v2',
    () => new RoundedBoxGeometry(7.1, 0.72, 1.55, 4, 0.6),
  );
  const faceBarA = namedMesh(
    'terminal-face-mark',
    faceBarGeometry,
    materials.anodizedAluminum,
    [-3.35, -4.57, -2.0],
    [0, 0.66, 0],
  );
  const faceBarB = namedMesh(
    'terminal-face-mark',
    faceBarGeometry,
    materials.anodizedAluminum,
    [-3.35, -4.57, 2.0],
    [0, -0.66, 0],
  );
  const faceBarC = namedMesh(
    'terminal-face-mark',
    faceBarGeometry,
    materials.anodizedAluminum,
    [4.55, -4.57, 2.25],
    [0, -0.04, 0],
  );
  group.add(faceBarA, faceBarB, faceBarC);

  const brassPositions = [
    [-43.1, -41.9], [43.1, -41.9], [-43.1, 41.9], [43.1, 41.9],
  ];
  const brassInserts = [];
  const brassInsertGeometry = sharedGeometry(
    'brass-threaded-insert-v2',
    () => createCircularRingGeometry({
      outerRadius: 1.65,
      innerRadius: 0.68,
      height: 1.35,
      bevelSize: 0.1,
      segments: 48,
    }),
  );
  const brassBoreGeometry = sharedGeometry(
    'brass-insert-bore-v2',
    () => new THREE.CylinderGeometry(0.65, 0.65, 1.5, 20),
  );
  for (const [x, z] of brassPositions) {
    const insert = namedMesh(
      'brass-threaded-insert',
      brassInsertGeometry,
      materials.brass,
      [x, -0.25, z],
    );
    const bore = namedMesh(
      'brass-insert-bore',
      brassBoreGeometry,
      materials.socketInterior,
      [x, -0.48, z],
    );
    group.add(insert, bore);
    brassInserts.push(insert);
  }

  group.userData.parts = {
    lowerShell,
    lowerInset,
    medallion,
    footRing,
    rosette,
    brassInserts,
    standoffs,
  };
  return group;
}

function storeConnection(records, name, a, b, worldPoint, tolerance = 0.16) {
  records.push({
    name,
    a,
    b,
    worldPoint: new THREE.Vector3(...worldPoint),
    tolerance,
  });
}

export function createCodexMicro({ renderer } = {}) {
  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
  const graphicAnisotropy = Math.min(maxAnisotropy, 4);
  const frostMaps = createFrostedSurfaceMaps({
    size: 384,
    seed: 'codex-micro-cnc-pc-frost-v2',
    anisotropy: graphicAnisotropy,
    repeat: [4.5, 4.5],
  });
  const grainMaps = createFrostedSurfaceMaps({
    size: 256,
    seed: 'codex-micro-aluminum-elastomer-grain-v2',
    anisotropy: graphicAnisotropy,
    repeat: [12, 12],
  });
  const materials = createCodexMicroMaterials({
    frostTexture: frostMaps.bumpMap,
    grainTexture: grainMaps.bumpMap,
  });

  // The lit key is still the same frosted PC part, but illumination is carried
  // through the cap itself.  A dedicated transmissive clone keeps the cyan
  // energy inside the plastic instead of faking it with a flat overlay.
  materials.activeOpalKeycap = materials.opalKeycap.clone();
  materials.activeOpalKeycap.name = 'internally-lit-frosted-pc-agent-keycap';
  materials.activeOpalKeycap.color.set(0xa0dad7);
  materials.activeOpalKeycap.roughness = 0.29;
  materials.activeOpalKeycap.transmission = 0.68;
  materials.activeOpalKeycap.attenuationColor.set(0x5dfff0);
  materials.activeOpalKeycap.attenuationDistance = 6.2;
  materials.activeOpalKeycap.emissive.set(0x00d6c9);
  materials.activeOpalKeycap.emissiveIntensity = 0.75;
  materials.activeOpalKeycap.userData = {
    ...materials.opalKeycap.userData,
    category: 'illuminated-polycarbonate-keycap',
  };

  materials.outerPolycarbonate.roughnessMap = frostMaps.roughnessMap;
  materials.lowerPolycarbonate.roughnessMap = frostMaps.roughnessMap;
  materials.opalKeycap.roughnessMap = frostMaps.roughnessMap;
  materials.footElastomer.roughnessMap = grainMaps.roughnessMap;
  materials.anodizedAluminum.roughnessMap = grainMaps.roughnessMap;

  const deckTexture = createTopDeckSilkscreenTexture({ size: 1024, anisotropy: graphicAnisotropy });
  const undersideTexture = createUndersideMarkingsTexture({ size: 1024, anisotropy: graphicAnisotropy });
  const iconTextures = createKeyIconTextures({
    size: 256,
    anisotropy: Math.min(graphicAnisotropy, 2),
    strokeWidth: 0.0225,
  });
  const textures = {
    deckTexture,
    undersideTexture,
    ...iconTextures,
    frostBump: frostMaps.bumpMap,
    frostRoughness: frostMaps.roughnessMap,
    grainBump: grainMaps.bumpMap,
    grainRoughness: grainMaps.roughnessMap,
  };

  const root = new THREE.Group();
  root.name = 'codex-micro';
  const upperAssembly = new THREE.Group();
  upperAssembly.name = 'upper-control-deck';
  const controlCluster = new THREE.Group();
  controlCluster.name = 'interactive-control-cluster';
  upperAssembly.add(controlCluster);
  const lowerAssembly = createUnderside(materials, undersideTexture);
  root.add(lowerAssembly, upperAssembly);

  const connectionDrafts = [];
  const interactionTargets = [];
  const interactionHitMaterial = new THREE.MeshBasicMaterial({
    name: 'interaction-hit-target-material',
    color: 0xff00ff,
    colorWrite: false,
    depthWrite: false,
    toneMapped: false,
  });

  function registerInteraction(target, interaction, geometry, position) {
    target.userData.interaction = interaction;
    const hitTarget = new THREE.Mesh(geometry, interactionHitMaterial);
    hitTarget.name = `${interaction.id}-hit-target`;
    hitTarget.position.set(...position);
    hitTarget.layers.set(1);
    hitTarget.castShadow = false;
    hitTarget.receiveShadow = false;
    hitTarget.userData.noShadow = true;
    hitTarget.userData.interactionRoot = target;
    target.add(hitTarget);
    interactionTargets.push(hitTarget);
    return hitTarget;
  }

  const internalLightPipe = namedMesh(
    'enclosed-mint-light-guide',
    createRoundedRectRingGeometry({
      width: 92.05,
      depth: 90.75,
      height: 2.25,
      radius: 8.4,
      innerWidth: 87.8,
      innerDepth: 86.5,
      innerRadius: 5.8,
      bevelSize: 0.32,
      bevelThickness: 0.28,
      bevelSegments: 3,
      curveSegments: 16,
    }),
    materials.ledMint,
    [0, 8.65, 0],
  );
  upperAssembly.add(internalLightPipe);

  const outerFrame = namedMesh(
    'unibody-sandblasted-polycarbonate-frame',
    createRoundedRectRingGeometry({
      width: BODY_WIDTH,
      depth: BODY_DEPTH,
      height: 5.2,
      radius: 11.3,
      innerWidth: 92.5,
      innerDepth: 91.2,
      innerRadius: 7.8,
      bevelSize: 1.05,
      bevelThickness: 0.95,
      bevelSegments: 5,
      curveSegments: 18,
    }),
    materials.outerPolycarbonate,
    [0, 9.5, 0],
  );
  outerFrame.renderOrder = 4;
  upperAssembly.add(outerFrame);

  const seamLip = namedMesh(
    'continuous-perimeter-seam-lip',
    createRoundedRectRingGeometry({
      width: 107.25,
      depth: 106.0,
      height: 0.7,
      radius: 11.9,
      innerWidth: 100.5,
      innerDepth: 99.2,
      innerRadius: 9.2,
      bevelSize: 0.16,
      bevelSegments: 3,
    }),
    materials.clearDeck,
    [0, 6.68, 0],
  );
  // The frame/lower-shell contact already defines the seam. Rendering this
  // overlapping transmissive helper caused depth-sorting shimmer.
  seamLip.visible = false;
  upperAssembly.add(seamLip);

  const pcb = namedMesh(
    'printed-control-pcb',
    createRoundedSlabGeometry({
      width: PLATE_WIDTH,
      depth: PLATE_DEPTH,
      height: 1.65,
      radius: 7.3,
      bevelSize: 0.55,
      bevelThickness: 0.42,
      bevelSegments: 3,
      curveSegments: 16,
    }),
    materials.pcb,
    [0, 10.86, 0],
  );
  upperAssembly.add(pcb);

  const clearDeck = namedMesh(
    'frosted-clear-top-deck',
    createRoundedSlabGeometry({
      width: 93.7,
      depth: 92.25,
      height: 1.22,
      radius: 8.1,
      bevelSize: 0.44,
      bevelThickness: 0.34,
      bevelSegments: 4,
      curveSegments: 18,
    }),
    materials.clearDeck,
    [0, 12.12, 0],
  );
  clearDeck.renderOrder = 2;
  upperAssembly.add(clearDeck);

  const deckPrint = createTexturePlane(deckTexture, PLATE_WIDTH, PLATE_DEPTH, {
    name: 'top-deck-silkscreen',
    y: 12.78,
    opacity: 0.96,
    polygonOffsetFactor: -4,
  });
  upperAssembly.add(deckPrint);

  const plusMaterial = makeKeyTextureMaterial(iconTextures.plus, 'agent-plus-ink');
  const switchAssemblies = [];
  const agentKeys = [];
  const agentCoordinates = [
    [GRID[1], GRID[0]],
    [GRID[2], GRID[0]],
    [GRID[0], GRID[1]],
    [GRID[1], GRID[1]],
    [GRID[2], GRID[1]],
    [GRID[3], GRID[1]],
  ];

  agentCoordinates.forEach(([x, z], index) => {
    const switchAssembly = createSwitchAssembly({
      x,
      z,
      materials,
      plusMaterial,
      showPlus: true,
      name: `agent-switch-${index + 1}`,
    });
    const key = createAgentKey({
      x,
      z,
      materials,
      name: `agent-key-${index + 1}`,
      active: index === 0,
    });
    controlCluster.add(switchAssembly, key);
    switchAssemblies.push(switchAssembly);
    agentKeys.push(key);
    key.userData.supportSwitches = [switchAssembly];
    storeConnection(
      connectionDrafts,
      `agent key ${index + 1} stem engagement`,
      key.userData.cap,
      switchAssembly,
      [x, 14.12, z],
      0.2,
    );
    storeConnection(
      connectionDrafts,
      `agent switch ${index + 1} seated on deck`,
      switchAssembly,
      clearDeck,
      [x, 12.72, z],
      0.2,
    );
  });

  const opaqueDefinitions = [
    { x: GRID[0], z: GRID[2], texture: iconTextures.lightning, name: 'lightning-command-key' },
    { x: GRID[1], z: GRID[2], texture: iconTextures.circledCheck, name: 'accept-command-key' },
    { x: GRID[2], z: GRID[2], texture: iconTextures.circledX, name: 'reject-command-key' },
    { x: GRID[3], z: GRID[2], texture: iconTextures.expand, name: 'new-chat-command-key' },
    { x: 0, z: GRID[3], units: 2, texture: iconTextures.microphone, name: 'push-to-talk-key' },
    { x: GRID[3], z: GRID[3], texture: iconTextures.codexTerminal, name: 'codex-command-key' },
  ];

  const opaqueKeys = [];
  opaqueDefinitions.forEach((definition) => {
    const key = createOpaqueKey({ ...definition, materials });
    controlCluster.add(key);
    opaqueKeys.push(key);

    const switchXs = definition.units === 2
      ? [definition.x - KEY_PITCH * 0.5, definition.x + KEY_PITCH * 0.5]
      : [definition.x];
    const supportSwitches = [];
    switchXs.forEach((switchX, supportIndex) => {
      const switchAssembly = createSwitchAssembly({
        x: switchX,
        z: definition.z,
        materials,
        name: `${definition.name}-switch-${supportIndex + 1}`,
      });
      controlCluster.add(switchAssembly);
      switchAssemblies.push(switchAssembly);
      supportSwitches.push(switchAssembly);
      storeConnection(
        connectionDrafts,
        `${definition.name} support ${supportIndex + 1}`,
        key.userData.cap,
        switchAssembly,
        [switchX, 14.0, definition.z],
        0.23,
      );
      storeConnection(
        connectionDrafts,
        `${definition.name} switch ${supportIndex + 1} seated on deck`,
        switchAssembly,
        clearDeck,
        [switchX, 12.72, definition.z],
        0.2,
      );
    });
    key.userData.supportSwitches = supportSwitches;
  });

  const dial = createDial(materials);
  const joystick = createJoystick(materials);
  const touchModule = createTouchModule(materials);
  controlCluster.add(dial, joystick, touchModule);
  storeConnection(connectionDrafts, 'dial encoder seated on deck', dial, clearDeck, [GRID[0], 12.72, GRID[0]], 0.2);
  storeConnection(connectionDrafts, 'joystick module seated on deck', joystick, clearDeck, [GRID[3], 12.72, GRID[0]], 0.2);
  storeConnection(connectionDrafts, 'touch module seated on deck', touchModule, clearDeck, [GRID[0], 12.72, GRID[3]], 0.2);

  const ledWhite = createStatusLed(
    materials.ledWhite,
    materials.statusCarrier,
    -39.3,
    21.65,
    2.15,
    1.25,
  );
  const ledAmberA = createStatusLed(
    materials.ledAmber,
    materials.statusCarrier,
    -39.3,
    27.15,
    2.15,
    1.25,
  );
  const ledAmberB = createStatusLed(
    materials.ledAmber,
    materials.statusCarrier,
    -39.3,
    32.65,
    2.15,
    1.25,
  );
  controlCluster.add(
    ledWhite.carrier,
    ledWhite.diode,
    ledAmberA.carrier,
    ledAmberA.diode,
    ledAmberB.carrier,
    ledAmberB.diode,
  );

  const activeLedPad = namedMesh(
    'active-agent-cyan-emitter',
    sharedGeometry('active-agent-cyan-emitter-v2', () => createRoundedRectRingGeometry({
      width: 11.45,
      depth: 11.45,
      height: 0.22,
      radius: 1.7,
      innerWidth: 6.8,
      innerDepth: 6.8,
      innerRadius: 2.8,
      bevelSize: 0.12,
      bevelSegments: 3,
      curveSegments: 10,
    })),
    materials.ledCyan,
    [GRID[1], 15.14, GRID[0]],
  );
  activeLedPad.userData.noShadow = true;
  activeLedPad.castShadow = false;
  controlCluster.add(activeLedPad);

  const screwPositions = [
    [-41.5, -40.7], [41.5, -40.7], [-41.5, 40.7], [41.5, 40.7],
  ];
  const screwPrototype = createHexSocketScrew({
    headRadius: 2.55,
    headHeight: 2.15,
    headBevel: 0.38,
    shankRadius: 1.05,
    shankLength: 8.4,
    socketRadius: 0.92,
    socketDepth: 0.52,
    radialSegments: 48,
    metalMaterial: materials.blackOxide,
    socketMaterial: materials.socketInterior,
  });
  const screws = [];
  for (const [x, z] of screwPositions) {
    const screw = screwPrototype.clone(true);
    screw.name = 'black-hex-socket-fastener';
    screw.position.set(x, 12.72, z);
    setShadowFlags(screw);
    controlCluster.add(screw);
    screws.push(screw);
    storeConnection(connectionDrafts, `corner screw at ${x},${z}`, screw, clearDeck, [x, 12.72, z], 0.12);
  }

  const glowLights = [];
  const activeKeyLight = new THREE.PointLight(0x31ded8, 24, 24, 2);
  activeKeyLight.name = 'active-agent-key-light';
  activeKeyLight.position.set(GRID[1], 16.1, GRID[0]);
  activeKeyLight.castShadow = false;
  controlCluster.add(activeKeyLight);

  const agentShortcuts = ['a', 's', 'd', 'f', 'g', 'h'];
  agentKeys.forEach((key, index) => {
    const switchParts = key.userData.supportSwitches.flatMap((support) => [
      support.userData.parts.stem,
      support.userData.parts.plus,
    ]).filter(Boolean);
    registerInteraction(key, {
      id: `agent-${index + 1}`,
      kind: 'key',
      label: `Agent ${index + 1}`,
      action: `Activated Agent ${index + 1}`,
      shortcut: agentShortcuts[index],
      pressParts: [key.userData.cap, ...switchParts],
      travel: 0.62,
    }, sharedGeometry(
      'interaction-hit-agent-v2',
      () => new THREE.BoxGeometry(18.2, 5.8, 18.2),
    ), [0, 15.72, 0]);
  });

  const commandInteractions = [
    { id: 'run', label: 'Run command', action: 'Command started', shortcut: 'r' },
    { id: 'accept', label: 'Accept', action: 'Change accepted', shortcut: 'Enter' },
    { id: 'reject', label: 'Reject', action: 'Change rejected', shortcut: 'Escape' },
    { id: 'new-chat', label: 'New chat', action: 'New chat created', shortcut: 'n' },
    { id: 'push-to-talk', label: 'Push to talk', action: 'Listening…', shortcut: 'm' },
    { id: 'open-codex', label: 'Open Codex', action: 'Codex opened', shortcut: 'c' },
  ];
  opaqueKeys.forEach((key, index) => {
    const definition = opaqueDefinitions[index];
    const supportStems = key.userData.supportSwitches.map((support) => support.userData.parts.stem);
    registerInteraction(key, {
      ...commandInteractions[index],
      kind: 'key',
      pressParts: [key, ...supportStems],
      travel: 0.76,
    }, sharedGeometry(
      `interaction-hit-command-${definition.units ?? 1}u-v2`,
      () => new THREE.BoxGeometry(
        (definition.units ?? 1) * KEY_PITCH - 0.55,
        6.2,
        KEY_PITCH - 0.55,
      ),
    ), [0, 16.05, 0]);
  });

  registerInteraction(dial, {
    id: 'reasoning-effort',
    kind: 'dial',
    label: 'Reasoning effort',
    action: 'Reasoning effort adjusted',
    shortcut: 'e',
    turnParts: [dial.userData.parts.knob, dial.userData.parts.grip],
  }, sharedGeometry(
    'interaction-hit-dial-v2',
    () => new THREE.CylinderGeometry(9.1, 9.1, 10, 24),
  ), [0, 19.15, 0]);

  registerInteraction(joystick, {
    id: 'planar-joystick',
    kind: 'joystick',
    label: 'Planar joystick',
    action: 'Joystick moved',
    shortcut: 'j',
    moveParts: [joystick.userData.parts.neck, joystick.userData.parts.cap],
  }, sharedGeometry(
    'interaction-hit-joystick-v2',
    () => new THREE.CylinderGeometry(7.8, 7.8, 8.4, 24),
  ), [0, 18.2, 0]);

  registerInteraction(touchModule, {
    id: 'touch-sensor',
    kind: 'touch',
    label: 'Touch sensor',
    action: 'Ambient glow toggled',
    shortcut: 'l',
    pressParts: [touchModule.userData.parts.sensor],
    travel: 0,
  }, sharedGeometry(
    'interaction-hit-touch-v2',
    () => new THREE.CylinderGeometry(7.3, 7.3, 2.1, 24),
  ), [0, 13.25, 0]);

  // Primary shell topology.  These points sit inside the real mating surfaces.
  storeConnection(connectionDrafts, 'front shell seam', seamLip, lowerAssembly, [0, 6.65, BODY_DEPTH * 0.46], 0.22);
  storeConnection(connectionDrafts, 'rear shell seam', seamLip, lowerAssembly, [0, 6.65, -BODY_DEPTH * 0.46], 0.22);
  storeConnection(connectionDrafts, 'left shell seam', seamLip, lowerAssembly, [-BODY_WIDTH * 0.46, 6.65, 0], 0.22);
  storeConnection(connectionDrafts, 'right shell seam', seamLip, lowerAssembly, [BODY_WIDTH * 0.46, 6.65, 0], 0.22);
  storeConnection(connectionDrafts, 'deck nested in frame', clearDeck, outerFrame, [PLATE_WIDTH * 0.49, 11.75, 0], 0.26);
  storeConnection(connectionDrafts, 'light guide enclosed by frame', internalLightPipe, outerFrame, [0, 8.65, 45.2], 0.26);
  storeConnection(connectionDrafts, 'aluminum base seated in lower shell', lowerAssembly.userData.parts.medallion, lowerAssembly.userData.parts.lowerShell, [0, 0.1, 0], 0.2);
  storeConnection(connectionDrafts, 'anti-slip ring bonded to aluminum base', lowerAssembly.userData.parts.footRing, lowerAssembly.userData.parts.medallion, [0, -3.72, 38], 0.2);
  lowerAssembly.userData.parts.brassInserts.forEach((insert, index) => {
    const [x, z] = [[-43.1, -41.9], [43.1, -41.9], [-43.1, 41.9], [43.1, 41.9]][index];
    storeConnection(connectionDrafts, `brass insert ${index + 1} embedded`, insert, lowerAssembly.userData.parts.lowerShell, [x, 0, z], 0.2);
  });
  lowerAssembly.userData.parts.standoffs.forEach((standoff, index) => {
    const [x, z] = [[-36.5, -35.2], [36.5, -35.2], [-36.5, 35.2], [36.5, 35.2]][index];
    storeConnection(connectionDrafts, `PCB standoff ${index + 1} meets lower shell`, standoff, lowerAssembly.userData.parts.lowerShell, [x, 7.02, z], 0.12);
    storeConnection(connectionDrafts, `PCB standoff ${index + 1} meets PCB`, standoff, pcb, [x, 10.04, z], 0.12);
  });

  root.updateMatrixWorld(true);
  const connectionRecords = connectionDrafts.map((draft) => ({
    name: draft.name,
    a: draft.a,
    b: draft.b,
    anchorA: draft.a.worldToLocal(draft.worldPoint.clone()),
    anchorB: draft.b.worldToLocal(draft.worldPoint.clone()),
    tolerance: draft.tolerance,
  }));

  const compactTransforms = {
    upperPosition: upperAssembly.position.clone(),
    upperQuaternion: upperAssembly.quaternion.clone(),
    lowerPosition: lowerAssembly.position.clone(),
    lowerQuaternion: lowerAssembly.quaternion.clone(),
  };
  const explodedUpperPosition = new THREE.Vector3(-13, 30, -8);
  const explodedUpperQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, -0.12, -0.06));
  const explodedLowerPosition = new THREE.Vector3(22, -34, 18);
  const explodedLowerQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0.16, 0.02));
  const lowerClearancePosition = compactTransforms.lowerPosition.clone();
  lowerClearancePosition.y = -62;
  const lowerDescentEnd = 0.30;
  const lowerTurnEnd = 0.72;

  // The upper half separates into mechanically meaningful layers instead of
  // moving as one solid block. Each target is derived from the exact compact
  // transform, so scrubbing the assembly slider is drift-free and returning to
  // zero restores every mating surface bit-for-bit.
  const explodedLayerDefinitions = [
    { object: internalLightPipe, offset: new THREE.Vector3(0, -6.5, 0), start: 0.00, end: 0.48 },
    { object: outerFrame, offset: new THREE.Vector3(0, -2.5, 0), start: 0.06, end: 0.58 },
    { object: pcb, offset: new THREE.Vector3(0, 5, 0), start: 0.14, end: 0.72 },
    { object: clearDeck, offset: new THREE.Vector3(0, 12, 0), start: 0.22, end: 0.88 },
    { object: deckPrint, offset: new THREE.Vector3(0, 12, 0), start: 0.22, end: 0.88 },
    { object: controlCluster, offset: new THREE.Vector3(0, 20, 0), start: 0.30, end: 1.00 },
  ].map(({ object, offset, start, end }) => {
    const compactPosition = object.position.clone();
    const compactQuaternion = object.quaternion.clone();
    return {
      object,
      compactPosition,
      compactQuaternion,
      explodedPosition: compactPosition.clone().add(offset),
      explodedQuaternion: compactQuaternion.clone(),
      start,
      end,
    };
  });

  function setExploded(progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    upperAssembly.position.lerpVectors(compactTransforms.upperPosition, explodedUpperPosition, p);
    upperAssembly.quaternion.slerpQuaternions(compactTransforms.upperQuaternion, explodedUpperQuaternion, p);

    // Keep the lower shell's path mechanically plausible in both directions.
    // It first drops far enough to clear the complete upper deck, then turns
    // over at that safe height, and only then rises into its display position.
    // Reassembly follows the exact reverse path, so the shell never sweeps
    // through the controls while its broad face is rotating.
    const descentProgress = THREE.MathUtils.smoothstep(p, 0, lowerDescentEnd);
    const turnProgress = THREE.MathUtils.smoothstep(p, lowerDescentEnd, lowerTurnEnd);
    const settleProgress = THREE.MathUtils.smoothstep(p, lowerTurnEnd, 1);
    lowerAssembly.position.lerpVectors(
      compactTransforms.lowerPosition,
      lowerClearancePosition,
      descentProgress,
    );
    if (p > lowerTurnEnd) {
      lowerAssembly.position.lerpVectors(lowerClearancePosition, explodedLowerPosition, settleProgress);
    }
    lowerAssembly.quaternion.slerpQuaternions(
      compactTransforms.lowerQuaternion,
      explodedLowerQuaternion,
      turnProgress,
    );
    explodedLayerDefinitions.forEach((layer) => {
      const layerProgress = THREE.MathUtils.smoothstep(p, layer.start, layer.end);
      layer.object.position.lerpVectors(layer.compactPosition, layer.explodedPosition, layerProgress);
      layer.object.quaternion.slerpQuaternions(
        layer.compactQuaternion,
        layer.explodedQuaternion,
        layerProgress,
      );
    });
    root.userData.explodedProgress = p;
    root.updateMatrixWorld(true);
  }

  function setGlow(enabled) {
    const glowVisible = Boolean(enabled);
    const value = glowVisible ? 1 : 0;
    materials.ledMint.emissiveIntensity = 1.1 * value;
    materials.ledCyan.emissiveIntensity = 3.2 * value;
    materials.activeOpalKeycap.emissiveIntensity = 0.75 * value;
    materials.ledWhite.emissiveIntensity = 1.1 * value;
    materials.ledAmber.emissiveIntensity = 0.85 * value;
    glowLights.forEach((light) => { light.intensity = 3.4 * value; });
    activeKeyLight.intensity = 24 * value;
    activeKeyLight.visible = glowVisible;
    root.userData.glowEnabled = glowVisible;
  }

  function update(time, enabled = root.userData.glowEnabled) {
    if (!enabled) return;
    const pulse = 1 + Math.sin(time * 1.15) * 0.035;
    materials.ledMint.emissiveIntensity = 1.1 * pulse;
    materials.ledCyan.emissiveIntensity = 3.2 * (1 + Math.sin(time * 1.4 + 0.6) * 0.045);
    materials.activeOpalKeycap.emissiveIntensity = 0.75 * (1 + Math.sin(time * 1.4 + 0.6) * 0.045);
  }

  const meshCount = [];
  root.traverse((object) => { if (object.isMesh) meshCount.push(object); });
  root.userData = {
    ...root.userData,
    materials,
    textures,
    assemblies: {
      upperAssembly,
      lowerAssembly,
      controlCluster,
      outerFrame,
      internalLightPipe,
      pcb,
      clearDeck,
      switches: switchAssemblies,
      agentKeys,
      opaqueKeys,
      dial,
      joystick,
      touchModule,
      screws,
      interactionTargets,
    },
    connectionRecords,
    compactTransforms,
    explodedProgress: 0,
    glowEnabled: true,
    renderStats: {
      meshes: meshCount.length,
      switches: switchAssemblies.length,
      transparentAgentKeys: agentKeys.length,
      opaqueKeycaps: opaqueKeys.length,
      fasteners: screws.length,
      auditedConnections: connectionRecords.length,
    },
    setExploded,
    setGlow,
    update,
  };

  setGlow(true);
  setExploded(0);
  setShadowFlags(root);
  interactionTargets.forEach((target) => {
    target.castShadow = false;
    target.receiveShadow = false;
  });
  return root;
}

export function auditCodexMicroConnections(model, toleranceMultiplier = 1) {
  const records = model?.userData?.connectionRecords ?? [];
  model?.updateMatrixWorld?.(true);
  const failures = [];
  const scratchA = new THREE.Vector3();
  const scratchB = new THREE.Vector3();
  const boxA = new THREE.Box3();
  const boxB = new THREE.Box3();

  for (const record of records) {
    scratchA.copy(record.anchorA).applyMatrix4(record.a.matrixWorld);
    scratchB.copy(record.anchorB).applyMatrix4(record.b.matrixWorld);
    const anchorError = scratchA.distanceTo(scratchB);
    boxA.setFromObject(record.a);
    boxB.setFromObject(record.b);
    const gapX = Math.max(0, boxA.min.x - boxB.max.x, boxB.min.x - boxA.max.x);
    const gapY = Math.max(0, boxA.min.y - boxB.max.y, boxB.min.y - boxA.max.y);
    const gapZ = Math.max(0, boxA.min.z - boxB.max.z, boxB.min.z - boxA.max.z);
    const boundsGap = Math.hypot(gapX, gapY, gapZ);
    const distance = Math.max(anchorError, boundsGap);
    const tolerance = record.tolerance * toleranceMultiplier;
    if (!Number.isFinite(distance) || distance > tolerance) {
      failures.push({
        name: record.name,
        distance,
        anchorError,
        boundsGap,
        tolerance,
        partA: record.a.name,
        partB: record.b.name,
      });
    }
  }

  model?.traverse?.((object) => {
    if (!object.isMesh) return;
    const position = object.geometry?.attributes?.position;
    if (!position || position.count <= 0) {
      failures.push({ name: `${object.name}: missing geometry positions` });
      return;
    }
    const box = new THREE.Box3().setFromObject(object);
    if (
      !Number.isFinite(box.min.x)
      || !Number.isFinite(box.min.y)
      || !Number.isFinite(box.min.z)
      || !Number.isFinite(box.max.x)
      || !Number.isFinite(box.max.y)
      || !Number.isFinite(box.max.z)
    ) failures.push({ name: `${object.name}: non-finite world bounds` });
  });

  const meshValidationCount = [];
  model?.traverse?.((object) => { if (object.isMesh) meshValidationCount.push(object); });
  const total = records.length + meshValidationCount.length;
  const failed = failures.length;
  return {
    total,
    passed: total - failed,
    failed,
    failures,
    connectionCount: records.length,
    meshCount: meshValidationCount.length,
  };
}
