import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { auditCodexMicroConnections, createCodexMicro } from './codex-micro.js';
import './style.css';

const canvas = document.querySelector('#scene');
const app = document.querySelector('#app');
const glowControl = document.querySelector('.glow-control');
const qualityControl = document.querySelector('.quality-control');
const qualityValue = document.querySelector('.quality-value');
const assemblyProgress = document.querySelector('#assembly-progress');
const assemblyState = document.querySelector('#assembly-state');
const semanticInputs = document.querySelector('#semantic-inputs');
const readoutValue = document.querySelector('.readout-value');
const rendererState = document.querySelector('.renderer-state');
const tooltip = document.querySelector('.control-tooltip');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'low-power',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.transmissionResolutionScale = 0.5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xedf1ef);

const camera = new THREE.PerspectiveCamera(
  27,
  window.innerWidth / window.innerHeight,
  5,
  700,
);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.rotateSpeed = 0.48;
controls.zoomSpeed = 0.65;
controls.panSpeed = 0.35;
controls.enablePan = false;
controls.minDistance = 95;
controls.maxDistance = 470;
controls.minPolarAngle = 0.025;
controls.maxPolarAngle = Math.PI - 0.025;

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();
const environmentMap = pmremGenerator.fromScene(roomEnvironment, 0.035).texture;
scene.environment = environmentMap;
scene.environmentIntensity = 0.86;
roomEnvironment.dispose();
pmremGenerator.dispose();

RectAreaLightUniformsLib.init();

const hemisphere = new THREE.HemisphereLight(0xffffff, 0x87928c, 0.24);
scene.add(hemisphere);

const shadowKey = new THREE.DirectionalLight(0xfffdf9, 0.82);
shadowKey.position.set(-75, 145, 72);
shadowKey.castShadow = true;
shadowKey.shadow.mapSize.set(1024, 1024);
shadowKey.shadow.camera.near = 20;
shadowKey.shadow.camera.far = 420;
shadowKey.shadow.camera.left = -100;
shadowKey.shadow.camera.right = 100;
shadowKey.shadow.camera.top = 100;
shadowKey.shadow.camera.bottom = -100;
shadowKey.shadow.bias = -0.00012;
shadowKey.shadow.normalBias = 0.04;
shadowKey.shadow.radius = 3;
scene.add(shadowKey);

const topSoftbox = new THREE.RectAreaLight(0xffffff, 1.48, 150, 130);
topSoftbox.position.set(-55, 155, -70);
topSoftbox.lookAt(0, 3, 0);
scene.add(topSoftbox);

const frontSoftbox = new THREE.RectAreaLight(0xfffdfa, 1.28, 125, 100);
frontSoftbox.position.set(-105, 78, 145);
frontSoftbox.lookAt(0, 7, 0);
scene.add(frontSoftbox);

const coolRim = new THREE.RectAreaLight(0xe8f5ff, 1.22, 95, 110);
coolRim.position.set(20, 95, -135);
coolRim.lookAt(0, 8, 0);
scene.add(coolRim);

const undersideFill = new THREE.RectAreaLight(0xf2fffb, 0.72, 125, 115);
undersideFill.position.set(-12, -125, 46);
undersideFill.lookAt(0, -2, 0);
undersideFill.visible = false;
scene.add(undersideFill);

const motor = createCodexMicro({ renderer });
motor.name = 'codex-micro-procedural-reconstruction';
scene.add(motor);

const shadowCasterPattern = /(?:pbt-cap|dial-cylindrical|dial-raised|joystick-rubber|joystick-neck|touch-black|fastener|socket-fastener|medallion|terminal-head)/i;
const noReceivePattern = /(?:hit-target|silkscreen|markings|icon|ink|diode|emitter|contact|face-mark|light-guide|seam-lip)/i;
motor.traverse((object) => {
  if (!object.isMesh) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  const isTransmissive = materials.some((material) => Number(material?.transmission) > 0.22);
  object.castShadow = !object.userData.noShadow
    && !isTransmissive
    && shadowCasterPattern.test(object.name);
  object.receiveShadow = !noReceivePattern.test(object.name);
});

