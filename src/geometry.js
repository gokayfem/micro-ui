import * as THREE from 'three';

// All helpers are Y-up. Rounded 2D paths use (x, z) coordinates; extrusions
// are rotated so their thickness runs along +Y. Defaults are millimetres.

const EPSILON = 1e-4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function requirePositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function traceRoundedRectangle(path, width, depth, radius, clockwise = false, x = 0, z = 0) {
  requirePositive('width', width);
  requirePositive('depth', depth);

  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const r = clamp(radius ?? 0, 0, Math.min(halfWidth, halfDepth));

  if (r <= EPSILON) {
    if (clockwise) {
      path.moveTo(x - halfWidth, z - halfDepth);
      path.lineTo(x - halfWidth, z + halfDepth);
      path.lineTo(x + halfWidth, z + halfDepth);
      path.lineTo(x + halfWidth, z - halfDepth);
    } else {
      path.moveTo(x - halfWidth, z - halfDepth);
      path.lineTo(x + halfWidth, z - halfDepth);
      path.lineTo(x + halfWidth, z + halfDepth);
      path.lineTo(x - halfWidth, z + halfDepth);
    }
    path.closePath();
    return path;
  }

  if (!clockwise) {
    path.moveTo(x - halfWidth + r, z - halfDepth);
    path.lineTo(x + halfWidth - r, z - halfDepth);
    path.absarc(x + halfWidth - r, z - halfDepth + r, r, -Math.PI / 2, 0, false);
    path.lineTo(x + halfWidth, z + halfDepth - r);
    path.absarc(x + halfWidth - r, z + halfDepth - r, r, 0, Math.PI / 2, false);
    path.lineTo(x - halfWidth + r, z + halfDepth);
    path.absarc(x - halfWidth + r, z + halfDepth - r, r, Math.PI / 2, Math.PI, false);
    path.lineTo(x - halfWidth, z - halfDepth + r);
    path.absarc(x - halfWidth + r, z - halfDepth + r, r, Math.PI, Math.PI * 1.5, false);
  } else {
    path.moveTo(x - halfWidth + r, z - halfDepth);
    path.lineTo(x - halfWidth + r, z - halfDepth);
    path.absarc(x - halfWidth + r, z - halfDepth + r, r, -Math.PI / 2, -Math.PI, true);
    path.lineTo(x - halfWidth, z + halfDepth - r);
    path.absarc(x - halfWidth + r, z + halfDepth - r, r, Math.PI, Math.PI / 2, true);
    path.lineTo(x + halfWidth - r, z + halfDepth);
    path.absarc(x + halfWidth - r, z + halfDepth - r, r, Math.PI / 2, 0, true);
    path.lineTo(x + halfWidth, z - halfDepth + r);
    path.absarc(x + halfWidth - r, z - halfDepth + r, r, 0, -Math.PI / 2, true);
  }

  path.closePath();
  return path;
}

/** A centered rounded rectangle Shape. Shape Y represents world Z. */
export function createRoundedRectangleShape(
  width,
  depth,
  radius = Math.min(width, depth) * 0.1,
  { clockwise = false, x = 0, z = 0 } = {},
) {
  return traceRoundedRectangle(new THREE.Shape(), width, depth, radius, clockwise, x, z);
}

/** A centered rounded rectangle Path, useful as a real Shape hole. */
export function createRoundedRectanglePath(
  width,
  depth,
  radius = Math.min(width, depth) * 0.1,
  { clockwise = true, x = 0, z = 0 } = {},
) {
  return traceRoundedRectangle(new THREE.Path(), width, depth, radius, clockwise, x, z);
}

export const roundedRectShape = createRoundedRectangleShape;

function centerYUpGeometry(geometry, centerY = 0) {
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
  height,
  bevelSize = 0,
  bevelThickness = bevelSize,
  bevelSegments = 3,
  curveSegments = 12,
  centerY = 0,
}) {
  const verticalBevel = clamp(bevelThickness, 0, Math.max(0, height * 0.5 - EPSILON));
  const bodyDepth = Math.max(EPSILON, height - verticalBevel * 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: bodyDepth,
    steps: 1,
    curveSegments,
    bevelEnabled: bevelSize > EPSILON && verticalBevel > EPSILON,
    bevelSize,
    bevelThickness: verticalBevel,
    bevelSegments: Math.max(1, Math.round(bevelSegments)),
  });
  geometry.rotateX(-Math.PI / 2);
  return centerYUpGeometry(geometry, centerY);
}