motor.updateMatrixWorld(true);
const modelBounds = new THREE.Box3().setFromObject(motor);
const modelCenter = modelBounds.getCenter(new THREE.Vector3());
const modelSize = modelBounds.getSize(new THREE.Vector3());

const floorY = modelBounds.min.y - 2.4;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.ShadowMaterial({ color: 0x59645e, opacity: 0.22 }),
);
ground.name = 'studio-floor';
ground.rotation.x = -Math.PI / 2;
ground.position.y = floorY;
ground.receiveShadow = true;
scene.add(ground);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const gtaoPass = new GTAOPass(
  scene,
  camera,
  window.innerWidth,
  window.innerHeight,
  undefined,
  {
    radius: 3.7,
    distanceExponent: 1.7,
    thickness: 1.4,
    distanceFallOff: 0.82,
    scale: 0.92,
    samples: 8,
  },
  {
    lumaPhi: 5,
    depthPhi: 2,
    normalPhi: 3.25,
    radius: 4,
    radiusExponent: 1.5,
    rings: 2,
    samples: 8,
  },
);
gtaoPass.blendIntensity = 0.62;
gtaoPass.setSceneClipBox(modelBounds.clone().expandByScalar(25));
composer.addPass(gtaoPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.09,
  0.2,
  1.58,
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const QUALITY_PROFILES = Object.freeze({
  eco: {
    label: 'Eco', cssName: 'performance', pixelRatio: 0.82, fps: 30,
    gtao: false, bloom: false, shadows: false, shadowSize: 512, transmission: 0.32,
  },
  balanced: {
    label: 'Balanced', cssName: 'balanced', pixelRatio: 1, fps: 45,
    gtao: true, bloom: true, shadows: true, shadowSize: 1024, transmission: 0.5,
  },
  studio: {
    label: 'Studio', cssName: 'high', pixelRatio: 1.5, fps: 60,
    gtao: true, bloom: true, shadows: true, shadowSize: 2048, transmission: 0.72,
  },
});
const QUALITY_ORDER = Object.keys(QUALITY_PROFILES);

const viewPresets = {
  hero: {
    position: new THREE.Vector3(160, 132, 185),
    target: new THREE.Vector3(0, 8.5, 0),
    up: new THREE.Vector3(0, 1, 0),
    fov: 27,
    exploded: 0,
    ground: true,
  },
  top: {
    position: new THREE.Vector3(0.001, 300, 0.001),
    target: new THREE.Vector3(0, 8, 0),
    up: new THREE.Vector3(0, 0, -1),
    fov: 22,
    exploded: 0,
    ground: false,
  },
  low: {
    position: new THREE.Vector3(174, 70, 180),
    target: new THREE.Vector3(0, 6.5, 0),
    up: new THREE.Vector3(0, 1, 0),
    fov: 29,
    exploded: 0,
    ground: true,
  },
  underside: {
    position: new THREE.Vector3(154, -125, 164),
    target: new THREE.Vector3(0, 1.5, 0),
    up: new THREE.Vector3(0, 1, 0),
    fov: 28,
    exploded: 0,
    ground: false,
  },
  exploded: {
    position: new THREE.Vector3(218, 178, 252),
    target: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 1, 0),
    fov: 30,
    exploded: 1,
    ground: false,
  },
};

let activeView = 'hero';
let viewTransition = null;
let assemblyTransition = null;
let glowEnabled = true;
let activeQualityName = 'balanced';
let controlsInteracting = false;
let controlsSettlingUntil = 0;
let frameRequest = 0;
let renderDirty = true;
let shadowDirty = true;
let lastShadowUpdateAt = -Infinity;
let lastFrameAt = -Infinity;
let firstFrame = true;
let captureRestore = null;

const performanceStats = {
  renderedFrames: 0,
  sleeping: false,
  moving: false,
  quality: activeQualityName,
  lastDrawCalls: 0,
  lastTriangles: 0,
};

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function easeInOutQuint(value) {
  return value < 0.5
    ? 16 * value ** 5
    : 1 - ((-2 * value + 2) ** 5) / 2;
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function updateViewButtons(name) {
  document.querySelectorAll('.view-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === name);
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
}

function updateEnvironmentVisibility() {
  const exploded = motor.userData.explodedProgress ?? 0;
  ground.visible = Boolean(viewPresets[activeView]?.ground) && exploded < 0.02;
  undersideFill.visible = activeView === 'underside' || activeView === 'exploded' || exploded > 0.06;
}

function updateAssemblyUi(value) {
  const percent = Math.round(clamp01(value) * 100);
  assemblyProgress.value = String(percent);
  assemblyProgress.style.setProperty('--range-progress', `${percent}%`);
  assemblyProgress.style.setProperty('--assembly-progress', `${percent}%`);
  const label = percent <= 1 ? 'Assembled' : percent >= 99 ? 'Exploded' : `${percent}% apart`;
  assemblyState.value = label;
  assemblyState.textContent = label;
  assemblyProgress.setAttribute('aria-valuetext', label);
  document.querySelectorAll('[data-assembly]').forEach((button) => {
    const target = Number(button.dataset.assembly);
    const active = target === 0 ? percent <= 1 : percent >= 99;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function applyExploded(value, { updateUi = true } = {}) {
  const progress = clamp01(value);
  motor.userData.setExploded?.(progress);
  motor.updateMatrixWorld(true);
  if (updateUi) updateAssemblyUi(progress);
  updateEnvironmentVisibility();
  shadowDirty = true;
}

function animateAssembly(value, duration = 980) {
  const target = clamp01(value);
  const current = motor.userData.explodedProgress ?? 0;
  if (reducedMotion || Math.abs(target - current) < 0.0001) {
    assemblyTransition = null;
    applyExploded(target);
    invalidate({ shadow: true });
    return;
  }
  assemblyTransition = {
    start: performance.now(),
    duration,
    from: current,
    to: target,
  };
  invalidate({ shadow: true });
}

function setView(name, immediate = false) {
  const preset = viewPresets[name];
  if (!preset) return;
  activeView = name;
  updateViewButtons(name);

  if (immediate || reducedMotion) {
    viewTransition = null;
    assemblyTransition = null;
    camera.position.copy(preset.position);
    camera.up.copy(preset.up);
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
    controls.target.copy(preset.target);
    camera.lookAt(controls.target);
    // Immediate mode is deterministic for capture and verification. Interactive
    // camera buttons preserve assembly state, except the Exploded macro.
    applyExploded(preset.exploded);
    controls.update();
    invalidate({ shadow: true });
    return;
  }

  viewTransition = {
    start: performance.now(),
    duration: name === 'exploded' ? 1180 : 820,
    fromPosition: camera.position.clone(),
    toPosition: preset.position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: preset.target.clone(),
    fromUp: camera.up.clone(),
    toUp: preset.up.clone(),
    fromFov: camera.fov,
    toFov: preset.fov,
  };
  if (name === 'exploded') animateAssembly(1, 1180);
  updateEnvironmentVisibility();
  invalidate({ shadow: name === 'exploded' });
}

function updateViewTransition(now) {
  if (!viewTransition) return false;
  const raw = clamp01((now - viewTransition.start) / viewTransition.duration);
  const progress = easeInOutQuint(raw);
  camera.position.lerpVectors(viewTransition.fromPosition, viewTransition.toPosition, progress);
  controls.target.lerpVectors(viewTransition.fromTarget, viewTransition.toTarget, progress);
  camera.up.lerpVectors(viewTransition.fromUp, viewTransition.toUp, progress).normalize();
  camera.fov = THREE.MathUtils.lerp(viewTransition.fromFov, viewTransition.toFov, progress);
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  if (raw >= 1) {
    viewTransition = null;
    return false;
  }
  return true;
}

function updateAssemblyTransition(now) {
  if (!assemblyTransition) return false;
  const raw = clamp01((now - assemblyTransition.start) / assemblyTransition.duration);
  const progress = easeInOutQuint(raw);
  applyExploded(THREE.MathUtils.lerp(assemblyTransition.from, assemblyTransition.to, progress));
  if (raw >= 1) {
    assemblyTransition = null;
    return false;
  }
  return true;
}

function setGlow(enabled) {
  glowEnabled = Boolean(enabled);
  motor.userData.setGlow?.(glowEnabled);
  glowControl.classList.toggle('is-active', glowEnabled);
  glowControl.setAttribute('aria-pressed', String(glowEnabled));
  glowControl.setAttribute('aria-label', `RGB glow: ${glowEnabled ? 'on' : 'off'}`);
  invalidate();
}

function applyViewport(width = window.innerWidth, height = window.innerHeight, pixelRatioOverride) {
  const profile = QUALITY_PROFILES[activeQualityName];
  const pixelRatio = pixelRatioOverride
    ?? Math.min(window.devicePixelRatio || 1, profile.pixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setPostProcessingForMotion(moving) {
  const profile = QUALITY_PROFILES[activeQualityName];
  gtaoPass.enabled = profile.gtao && !moving;
  bloomPass.enabled = profile.bloom && !moving;
}

function setQuality(name, { persist = true, resize = true } = {}) {
  if (!QUALITY_PROFILES[name]) return;
  const previousShadowSize = QUALITY_PROFILES[activeQualityName]?.shadowSize;
  activeQualityName = name;
  const profile = QUALITY_PROFILES[name];
  performanceStats.quality = name;

  renderer.transmissionResolutionScale = profile.transmission;
  renderer.shadowMap.enabled = profile.shadows;
  shadowKey.castShadow = profile.shadows;
  if (profile.shadowSize !== previousShadowSize) {
    shadowKey.shadow.map?.dispose();
    shadowKey.shadow.map = null;
    shadowKey.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
  }
  setPostProcessingForMotion(false);

  qualityValue.textContent = profile.label;
  qualityControl.dataset.quality = profile.cssName;
  qualityControl.setAttribute('aria-label', `Rendering quality: ${profile.label}. Activate to change.`);
  document.documentElement.dataset.quality = profile.cssName;
  if (persist) {
    try { window.localStorage.setItem('codex-micro-quality', name); } catch { /* storage is optional */ }
  }
  if (resize) applyViewport();
  invalidate({ shadow: true });
}

const interactionTargets = motor.userData.assemblies?.interactionTargets ?? [];
const interactionById = new Map();
const targetToInteraction = new WeakMap();
const activeTweens = new Map();
const yAxis = new THREE.Vector3(0, 1, 0);

for (const hitTarget of interactionTargets) {
  const root = hitTarget.userData.interactionRoot;
  const meta = root?.userData.interaction;
  if (!root || !meta) continue;
  const parts = [...new Set([
    ...(meta.pressParts ?? []),
    ...(meta.turnParts ?? []),
    ...(meta.moveParts ?? []),
  ])];
  const transforms = new Map(parts.map((part) => [part, {
    position: part.position.clone(),
    quaternion: part.quaternion.clone(),
    scale: part.scale.clone(),
  }]));
  const state = {
    root,
    hitTarget,
    meta,
    parts,
    transforms,
    dialValue: 5,
    joystick: new THREE.Vector2(),
  };
  interactionById.set(meta.id, state);
  targetToInteraction.set(hitTarget, state);
}

function dispatchInput(state, phase, value = 1) {
  window.dispatchEvent(new CustomEvent('codexmicro:input', {
    detail: {
      id: state.meta.id,
      kind: state.meta.kind,
      phase,
      value,
    },
  }));
}

function setReadout(state, text = state.meta.action) {
  readoutValue.textContent = text;
  readoutValue.dataset.input = state.meta.id;
}

function startTween(key, duration, update, complete) {
  if (reducedMotion || duration <= 0) {
    update(1);
    complete?.();
    invalidate({ shadow: true });
    return;
  }
  activeTweens.set(key, {
    start: performance.now(),
    duration,
    update,
    complete,
  });
  invalidate({ shadow: true });
}

function updateTweens(now) {
  if (activeTweens.size === 0) return false;
  for (const [key, tween] of [...activeTweens]) {
    const progress = clamp01((now - tween.start) / tween.duration);
    tween.update(progress);
    if (progress >= 1) {
      activeTweens.delete(key);
      tween.complete?.();
    }
  }
  return activeTweens.size > 0;
}

function pressEnvelope(progress) {
  if (progress < 0.28) return easeOutCubic(progress / 0.28);
  if (progress < 0.56) return 1;
  return 1 - easeOutCubic((progress - 0.56) / 0.44);
}

function triggerPress(state) {
  const parts = state.meta.pressParts ?? [];
  const travel = state.meta.travel ?? 0.7;
  dispatchInput(state, 'press', 1);
  setReadout(state);
  startTween(`press:${state.meta.id}`, 270, (progress) => {
    const amount = pressEnvelope(progress);
    for (const part of parts) {
      const base = state.transforms.get(part);
      if (!base) continue;
      part.position.copy(base.position);
      if (travel > 0) part.position.y -= travel * amount;
      if (state.meta.kind === 'touch') {
        part.scale.copy(base.scale).multiplyScalar(1 + amount * 0.055);
      }
    }
    shadowDirty = true;
  }, () => {
    for (const part of parts) {
      const base = state.transforms.get(part);
      if (!base) continue;
      part.position.copy(base.position);
      part.scale.copy(base.scale);
    }
    dispatchInput(state, 'release', 0);
  });
}

function applyDialValue(state, value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 10);
  state.dialValue = clamped;
  const angle = THREE.MathUtils.degToRad(THREE.MathUtils.mapLinear(clamped, 0, 10, -120, 120));
  const delta = new THREE.Quaternion().setFromAxisAngle(yAxis, angle);
  for (const part of state.meta.turnParts ?? []) {
    const base = state.transforms.get(part);
    if (!base) continue;
    part.quaternion.copy(base.quaternion).multiply(delta);
  }
  shadowDirty = true;
}

function setDialValue(state, value, animate = true) {
  const target = THREE.MathUtils.clamp(value, 0, 10);
  const start = state.dialValue;
  const apply = (progress) => {
    const eased = easeOutCubic(progress);
    const current = THREE.MathUtils.lerp(start, target, eased);
    applyDialValue(state, current);
    setReadout(state, `${state.meta.label} · ${Math.round(current)}/10`);
  };
  const finish = () => {
    applyDialValue(state, target);
    dispatchInput(state, 'change', target);
  };
  if (animate) startTween(`dial:${state.meta.id}`, 170, apply, finish);
  else {
    apply(1);
    finish();
    invalidate({ shadow: true });
  }
}

function applyJoystick(state, x, z, press = 0) {
  const length = Math.hypot(x, z);
  const scale = length > 1 ? 1 / length : 1;
  const nextX = x * scale;
  const nextZ = z * scale;
  state.joystick.set(nextX, nextZ);
  for (const part of state.meta.moveParts ?? []) {
    const base = state.transforms.get(part);
    if (!base) continue;
    part.position.copy(base.position);
    part.position.x += nextX * 1.15;
    part.position.z += nextZ * 1.15;
    part.position.y -= press;
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-nextZ * 0.12, 0, nextX * 0.12));
    part.quaternion.copy(base.quaternion).multiply(tilt);
  }
  shadowDirty = true;
}

function releaseJoystick(state) {
  const from = state.joystick.clone();
  startTween(`joystick:${state.meta.id}`, 180, (progress) => {
    const amount = 1 - easeOutCubic(progress);
    applyJoystick(state, from.x * amount, from.y * amount);
  }, () => {
    applyJoystick(state, 0, 0);
    dispatchInput(state, 'release', [0, 0]);
    setReadout(state, `${state.meta.label} · centered`);
  });
}

function triggerJoystick(state) {
  dispatchInput(state, 'press', 1);
  setReadout(state, `${state.meta.label} · pressed`);
  startTween(`joystick:${state.meta.id}`, 260, (progress) => {
    applyJoystick(state, 0, 0, 0.55 * pressEnvelope(progress));
  }, () => {
    applyJoystick(state, 0, 0);
    dispatchInput(state, 'release', 0);
  });
}

function triggerInput(id, options = {}) {
  const state = interactionById.get(id);
  if (!state) return false;
  if (state.meta.kind === 'dial') {
    const next = options.delta
      ? state.dialValue + options.delta
      : state.dialValue >= 10 ? 0 : Math.round(state.dialValue) + 1;
    setDialValue(state, next, options.animate !== false);
  } else if (state.meta.kind === 'joystick') {
    triggerJoystick(state);
  } else {
    triggerPress(state);
    if (state.meta.kind === 'touch') setGlow(!glowEnabled);
  }
  return true;
}

function createSemanticInputs() {
  const fragment = document.createDocumentFragment();
  for (const state of interactionById.values()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.input = state.meta.id;
    button.setAttribute('aria-label', `Activate ${state.meta.label}`);
    const label = document.createElement('span');
    label.textContent = state.meta.label;
    const hint = document.createElement('kbd');
    hint.textContent = state.meta.kind === 'dial' ? '[ / ]' : state.meta.kind === 'joystick' ? 'Arrows' : 'Click';
    button.append(label, hint);
    button.addEventListener('click', () => triggerInput(state.meta.id));
    fragment.append(button);
  }
  semanticInputs.replaceChildren(fragment);
}

const raycaster = new THREE.Raycaster();
raycaster.layers.set(1);
const pointer = new THREE.Vector2();
let hoveredInteraction = null;
let pointerSession = null;

function pickInteraction(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactionTargets, false)[0];
  return hit ? targetToInteraction.get(hit.object) ?? null : null;
}

function shortcutHint(state) {
  if (state.meta.kind === 'dial') return 'drag or use [ / ]';
  if (state.meta.kind === 'joystick') return 'drag or use arrow keys';
  return 'click to activate';
}

function positionTooltip(event) {
  const margin = 14;
  const width = tooltip.offsetWidth || 170;
  const height = tooltip.offsetHeight || 34;
  tooltip.style.left = `${Math.min(window.innerWidth - width - margin, event.clientX + 16)}px`;
  tooltip.style.top = `${Math.min(window.innerHeight - height - margin, event.clientY + 16)}px`;
}

function updateHover(event) {
  const state = pickInteraction(event);
  if (state !== hoveredInteraction) {
    hoveredInteraction = state;
    canvas.classList.toggle('is-control-hover', Boolean(state));
    tooltip.classList.toggle('is-visible', Boolean(state));
    tooltip.dataset.visible = String(Boolean(state));
    if (state) tooltip.textContent = `${state.meta.label} · ${shortcutHint(state)}`;
  }
  if (state) positionTooltip(event);
}

function endPointerSession({ cancelled = false, releaseJoystickControl = true } = {}) {
  if (!pointerSession) return;
  const { state, pointerId } = pointerSession;
  pointerSession = null;
  if (state.meta.kind === 'joystick' && releaseJoystickControl) releaseJoystick(state);
  if (cancelled && state.meta.kind === 'dial') {
    setDialValue(state, Math.round(state.dialValue), true);
  }
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  controls.enabled = true;
  controlsSettlingUntil = performance.now() + 260;
  invalidate({ shadow: true });
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const state = pickInteraction(event);
  if (!state) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
  pointerSession = {
    state,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    initialDialValue: state.dialValue,
    moved: false,
  };
  if (state.meta.kind === 'dial') activeTweens.delete(`dial:${state.meta.id}`);
  if (state.meta.kind === 'joystick') activeTweens.delete(`joystick:${state.meta.id}`);
  if (state.meta.kind === 'key' || state.meta.kind === 'touch') triggerInput(state.meta.id);
}, { capture: true });

canvas.addEventListener('pointermove', (event) => {
  if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
    updateHover(event);
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const dx = event.clientX - pointerSession.startX;
  const dy = event.clientY - pointerSession.startY;
  pointerSession.moved ||= Math.hypot(dx, dy) > 4;
  const { state } = pointerSession;
  if (state.meta.kind === 'dial' && pointerSession.moved) {
    setDialValue(state, pointerSession.initialDialValue + dx / 26, false);
  } else if (state.meta.kind === 'joystick' && pointerSession.moved) {
    applyJoystick(state, dx / 42, dy / 42);
    setReadout(state, `${state.meta.label} · ${Math.round(state.joystick.length() * 100)}%`);
    dispatchInput(state, 'change', [state.joystick.x, state.joystick.y]);
    invalidate({ shadow: true });
  }
}, { capture: true });

canvas.addEventListener('pointerup', (event) => {
  if (!pointerSession || pointerSession.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const { state, moved } = pointerSession;
  if (state.meta.kind === 'dial') {
    if (moved) setDialValue(state, Math.round(state.dialValue), true);
    else triggerInput(state.meta.id);
  } else if (state.meta.kind === 'joystick' && !moved) {
    triggerJoystick(state);
  }
  endPointerSession({ releaseJoystickControl: state.meta.kind !== 'joystick' || moved });
}, { capture: true });

canvas.addEventListener('pointercancel', () => endPointerSession({ cancelled: true }), { capture: true });
canvas.addEventListener('lostpointercapture', () => endPointerSession({ cancelled: true }));
canvas.addEventListener('pointerleave', () => {
  if (pointerSession) return;
  hoveredInteraction = null;
  canvas.classList.remove('is-control-hover');
  tooltip.classList.remove('is-visible');
  tooltip.dataset.visible = 'false';
});
window.addEventListener('blur', () => endPointerSession({ cancelled: true }));

const agentKeyIds = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5', 'agent-6'];
const commandKeyIds = ['run', 'accept', 'reject', 'new-chat', 'push-to-talk', 'open-codex'];

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest('input, button, summary, [contenteditable="true"]')) return;
  let handled = false;
  if (/^[1-6]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    handled = triggerInput(event.shiftKey ? commandKeyIds[index] : agentKeyIds[index]);
  } else if (event.key === '[' || event.key === ']') {
    const dialState = interactionById.get('reasoning-effort');
    if (dialState) {
      setDialValue(dialState, dialState.dialValue + (event.key === ']' ? 1 : -1), true);
      handled = true;
    }
  } else if (event.key.toLowerCase() === 'e') {
    animateAssembly((motor.userData.explodedProgress ?? 0) > 0.5 ? 0 : 1);
    handled = true;
  } else if (event.key.toLowerCase() === 'g') {
    setGlow(!glowEnabled);
    handled = true;
  } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    const joystickState = interactionById.get('planar-joystick');
    if (joystickState) {
      const x = event.key === 'ArrowLeft' ? -0.75 : event.key === 'ArrowRight' ? 0.75 : 0;
      const z = event.key === 'ArrowUp' ? -0.75 : event.key === 'ArrowDown' ? 0.75 : 0;
      applyJoystick(joystickState, x, z);
      dispatchInput(joystickState, 'change', [x, z]);
      setReadout(joystickState, `${joystickState.meta.label} · ${event.key.replace('Arrow', '')}`);
      window.setTimeout(() => releaseJoystick(joystickState), 90);
      invalidate({ shadow: true });
      handled = true;
    }
  } else if (event.key === 'Escape' && pointerSession) {
    endPointerSession({ cancelled: true });
    handled = true;
  }
  if (handled) event.preventDefault();
});