/**
 * Bevelled rounded slab with exact requested outer width/depth/height.
 * The geometry is centered on centerY by default.
 */
export function createRoundedSlabGeometry({
  width = 100,
  depth = 100,
  height = 6,
  radius = 10,
  bevelSize = 0.8,
  bevelThickness = bevelSize,
  bevelSegments = 4,
  curveSegments = 16,
  centerY = 0,
} = {}) {
  requirePositive('width', width);
  requirePositive('depth', depth);
  requirePositive('height', height);

  const lateralBevel = clamp(bevelSize, 0, Math.min(width, depth) * 0.24);
  const shapeWidth = Math.max(EPSILON, width - lateralBevel * 2);
  const shapeDepth = Math.max(EPSILON, depth - lateralBevel * 2);
  const shapeRadius = clamp(radius - lateralBevel, 0, Math.min(shapeWidth, shapeDepth) * 0.5);
  const shape = createRoundedRectangleShape(shapeWidth, shapeDepth, shapeRadius);
  const geometry = extrudeYUp(shape, {
    height,
    bevelSize: lateralBevel,
    bevelThickness,
    bevelSegments,
    curveSegments,
    centerY,
  });
  geometry.userData.kind = 'rounded-slab';
  geometry.userData.dimensions = { width, depth, height, radius };
  return geometry;
}

/**
 * A true rounded-rectangle frame: the inner opening is a Shape hole, not a
 * dark inset or stacked plates. Inner dimensions describe the vertical bore;
 * bevels naturally flare the opening at the top and bottom faces.
 */
export function createRoundedRectRingGeometry({
  width = 100,
  depth = 100,
  height = 5,
  radius = 12,
  frameWidth = 6,
  innerWidth,
  innerDepth,
  innerRadius,
  bevelSize = 0.5,
  bevelThickness = bevelSize,
  bevelSegments = 3,
  curveSegments = 16,
  centerY = 0,
} = {}) {
  requirePositive('width', width);
  requirePositive('depth', depth);
  requirePositive('height', height);

  const lateralBevel = clamp(bevelSize, 0, Math.min(width, depth) * 0.2);
  const outerShapeWidth = width - lateralBevel * 2;
  const outerShapeDepth = depth - lateralBevel * 2;
  const outerShapeRadius = clamp(radius - lateralBevel, 0, Math.min(outerShapeWidth, outerShapeDepth) * 0.5);
  const resolvedInnerWidth = innerWidth ?? width - frameWidth * 2;
  const resolvedInnerDepth = innerDepth ?? depth - frameWidth * 2;

  if (resolvedInnerWidth <= 0 || resolvedInnerDepth <= 0) {
    throw new RangeError('The rounded frame opening must have positive dimensions.');
  }
  if (resolvedInnerWidth >= outerShapeWidth || resolvedInnerDepth >= outerShapeDepth) {
    throw new RangeError('The rounded frame opening must remain inside the outer contour.');
  }

  const resolvedInnerRadius = clamp(
    innerRadius ?? Math.max(0, radius - frameWidth),
    0,
    Math.min(resolvedInnerWidth, resolvedInnerDepth) * 0.5,
  );
  const shape = createRoundedRectangleShape(outerShapeWidth, outerShapeDepth, outerShapeRadius);
  shape.holes.push(createRoundedRectanglePath(
    resolvedInnerWidth,
    resolvedInnerDepth,
    resolvedInnerRadius,
    { clockwise: true },
  ));
  const geometry = extrudeYUp(shape, {
    height,
    bevelSize: lateralBevel,
    bevelThickness,
    bevelSegments,
    curveSegments,
    centerY,
  });
  geometry.userData.kind = 'rounded-rectangle-ring';
  geometry.userData.dimensions = {
    width,
    depth,
    height,
    innerWidth: resolvedInnerWidth,
    innerDepth: resolvedInnerDepth,
  };
  return geometry;
}