function updateRendererState(moving) {
  performanceStats.moving = moving;
  performanceStats.sleeping = !moving && frameRequest === 0;
  rendererState.classList.toggle('is-active', moving);
  rendererState.dataset.state = moving ? 'active' : 'sleeping';
  rendererState.textContent = moving
    ? `${QUALITY_PROFILES[activeQualityName].label} · ${QUALITY_PROFILES[activeQualityName].fps} FPS cap`
    : 'Renderer sleeping · 0 FPS';
}

function drawFrame(now, moving = false) {
  setPostProcessingForMotion(moving);
  if (shadowDirty && QUALITY_PROFILES[activeQualityName].shadows) {
    const canRefreshShadow = !moving || now - lastShadowUpdateAt > 180;
    if (canRefreshShadow) {
      renderer.shadowMap.needsUpdate = true;
      lastShadowUpdateAt = now;
      if (!moving) shadowDirty = false;
    }
  }
  composer.render();
  performanceStats.renderedFrames += 1;
  performanceStats.lastDrawCalls = renderer.info.render.calls;
  performanceStats.lastTriangles = renderer.info.render.triangles;
  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => app.classList.add('is-ready'));
  }
}

function invalidate({ shadow = false } = {}) {
  renderDirty = true;
  if (shadow) shadowDirty = true;
  performanceStats.sleeping = false;
  if (!frameRequest && !document.hidden) frameRequest = requestAnimationFrame(frame);
}

function frame(now) {
  frameRequest = 0;
  const cameraMoving = updateViewTransition(now);
  const assemblyMoving = updateAssemblyTransition(now);
  const interactionMoving = updateTweens(now);
  controls.update();
  const orbitMoving = controlsInteracting || now < controlsSettlingUntil;
  const moving = cameraMoving || assemblyMoving || interactionMoving || orbitMoving;

  if (moving) renderDirty = true;
  const interval = 1000 / QUALITY_PROFILES[activeQualityName].fps;
  const canDraw = !moving || now - lastFrameAt >= interval;
  if (renderDirty && canDraw) {
    drawFrame(now, moving);
    renderDirty = false;
    lastFrameAt = now;
  }

  if (moving) {
    updateRendererState(true);
    if (!frameRequest) frameRequest = requestAnimationFrame(frame);
  } else if (renderDirty) {
    if (!frameRequest) frameRequest = requestAnimationFrame(frame);
  } else {
    updateRendererState(false);
  }
}

function renderImmediately() {
  viewTransition = null;
  assemblyTransition = null;
  controls.update();
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  shadowDirty = true;
  drawFrame(performance.now(), false);
  renderDirty = false;
  updateRendererState(false);
}

function resize() {
  if (captureRestore) return;
  applyViewport();
  invalidate();
}