function sampleRoundedRectangleXZ(width, depth, radius, cornerSegments) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const r = clamp(radius, EPSILON, Math.min(halfWidth, halfDepth));
  const segments = Math.max(2, Math.round(cornerSegments));
  const corners = [
    [halfWidth - r, -halfDepth + r, -Math.PI / 2],
    [halfWidth - r, halfDepth - r, 0],
    [-halfWidth + r, halfDepth - r, Math.PI / 2],
    [-halfWidth + r, -halfDepth + r, Math.PI],
  ];
  const points = [];

  for (const [cx, cz, start] of corners) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = start + (index / segments) * Math.PI * 0.5;
      // Negating Shape-Y gives clockwise XZ winding when viewed from +Y.
      points.push(new THREE.Vector2(cx + Math.cos(angle) * r, -(cz + Math.sin(angle) * r)));
    }
  }
  return points;
}

function createGeometryBuilder() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const triangleMaterials = [];

  return {
    vertex(x, y, z, u = 0, v = 0) {
      positions.push(x, y, z);
      uvs.push(u, v);
      return positions.length / 3 - 1;
    },
    triangle(a, b, c, materialIndex = 0) {
      indices.push(a, b, c);
      triangleMaterials.push(materialIndex);
    },
    build() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.clearGroups();

      let startTriangle = 0;
      while (startTriangle < triangleMaterials.length) {
        const materialIndex = triangleMaterials[startTriangle];
        let endTriangle = startTriangle + 1;
        while (
          endTriangle < triangleMaterials.length
          && triangleMaterials[endTriangle] === materialIndex
        ) endTriangle += 1;
        geometry.addGroup(startTriangle * 3, (endTriangle - startTriangle) * 3, materialIndex);
        startTriangle = endTriangle;
      }

      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

function addContour(builder, contour, y, width, depth, v = 0) {
  return contour.map((point, index) => builder.vertex(
    point.x,
    y,
    point.y,
    point.x / width + 0.5,
    v || 0.5 - point.y / depth || index / contour.length,
  ));
}

function connectContourRings(builder, lower, upper, materialIndex = 0, inward = false) {
  for (let index = 0; index < lower.length; index += 1) {
    const next = (index + 1) % lower.length;
    if (!inward) {
      builder.triangle(lower[index], lower[next], upper[next], materialIndex);
      builder.triangle(lower[index], upper[next], upper[index], materialIndex);
    } else {
      builder.triangle(lower[index], upper[next], lower[next], materialIndex);
      builder.triangle(lower[index], upper[index], upper[next], materialIndex);
    }
  }
}

/**
 * Low-profile 1U/2U keycap with tapered walls, rounded lower/upper bevels, an
 * open underside cavity, and a tessellated shallow concave dish (not a normal
 * map). Material groups: 0 sides/bevel, 1 dished top, 2 underside.
 */
export function createLowProfileKeycapGeometry({
  units = 1,
  unitSize = 19.05,
  gap = 1.15,
  width = units * unitSize - gap,
  depth = unitSize - gap,
  height = 7.1,
  cornerRadius = 2.25,
  topInset = 1.15,
  bottomBevel = 0.55,
  topBevel = 0.65,
  dishDepth = 0.62,
  dishExponent = 2,
  wallThickness = 0.8,
  topThickness = 1.05,
  cornerSegments = 8,
  dishSegments = 9,
  openBottom = true,
  centeredY = false,
} = {}) {
  requirePositive('width', width);
  requirePositive('depth', depth);
  requirePositive('height', height);

  const bBevel = clamp(bottomBevel, 0, Math.min(width, depth) * 0.12);
  const tBevel = clamp(topBevel, 0, Math.min(width, depth) * 0.12);
  const topWidth = Math.max(width * 0.45, width - topInset * 2);
  const topDepth = Math.max(depth * 0.45, depth - topInset * 2);
  const topRadius = clamp(cornerRadius - topInset * 0.42, 0.25, Math.min(topWidth, topDepth) * 0.5);
  const builder = createGeometryBuilder();
  const levels = [
    {
      y: 0,
      width: width - bBevel * 2,
      depth: depth - bBevel * 2,
      radius: Math.max(0.2, cornerRadius - bBevel),
    },
    { y: bBevel, width, depth, radius: cornerRadius },
    {
      y: height - tBevel,
      width: Math.min(width, topWidth + tBevel * 2),
      depth: Math.min(depth, topDepth + tBevel * 2),
      radius: topRadius + tBevel,
    },
    { y: height, width: topWidth, depth: topDepth, radius: topRadius },
  ];

  const outsideRings = levels.map((level) => addContour(
    builder,
    sampleRoundedRectangleXZ(level.width, level.depth, level.radius, cornerSegments),
    level.y,
    width,
    depth,
    level.y / height,
  ));
  for (let index = 0; index < outsideRings.length - 1; index += 1) {
    connectContourRings(builder, outsideRings[index], outsideRings[index + 1], 0, false);
  }

  const dishContour = sampleRoundedRectangleXZ(topWidth, topDepth, topRadius, cornerSegments);
  const dishRingCount = Math.max(3, Math.round(dishSegments));
  const center = builder.vertex(0, height - dishDepth, 0, 0.5, 0.5);
  let previous = null;

  for (let ringIndex = 1; ringIndex <= dishRingCount; ringIndex += 1) {
    const radial = ringIndex / dishRingCount;
    const y = height - dishDepth * (1 - Math.pow(radial, dishExponent));
    const ring = dishContour.map((point) => builder.vertex(
      point.x * radial,
      y,
      point.y * radial,
      point.x * radial / width + 0.5,
      0.5 - point.y * radial / depth,
    ));
    if (!previous) {
      for (let index = 0; index < ring.length; index += 1) {
        builder.triangle(center, ring[index], ring[(index + 1) % ring.length], 1);
      }
    } else {
      for (let index = 0; index < ring.length; index += 1) {
        const next = (index + 1) % ring.length;
        builder.triangle(previous[index], ring[index], ring[next], 1);
        builder.triangle(previous[index], ring[next], previous[next], 1);
      }
    }
    previous = ring;
  }

  const baseLevel = levels[0];
  if (openBottom) {
    const innerWidth = Math.max(EPSILON, baseLevel.width - wallThickness * 2);
    const innerDepth = Math.max(EPSILON, baseLevel.depth - wallThickness * 2);
    const innerBottomContour = sampleRoundedRectangleXZ(
      innerWidth,
      innerDepth,
      Math.max(0.15, baseLevel.radius - wallThickness),
      cornerSegments,
    );
    const undersideY = clamp(height - dishDepth - topThickness, wallThickness, height * 0.82);
    const innerTopWidth = Math.max(innerWidth * 0.6, topWidth - wallThickness * 2);
    const innerTopDepth = Math.max(innerDepth * 0.6, topDepth - wallThickness * 2);
    const innerTopContour = sampleRoundedRectangleXZ(
      innerTopWidth,
      innerTopDepth,
      Math.max(0.15, topRadius - wallThickness),
      cornerSegments,
    );
    const innerBottom = addContour(builder, innerBottomContour, 0, width, depth);
    const innerTop = addContour(builder, innerTopContour, undersideY, width, depth);

    for (let index = 0; index < innerBottom.length; index += 1) {
      const next = (index + 1) % innerBottom.length;
      builder.triangle(outsideRings[0][index], innerBottom[index], innerBottom[next], 2);
      builder.triangle(outsideRings[0][index], innerBottom[next], outsideRings[0][next], 2);
    }
    connectContourRings(builder, innerBottom, innerTop, 2, true);
    const ceilingCenter = builder.vertex(0, undersideY, 0, 0.5, 0.5);
    for (let index = 0; index < innerTop.length; index += 1) {
      builder.triangle(ceilingCenter, innerTop[(index + 1) % innerTop.length], innerTop[index], 2);
    }
  } else {
    const bottomCenter = builder.vertex(0, 0, 0, 0.5, 0.5);
    for (let index = 0; index < outsideRings[0].length; index += 1) {
      builder.triangle(
        bottomCenter,
        outsideRings[0][(index + 1) % outsideRings[0].length],
        outsideRings[0][index],
        2,
      );
    }
  }

  const geometry = builder.build();
  if (centeredY) geometry.translate(0, -height * 0.5, 0);
  geometry.userData.kind = 'low-profile-keycap';
  geometry.userData.units = units;
  geometry.userData.dimensions = { width, depth, height, dishDepth };
  return geometry;
}

/** Lathed, fully capped cylinder/knob with real round-over bevels. */
export function createBeveledCylinderGeometry({
  radius = 10,
  height = 8,
  bevelRadius = 0.8,
  radialSegments = 64,
  bevelSegments = 5,
  cap = true,
  topCrown = 0,
  centeredY = true,
} = {}) {
  requirePositive('radius', radius);
  requirePositive('height', height);
  const bevel = clamp(bevelRadius, 0, Math.min(radius * 0.9, height * 0.5 - EPSILON));
  const y0 = centeredY ? -height * 0.5 : 0;
  const y1 = y0 + height;
  const points = [];
  if (cap) points.push(new THREE.Vector2(0, y0));
  points.push(new THREE.Vector2(Math.max(EPSILON, radius - bevel), y0));
  for (let index = 1; index <= bevelSegments; index += 1) {
    const angle = -Math.PI / 2 + (index / bevelSegments) * Math.PI / 2;
    points.push(new THREE.Vector2(
      radius - bevel + Math.cos(angle) * bevel,
      y0 + bevel + Math.sin(angle) * bevel,
    ));
  }
  points.push(new THREE.Vector2(radius, y1 - bevel));
  for (let index = 1; index <= bevelSegments; index += 1) {
    const angle = (index / bevelSegments) * Math.PI / 2;
    points.push(new THREE.Vector2(
      radius - bevel + Math.cos(angle) * bevel,
      y1 - bevel + Math.sin(angle) * bevel,
    ));
  }
  if (cap) {
    if (topCrown !== 0) points.push(new THREE.Vector2(radius * 0.52, y1 + topCrown * 0.74));
    points.push(new THREE.Vector2(0, y1 + topCrown));
  }
  const geometry = new THREE.LatheGeometry(
    points,
    Math.max(8, Math.round(radialSegments)),
    0,
    Math.PI * 2,
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.kind = 'beveled-cylinder';
  return geometry;
}

/** A Cherry-MX-compatible positive cross silhouette in Shape coordinates. */
export function createMXStemShape({
  armLength = 4.1,
  armWidth = 1.25,
} = {}) {
  requirePositive('armLength', armLength);
  requirePositive('armWidth', armWidth);
  const h = armLength * 0.5;
  const w = Math.min(armWidth * 0.5, h - EPSILON);
  const points = [
    [-w, -h], [w, -h], [w, -w], [h, -w], [h, w], [w, w],
    [w, h], [-w, h], [-w, w], [-h, w], [-h, -w], [-w, -w],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();
  return shape;
}

/** A bevelled, Y-up positive MX stem, centered vertically by default. */
export function createMXStemGeometry({
  armLength = 4.1,
  armWidth = 1.25,
  height = 3.6,
  bevelSize = 0.08,
  bevelThickness = 0.08,
  bevelSegments = 2,
  centerY = 0,
} = {}) {
  const lateralBevel = clamp(bevelSize, 0, armWidth * 0.2);
  const shape = createMXStemShape({
    armLength: armLength - lateralBevel * 2,
    armWidth: armWidth - lateralBevel * 2,
  });
  const geometry = extrudeYUp(shape, {
    height,
    bevelSize: lateralBevel,
    bevelThickness,
    bevelSegments,
    curveSegments: 1,
    centerY,
  });
  geometry.userData.kind = 'mx-stem';
  return geometry;
}

const fallbackScrewMetal = new THREE.MeshStandardMaterial({
  color: 0x202322,
  metalness: 0.82,
  roughness: 0.34,
});
const fallbackSocket = new THREE.MeshStandardMaterial({
  color: 0x030404,
  metalness: 0.25,
  roughness: 0.72,
});

/**
 * Visually complete socket-head screw. Group origin is the mounting plane:
 * shank extends down -Y and the head/optional washer sit above +Y.
 */
export function createHexSocketScrew({
  headRadius = 2.5,
  headHeight = 2.1,
  headBevel = 0.32,
  shankRadius = 1.15,
  shankLength = 6,
  socketRadius = 0.9,
  socketDepth = 0.48,
  washerRadius = 0,
  washerThickness = 0.28,
  radialSegments = 48,
  metalMaterial = fallbackScrewMetal,
  socketMaterial = fallbackSocket,
  washerMaterial = metalMaterial,
} = {}) {
  const group = new THREE.Group();
  group.name = 'hex-socket-screw';
  const washerHeight = washerRadius > EPSILON ? washerThickness : 0;

  const head = new THREE.Mesh(createBeveledCylinderGeometry({
    radius: headRadius,
    height: headHeight,
    bevelRadius: headBevel,
    radialSegments,
    bevelSegments: 4,
    centeredY: true,
  }), metalMaterial);
  head.position.y = washerHeight + headHeight * 0.5;
  head.name = 'head';
  head.castShadow = head.receiveShadow = true;
  group.add(head);

  const shank = new THREE.Mesh(new THREE.CylinderGeometry(
    shankRadius,
    shankRadius * 0.96,
    shankLength,
    Math.max(12, Math.round(radialSegments * 0.5)),
    1,
    false,
  ), metalMaterial);
  shank.position.y = -shankLength * 0.5;
  shank.name = 'shank';
  shank.castShadow = true;
  group.add(shank);

  if (washerRadius > EPSILON) {
    const washer = new THREE.Mesh(createBeveledCylinderGeometry({
      radius: washerRadius,
      height: washerThickness,
      bevelRadius: Math.min(washerThickness * 0.28, washerRadius * 0.12),
      radialSegments,
      bevelSegments: 2,
      centeredY: true,
    }), washerMaterial);
    washer.position.y = washerThickness * 0.5;
    washer.name = 'washer';
    group.add(washer);
  }

  // The inset six-sided prism sits below the crown and reads as a true deep
  // socket under grazing light without requiring fragile boolean geometry.
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(
    socketRadius,
    socketRadius * 0.94,
    socketDepth,
    6,
    1,
    false,
  ), socketMaterial);
  socket.position.y = washerHeight + headHeight - socketDepth * 0.5 + 0.012;
  socket.rotation.y = Math.PI / 6;
  socket.name = 'hex-socket';
  group.add(socket);

  group.userData.kind = 'hex-socket-screw';
  group.userData.mountingPlaneY = 0;
  return group;
}

/** Cylinder Mesh whose capped ends land exactly on start/end (plus overlap). */
export function createRodBetween(start, end, {
  radius = 0.5,
  radialSegments = 16,
  material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.45 }),
  overlap = 0,
  name = 'connection-rod',
} = {}) {
  const a = new THREE.Vector3().copy(start);
  const b = new THREE.Vector3().copy(end);
  const direction = b.clone().sub(a);
  const distance = direction.length();
  if (distance <= EPSILON) throw new RangeError('Rod endpoints must be distinct.');
  const length = distance + overlap * 2;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(
    radius,
    radius,
    length,
    Math.max(6, Math.round(radialSegments)),
    1,
    false,
  ), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.endpoints = [a.clone(), b.clone()];
  return mesh;
}

/** Contact-safe rod with optional spherical collars that hide tiny seams. */
export function createConnectorBetween(start, end, {
  radius = 0.5,
  radialSegments = 16,
  material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.45 }),
  overlap = 0.08,
  endCaps = true,
  endCapScale = 1.04,
  name = 'connection',
} = {}) {
  const group = new THREE.Group();
  group.name = name;
  group.add(createRodBetween(start, end, {
    radius,
    radialSegments,
    material,
    overlap,
    name: `${name}-rod`,
  }));
  if (endCaps) {
    const geometry = new THREE.SphereGeometry(radius * endCapScale, radialSegments, Math.max(6, radialSegments >> 1));
    const startCap = new THREE.Mesh(geometry, material);
    const endCap = new THREE.Mesh(geometry, material);
    startCap.position.copy(start);
    endCap.position.copy(end);
    startCap.name = `${name}-start-collar`;
    endCap.name = `${name}-end-collar`;
    group.add(startCap, endCap);
  }
  group.userData.kind = 'contact-safe-connector';
  return group;
}