document.querySelectorAll('.view-button').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

glowControl.addEventListener('click', () => setGlow(!glowEnabled));
qualityControl.addEventListener('click', () => {
  const currentIndex = QUALITY_ORDER.indexOf(activeQualityName);
  setQuality(QUALITY_ORDER[(currentIndex + 1) % QUALITY_ORDER.length]);
});

assemblyProgress.addEventListener('input', () => {
  assemblyTransition = null;
  applyExploded(Number(assemblyProgress.value) / 100);
  invalidate({ shadow: true });
});
assemblyProgress.addEventListener('change', () => {
  const progress = Number(assemblyProgress.value) / 100;
  setReadout({ meta: { id: 'assembly', action: progress > 0.5 ? 'Assembly separated' : 'Assembly compacted' } });
});

document.querySelectorAll('[data-assembly]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = Number(button.dataset.assembly);
    if (target === 1) setView('exploded');
    else animateAssembly(0);
  });
});

controls.addEventListener('start', () => {
  controlsInteracting = true;
  viewTransition = null;
  invalidate();
});
controls.addEventListener('change', () => invalidate());
controls.addEventListener('end', () => {
  controlsInteracting = false;
  controlsSettlingUntil = performance.now() + 440;
  invalidate();
});

window.addEventListener('resize', resize, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    performanceStats.sleeping = true;
  } else {
    invalidate();
  }
});

createSemanticInputs();
setView('hero', true);
setGlow(true);

let savedQuality = 'balanced';
try {
  const storedQuality = window.localStorage.getItem('codex-micro-quality');
  if (QUALITY_PROFILES[storedQuality]) savedQuality = storedQuality;
} catch { /* storage is optional */ }
setQuality(savedQuality, { persist: false });
updateAssemblyUi(0);

const audit = auditCodexMicroConnections(motor);
if (audit.failed > 0) console.error('Codex Micro connection audit failed', audit.failures);

window.__CODEX_MICRO__ = {
  renderer,
  scene,
  camera,
  controls,
  model: motor,
  composer,
  materials: motor.userData.materials,
  assemblies: motor.userData.assemblies,
  audit,
  viewPresets,
  performanceStats,
  setView,
  setGlow,
  setQuality,
  setExploded(value, immediate = true) {
    if (immediate) {
      assemblyTransition = null;
      applyExploded(value);
      invalidate({ shadow: true });
    } else animateAssembly(value);
  },
  triggerInput,
  invalidate,
  render: renderImmediately,
  prepareCapture({ width, height, pixelRatio = 1 } = {}) {
    if (!captureRestore) {
      captureRestore = {
        quality: activeQualityName,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    setQuality('studio', { persist: false, resize: false });
    applyViewport(width ?? window.innerWidth, height ?? window.innerHeight, pixelRatio);
    renderImmediately();
  },
  restoreInteractiveSize() {
    const quality = captureRestore?.quality ?? activeQualityName;
    captureRestore = null;
    setQuality(quality, { persist: false, resize: false });
    applyViewport();
    invalidate({ shadow: true });
  },
  get activeView() { return activeView; },
  get activeQuality() { return activeQualityName; },
  get explodedProgress() { return motor.userData.explodedProgress ?? 0; },
  get modelSize() { return modelSize.clone(); },
  get modelCenter() { return modelCenter.clone(); },
};
