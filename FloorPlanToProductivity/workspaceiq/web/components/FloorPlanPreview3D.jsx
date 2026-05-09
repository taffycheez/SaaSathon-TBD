"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getObjectDefinition } from "@/lib/objectCatalog";
import { getScaledItemDimensions, normalizeWallGraph } from "@/lib/roomGeometry";

const WALL_HEIGHT_M = 2.8;
const WALL_THICKNESS_M = 0.16;
const DOOR_HEIGHT_M = 2.1;
const WINDOW_HEIGHT_M = 1.25;
const WINDOW_SILL_M = 0.95;
const MIN_WALL_SEGMENT_PERCENT = 0.8;
const OBJECT_HEIGHTS_M = {
  desk: 0.75,
  l_shaped_desk: 0.75,
  meeting_table: 0.75,
  chair: 0.95,
  armchair: 0.95,
  couch: 0.95,
  table: 0.75,
  filing_cabinet: 1.2,
  whiteboard: 1.3,
  plant: 0.7,
  trashcan: 0.5,
  office_equipment: 0.8,
  toilet: 0.8,
  sink: 0.9,
  fridge: 1.8,
  kitchenette: 0.95,
  shower: 2
};
const TIME_OF_DAY_PRESETS = [
  { label: "Morning", value: 8 },
  { label: "Noon", value: 12 },
  { label: "Evening", value: 17 },
  { label: "Night", value: 20 }
];

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getWallBounds(walls) {
  const points = Array.isArray(walls)
    ? walls.flatMap((wall) => [
        { x: clampNumber(wall?.x1_percent), y: clampNumber(wall?.y1_percent) },
        { x: clampNumber(wall?.x2_percent), y: clampNumber(wall?.y2_percent) }
      ])
    : [];

  if (!points.length) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function getMetersScale(room, bounds) {
  const widthPercent = Math.max(1, bounds.maxX - bounds.minX);
  const depthPercent = Math.max(1, bounds.maxY - bounds.minY);
  const widthMeters = Math.max(4, clampNumber(room?.estimated_width_m, 8));
  const depthMeters = Math.max(4, clampNumber(room?.estimated_height_m, 6));
  return {
    widthMeters,
    depthMeters,
    xScale: widthMeters / widthPercent,
    zScale: depthMeters / depthPercent
  };
}

function toWorldPoint(point, bounds, scale) {
  return new THREE.Vector3(
    (point.x - bounds.minX) * scale.xScale - scale.widthMeters / 2,
    0,
    (point.y - bounds.minY) * scale.zScale - scale.depthMeters / 2
  );
}

function interpolateWorldPoint(start, end, positionPercent) {
  const ratio = clampRange(positionPercent / 100, 0, 1);
  return start.clone().lerp(end, ratio);
}

function getWallLengthPercent(wall) {
  return Math.hypot(
    clampNumber(wall?.x2_percent) - clampNumber(wall?.x1_percent),
    clampNumber(wall?.y2_percent) - clampNumber(wall?.y1_percent)
  );
}

function getOpeningRangePercent(item, wall, defaultWidthPercent) {
  const wallLengthPercent = Math.max(getWallLengthPercent(wall), 1);
  const widthPercent = Math.max(4, clampNumber(item?.width_percent, defaultWidthPercent));
  const spanPercent = Math.min(92, (widthPercent / wallLengthPercent) * 100);
  const positionPercent = clampRange(clampNumber(item?.position_percent, 50), 0, 100);
  const openingAnchor = item?.opening_anchor === "edge" ? "edge" : "center";
  const hingeSide = item?.hinge_side === "end" ? "end" : "start";

  if (openingAnchor === "edge") {
    return hingeSide === "end"
      ? {
          start: clampRange(positionPercent - spanPercent, 0, 100),
          end: clampRange(positionPercent, 0, 100)
        }
      : {
          start: clampRange(positionPercent, 0, 100),
          end: clampRange(positionPercent + spanPercent, 0, 100)
        };
  }

  return {
    start: clampRange(positionPercent - spanPercent / 2, 0, 100),
    end: clampRange(positionPercent + spanPercent / 2, 0, 100)
  };
}

function lerpColor(startHex, endHex, t) {
  const parse = (hex) => {
    const safe = hex.replace("#", "");
    return [0, 2, 4].map((index) => parseInt(safe.slice(index, index + 2), 16));
  };
  const [sr, sg, sb] = parse(startHex);
  const [er, eg, eb] = parse(endHex);
  const mix = (start, end) => Math.round(start + (end - start) * t);
  return `rgb(${mix(sr, er)}, ${mix(sg, eg)}, ${mix(sb, eb)})`;
}

function getSunState(timeOfDay, northDirectionDeg, lightingStrength = 1) {
  const daylight = clampRange(Math.sin(((timeOfDay - 6) / 12) * Math.PI), 0, 1);
  const duskBlend = clampRange(1 - daylight, 0, 1);
  const nightBlend = clampRange((8 - timeOfDay) / 4, 0, 1) + clampRange((timeOfDay - 18) / 4, 0, 1);
  const azimuthDeg = northDirectionDeg + 90 + ((timeOfDay - 6) / 12) * 180;
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const distance = 12;
  const elevation = 1.2 + daylight * 8.4;
  const strength = clampRange(Number(lightingStrength) || 1, 0.2, 1.6);
  const ambientStrength = 0.5 + strength * 0.5;

  return {
    daylight,
    lightingStrength: strength,
    ambient: (0.12 + daylight * 0.9) * ambientStrength,
    keyLight: (0.06 + daylight * 1.85) * strength,
    fillLight: (0.04 + daylight * 0.52) * (0.7 + strength * 0.3),
    sunPosition: new THREE.Vector3(Math.sin(azimuth) * distance, elevation, -Math.cos(azimuth) * distance),
    background: nightBlend > 0.25
      ? lerpColor("#151c2f", "#35507d", clampRange(nightBlend, 0, 1))
      : lerpColor("#c88252", "#f4ecdd", daylight),
    fog: nightBlend > 0.25
      ? lerpColor("#182238", "#46618d", clampRange(nightBlend, 0, 1))
      : lerpColor("#8f5b44", "#f4ecdd", daylight),
    floor: nightBlend > 0.25
      ? lerpColor("#6f5d4b", "#9b8a74", clampRange(nightBlend, 0, 1))
      : lerpColor("#9f7d5f", "#eadfca", daylight),
    sunColor: daylight > 0.6 ? "#fff4d7" : duskBlend > 0.65 ? "#ffbf8e" : "#8db6ff"
  };
}

function objectFootprint(item) {
  const dimensions = getScaledItemDimensions(item);
  const halfWidth = dimensions.width_percent / 2;
  const halfDepth = dimensions.height_percent / 2;
  const rotation = (clampNumber(item?.rotation_deg) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners = [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth }
  ];

  return corners.map((corner) => ({
    x: clampNumber(item?.x_percent, 50) + corner.x * cos - corner.y * sin,
    y: clampNumber(item?.y_percent, 50) + corner.x * sin + corner.y * cos
  }));
}

function createFloorMesh(points, bounds, scale, color) {
  const shape = new THREE.Shape();
  const worldPoints = points.map((point) => toWorldPoint(point, bounds, scale));
  worldPoints.forEach((point, index) => {
    if (index === 0) {
      shape.moveTo(point.x, point.z);
    } else {
      shape.lineTo(point.x, point.z);
    }
  });
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function createWallSegmentMesh(wall, bounds, scale, startPercent, endPercent, minY, maxY) {
  if (endPercent - startPercent < MIN_WALL_SEGMENT_PERCENT || maxY <= minY) {
    return null;
  }

  const start = toWorldPoint({ x: wall.x1_percent, y: wall.y1_percent }, bounds, scale);
  const end = toWorldPoint({ x: wall.x2_percent, y: wall.y2_percent }, bounds, scale);
  const segmentStart = interpolateWorldPoint(start, end, startPercent);
  const segmentEnd = interpolateWorldPoint(start, end, endPercent);
  const center = segmentStart.clone().add(segmentEnd).multiplyScalar(0.5);
  const length = segmentStart.distanceTo(segmentEnd);
  const angle = Math.atan2(end.z - start.z, end.x - start.x);
  const geometry = new THREE.BoxGeometry(length, maxY - minY, WALL_THICKNESS_M);
  const material = new THREE.MeshStandardMaterial({ color: "#d1c1a6", roughness: 0.92 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center.x, minY + (maxY - minY) / 2, center.z);
  mesh.rotation.y = -angle;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createWallMesh(wall, wallIndex, bounds, scale, openings = []) {
  const group = new THREE.Group();
  const wallOpenings = openings
    .filter((opening) => Number(opening.item?.wall_index) === wallIndex)
    .map((opening) => ({
      ...opening,
      range: getOpeningRangePercent(
        opening.item,
        wall,
        opening.kind === "windows" ? 14 : 10
      )
    }))
    .filter((opening) => opening.range.end - opening.range.start >= MIN_WALL_SEGMENT_PERCENT)
    .sort((a, b) => a.range.start - b.range.start);

  let cursor = 0;
  wallOpenings.forEach((opening) => {
    const startPercent = Math.max(cursor, opening.range.start);
    const endPercent = Math.max(startPercent, opening.range.end);
    const beforeMesh = createWallSegmentMesh(wall, bounds, scale, cursor, startPercent, 0, WALL_HEIGHT_M);
    if (beforeMesh) {
      group.add(beforeMesh);
    }

    if (opening.kind === "windows") {
      const belowMesh = createWallSegmentMesh(wall, bounds, scale, startPercent, endPercent, 0, WINDOW_SILL_M);
      const aboveMesh = createWallSegmentMesh(
        wall,
        bounds,
        scale,
        startPercent,
        endPercent,
        WINDOW_SILL_M + WINDOW_HEIGHT_M,
        WALL_HEIGHT_M
      );
      if (belowMesh) {
        group.add(belowMesh);
      }
      if (aboveMesh) {
        group.add(aboveMesh);
      }
    } else {
      const headerMesh = createWallSegmentMesh(wall, bounds, scale, startPercent, endPercent, DOOR_HEIGHT_M, WALL_HEIGHT_M);
      if (headerMesh) {
        group.add(headerMesh);
      }
    }

    cursor = Math.max(cursor, endPercent);
  });

  const afterMesh = createWallSegmentMesh(wall, bounds, scale, cursor, 100, 0, WALL_HEIGHT_M);
  if (afterMesh) {
    group.add(afterMesh);
  }

  return group.children.length ? group : createWallSegmentMesh(wall, bounds, scale, 0, 100, 0, WALL_HEIGHT_M);
}

function createOpeningMesh(item, kind, bounds, scale) {
  const point = toWorldPoint({ x: item.x_percent, y: item.y_percent }, bounds, scale);
  const angle = (-clampNumber(item.rotation_deg) * Math.PI) / 180;
  const width = Math.max(
    0.4,
    ((clampNumber(item.width_percent, kind === "windows" ? 14 : 10)) / 100) * Math.min(scale.widthMeters, scale.depthMeters)
  );
  const height = kind === "windows" ? WINDOW_HEIGHT_M : DOOR_HEIGHT_M;
  const y = kind === "windows" ? WINDOW_SILL_M + height / 2 : height / 2;
  const depth = kind === "windows" ? WALL_THICKNESS_M * 0.55 : WALL_THICKNESS_M * 0.7;
  const color = kind === "windows" ? "#94cfff" : "#8b5e34";
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: kind === "windows",
    opacity: kind === "windows" ? 0.5 : 0.96,
    emissive: kind === "windows" ? "#bfeeff" : "#000000",
    emissiveIntensity: kind === "windows" ? 0.28 : 0,
    roughness: kind === "windows" ? 0.2 : 0.72,
    metalness: kind === "windows" ? 0.02 : 0
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(point.x, y, point.z);
  mesh.rotation.y = angle;
  mesh.castShadow = kind !== "windows";
  mesh.receiveShadow = true;
  return mesh;
}

function getInsideWallNormal(wall, bounds, scale) {
  const start = toWorldPoint({ x: wall.x1_percent, y: wall.y1_percent }, bounds, scale);
  const end = toWorldPoint({ x: wall.x2_percent, y: wall.y2_percent }, bounds, scale);
  const center = start.clone().add(end).multiplyScalar(0.5);
  const direction = end.clone().sub(start).setY(0).normalize();
  const normalA = new THREE.Vector3(-direction.z, 0, direction.x);
  const normalB = new THREE.Vector3(direction.z, 0, -direction.x);
  const towardRoom = new THREE.Vector3(-center.x, 0, -center.z).normalize();
  return normalA.dot(towardRoom) >= normalB.dot(towardRoom) ? normalA : normalB;
}

function createSunPatchGeometry(origin, rayDirection, width, length) {
  const tangent = new THREE.Vector3(-rayDirection.z, 0, rayDirection.x).normalize();
  const start = origin.clone().add(rayDirection.clone().multiplyScalar(0.22));
  const end = start.clone().add(rayDirection.clone().multiplyScalar(length));
  const halfWidth = width / 2;
  const vertices = new Float32Array([
    start.x - tangent.x * halfWidth, 0.035, start.z - tangent.z * halfWidth,
    start.x + tangent.x * halfWidth, 0.035, start.z + tangent.z * halfWidth,
    end.x + tangent.x * halfWidth * 0.68, 0.035, end.z + tangent.z * halfWidth * 0.68,
    end.x - tangent.x * halfWidth * 0.68, 0.035, end.z - tangent.z * halfWidth * 0.68
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function createWindowDaylightGroup(item, wall, bounds, scale, sun) {
  if (!wall || sun.daylight < 0.12) {
    return null;
  }

  const rayDirection = sun.sunPosition.clone().multiplyScalar(-1).setY(0);
  if (rayDirection.lengthSq() <= 0.0001) {
    return null;
  }
  rayDirection.normalize();

  const insideNormal = getInsideWallNormal(wall, bounds, scale);
  const exposure = clampRange(rayDirection.dot(insideNormal), 0, 1);
  if (exposure <= 0.08) {
    return null;
  }

  const windowPoint = toWorldPoint({ x: item.x_percent, y: item.y_percent }, bounds, scale);
  const width = Math.max(
    0.45,
    ((clampNumber(item.width_percent, 14)) / 100) * Math.min(scale.widthMeters, scale.depthMeters)
  );
  const length = clampRange(1.2 + exposure * sun.daylight * 5.2, 1.2, 6.2);
  const opacity = clampRange(0.06 + exposure * sun.daylight * sun.lightingStrength * 0.28, 0.04, 0.34);
  const group = new THREE.Group();

  const patch = new THREE.Mesh(
    createSunPatchGeometry(windowPoint, rayDirection, width * 1.35, length),
    new THREE.MeshBasicMaterial({
      color: sun.sunColor,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  patch.renderOrder = 4;
  group.add(patch);

  const glow = new THREE.PointLight(sun.sunColor, opacity * 4.8, Math.max(2, length * 1.35), 2);
  glow.position.set(
    windowPoint.x + insideNormal.x * 0.18,
    WINDOW_SILL_M + WINDOW_HEIGHT_M * 0.52,
    windowPoint.z + insideNormal.z * 0.18
  );
  group.add(glow);

  return group;
}

function createFurnitureMesh(item, bounds, scale) {
  const definition = getObjectDefinition(item.type);
  const footprint = objectFootprint(item);
  const worldPoints = footprint.map((point) => toWorldPoint(point, bounds, scale));
  const center = worldPoints.reduce(
    (acc, point) => ({ x: acc.x + point.x / worldPoints.length, z: acc.z + point.z / worldPoints.length }),
    { x: 0, z: 0 }
  );
  const dims = getScaledItemDimensions(item);
  const width = Math.max(0.25, dims.width_percent * scale.xScale);
  const depth = Math.max(0.25, dims.height_percent * scale.zScale);
  const height = OBJECT_HEIGHTS_M[item.type] || 0.85;
  const angle = (-clampNumber(item.rotation_deg) * Math.PI) / 180;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color: definition.tone,
    roughness: 0.86,
    metalness: 0.04
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center.x, height / 2, center.z);
  mesh.rotation.y = angle;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry?.dispose) {
      child.geometry.dispose();
    }
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else if (child.material?.dispose) {
      child.material.dispose();
    }
  });
}

function rotateCameraAroundTarget(camera, controls, deltaRadians) {
  if (!camera || !controls) {
    return;
  }

  const offset = camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaRadians);
  camera.position.copy(controls.target.clone().add(offset));
  camera.lookAt(controls.target);
  controls.update();
}

function zoomCamera(camera, controls, scaleDelta) {
  if (!camera || !controls) {
    return;
  }

  const offset = camera.position.clone().sub(controls.target);
  const nextLength = THREE.MathUtils.clamp(
    offset.length() * scaleDelta,
    controls.minDistance || 1,
    controls.maxDistance || 100
  );
  offset.setLength(nextLength);
  camera.position.copy(controls.target.clone().add(offset));
  camera.lookAt(controls.target);
  controls.update();
}

function orbitCamera(camera, controls, deltaX, deltaY) {
  if (!camera || !controls) {
    return;
  }

  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= deltaX * 0.01;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaY * 0.01, Math.PI / 5.5, Math.PI / 2.02);
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target.clone().add(offset));
  camera.lookAt(controls.target);
  controls.update();
}

function panCamera(camera, controls, deltaX, deltaY, viewportWidth, viewportHeight) {
  if (!camera || !controls) {
    return;
  }

  const offset = camera.position.clone().sub(controls.target);
  const targetDistance = Math.max(offset.length(), 1);
  const width = Math.max(viewportWidth || 1, 1);
  const height = Math.max(viewportHeight || 1, 1);
  const panScale = targetDistance * 0.85;
  const panX = (-deltaX / width) * panScale;
  const panY = (deltaY / height) * panScale;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).normalize();
  const up = camera.up.clone().normalize();
  const movement = right.multiplyScalar(panX).add(up.multiplyScalar(panY));

  camera.position.add(movement);
  controls.target.add(movement);
  camera.lookAt(controls.target);
  controls.update();
}

export default function FloorPlanPreview3D({ room }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [timeOfDay, setTimeOfDay] = useState(12);
  const [lightingStrength, setLightingStrength] = useState(1);
  const [webglStatus, setWebglStatus] = useState("idle");

  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const northDirection = Math.round(clampNumber(room?.north_direction_deg, 0));

  useEffect(() => {
    if (!mountRef.current || rendererRef.current) {
      return undefined;
    }

    let renderer;
    const width = mountRef.current.clientWidth || 600;
    const height = mountRef.current.clientHeight || 340;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.domElement.style.touchAction = "none";
      renderer.domElement.style.pointerEvents = "auto";
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mountRef.current.appendChild(renderer.domElement);
      setWebglStatus("ready");
    } catch (_error) {
      setWebglStatus("unavailable");
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / Math.max(height, 1), 0.1, 100);
    camera.position.set(7.5, 7.2, 7.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minDistance = 6;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minPolarAngle = Math.PI / 5;
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0.8, 0);
    controls.update();

    const handleContextMenu = (event) => event.preventDefault();
    renderer.domElement.addEventListener("contextmenu", handleContextMenu);

    let activePointer = null;

    const handlePointerDown = (event) => {
      renderer.domElement.setPointerCapture?.(event.pointerId);
      activePointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        mode: event.button === 2 || event.shiftKey ? "pan" : "orbit"
      };
      renderer.domElement.style.cursor = "grabbing";
      event.preventDefault();
    };

    const handlePointerMove = (event) => {
      if (!activePointer || event.pointerId !== activePointer.id) {
        return;
      }

      const deltaX = event.clientX - activePointer.x;
      const deltaY = event.clientY - activePointer.y;
      if (activePointer.mode === "pan") {
        panCamera(
          camera,
          controls,
          deltaX,
          deltaY,
          renderer.domElement.clientWidth,
          renderer.domElement.clientHeight
        );
      } else {
        orbitCamera(camera, controls, deltaX, deltaY);
      }

      activePointer.x = event.clientX;
      activePointer.y = event.clientY;
      renderer.render(sceneRef.current, cameraRef.current);
      event.preventDefault();
    };

    const clearPointer = (event) => {
      if (activePointer && event.pointerId === activePointer.id) {
        renderer.domElement.releasePointerCapture?.(event.pointerId);
        activePointer = null;
        renderer.domElement.style.cursor = "grab";
        event.preventDefault();
      }
    };

    const handleWheel = (event) => {
      zoomCamera(camera, controls, event.deltaY < 0 ? 0.92 : 1.08);
      renderer.render(sceneRef.current, cameraRef.current);
      event.preventDefault();
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", clearPointer);
    renderer.domElement.addEventListener("pointercancel", clearPointer);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    const renderFrame = () => {
      animationFrameRef.current = window.requestAnimationFrame(renderFrame);
      controls.update();
      renderer.render(sceneRef.current, cameraRef.current);
    };
    renderFrame();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) {
        return;
      }
      const nextWidth = mountRef.current.clientWidth || 600;
      const nextHeight = mountRef.current.clientHeight || 340;
      rendererRef.current.setSize(nextWidth, nextHeight);
      cameraRef.current.aspect = nextWidth / Math.max(nextHeight, 1);
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => handleResize())
        : null;
    resizeObserver?.observe(mountRef.current);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      controls.dispose();
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", clearPointer);
      renderer.domElement.removeEventListener("pointercancel", clearPointer);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      scene.traverse((child) => disposeObject(child));
      renderer.dispose();
      if (renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) {
      return;
    }

    const graph = normalizeWallGraph(room?.walls || []);
    const normalizedWalls = graph.walls.length ? graph.walls : Array.isArray(room?.walls) ? room.walls : [];
    const bounds = getWallBounds(normalizedWalls);
    const scale = getMetersScale(room, bounds);
    const sun = getSunState(timeOfDay, clampNumber(room?.north_direction_deg, 0), lightingStrength);
    const floorPoints = graph.outerPolygon?.length
      ? graph.outerPolygon
      : [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY }
        ];
    const objects = [
      ...(Array.isArray(room?.furniture) ? room.furniture : []),
      ...(Array.isArray(room?.desks) ? room.desks : [])
    ];
    const windowItems = Array.isArray(room?.windows) ? room.windows : [];
    const doorItems = Array.isArray(room?.doors) ? room.doors : [];
    const openings = [
      ...windowItems.map((item) => ({ kind: "windows", item })),
      ...doorItems.map((item) => ({ kind: "doors", item }))
    ];

    const scene = sceneRef.current;
    const previousRoot = scene.getObjectByName("room-root");
    if (previousRoot) {
      scene.remove(previousRoot);
      disposeObject(previousRoot);
    }

    scene.background = new THREE.Color(sun.background);
    scene.fog = new THREE.Fog(sun.fog, 10, 28);

    const root = new THREE.Group();
    root.name = "room-root";

    const ambient = new THREE.AmbientLight(0xffffff, sun.ambient);
    root.add(ambient);

    const keyLight = new THREE.DirectionalLight(sun.sunColor, sun.keyLight);
    keyLight.position.copy(sun.sunPosition);
    keyLight.target.position.set(0, 0, 0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 40;
    keyLight.shadow.camera.left = -Math.max(scale.widthMeters, scale.depthMeters) - 5;
    keyLight.shadow.camera.right = Math.max(scale.widthMeters, scale.depthMeters) + 5;
    keyLight.shadow.camera.top = Math.max(scale.widthMeters, scale.depthMeters) + 5;
    keyLight.shadow.camera.bottom = -Math.max(scale.widthMeters, scale.depthMeters) - 5;
    keyLight.shadow.bias = -0.00018;
    keyLight.shadow.normalBias = 0.035;
    root.add(keyLight);
    root.add(keyLight.target);

    const fillLight = new THREE.DirectionalLight("#f4f1ea", sun.fillLight);
    fillLight.position.set(-6, 5, -4);
    root.add(fillLight);

    root.add(createFloorMesh(floorPoints, bounds, scale, sun.floor));
    normalizedWalls.forEach((wall, wallIndex) => {
      const wallMesh = createWallMesh(wall, wallIndex, bounds, scale, openings);
      if (wallMesh) {
        root.add(wallMesh);
      }
    });
    windowItems.forEach((windowItem) => {
      const daylight = createWindowDaylightGroup(
        windowItem,
        normalizedWalls[Number(windowItem?.wall_index)],
        bounds,
        scale,
        sun
      );
      if (daylight) {
        root.add(daylight);
      }
      root.add(createOpeningMesh(windowItem, "windows", bounds, scale));
    });
    doorItems.forEach((doorItem) => root.add(createOpeningMesh(doorItem, "doors", bounds, scale)));
    objects.forEach((item) => root.add(createFurnitureMesh(item, bounds, scale)));

    const gridSize = Math.max(scale.widthMeters, scale.depthMeters) + 6;
    const divisions = Math.max(8, Math.round(gridSize / 0.5));
    const grid = new THREE.GridHelper(gridSize, divisions, "#b29f7c", "#ccbca0");
    grid.position.y = 0.01;
    root.add(grid);

    scene.add(root);

    cameraRef.current.position.set(7.5, 7.2, 7.5);
    controlsRef.current.target.set(0, 0.8, 0);
    controlsRef.current.update();
    rendererRef.current?.render(scene, cameraRef.current);
  }, [room, timeOfDay, lightingStrength]);

  function rotateView(deltaDegrees) {
    rotateCameraAroundTarget(
      cameraRef.current,
      controlsRef.current,
      (deltaDegrees * Math.PI) / 180
    );
    rendererRef.current?.render(sceneRef.current, cameraRef.current);
  }

  function zoomView(scaleDelta) {
    zoomCamera(cameraRef.current, controlsRef.current, scaleDelta);
    rendererRef.current?.render(sceneRef.current, cameraRef.current);
  }

  function resetView() {
    if (!cameraRef.current || !controlsRef.current) {
      return;
    }
    cameraRef.current.position.set(7.5, 7.2, 7.5);
    controlsRef.current.target.set(0, 0.8, 0);
    controlsRef.current.update();
    rendererRef.current?.render(sceneRef.current, cameraRef.current);
  }

  return (
    <div className="panel-card preview3d-card">
      <div className="score-topline">
        <div>
          <p className="upload-kicker">Preview</p>
          <h2>3D room beta</h2>
        </div>
        <div className="preview3d-badge">Orbit</div>
      </div>
      <p className="preview3d-copy">
        This now uses a real 3D scene. Drag to orbit, scroll to zoom, and use the edited plan as the source of truth.
      </p>
      <div className="preview3d-toolbar">
        <label className="preview3d-slider">
          <span>
            Time of day
            <strong>{timeOfDay}:00</strong>
          </span>
          <input
            type="range"
            min="6"
            max="20"
            step="1"
            value={timeOfDay}
            onChange={(event) => setTimeOfDay(Number(event.target.value))}
          />
        </label>
        <label className="preview3d-slider">
          <span>
            Light strength
            <strong>{Math.round(lightingStrength * 100)}%</strong>
          </span>
          <input
            type="range"
            min="0.2"
            max="1.6"
            step="0.05"
            value={lightingStrength}
            onChange={(event) => setLightingStrength(Number(event.target.value))}
          />
        </label>
        <div className="preview3d-presets" role="group" aria-label="Choose a time of day preset">
          {TIME_OF_DAY_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`preview3d-preset${timeOfDay === preset.value ? " is-active" : ""}`}
              onClick={() => setTimeOfDay(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="preview3d-controls" role="group" aria-label="Adjust 3D camera">
          <button type="button" className="preview3d-preset" onClick={() => rotateView(-15)}>
            Rotate Left
          </button>
          <button type="button" className="preview3d-preset" onClick={() => rotateView(15)}>
            Rotate Right
          </button>
          <button type="button" className="preview3d-preset" onClick={() => zoomView(0.88)}>
            Zoom In
          </button>
          <button type="button" className="preview3d-preset" onClick={() => zoomView(1.14)}>
            Zoom Out
          </button>
          <button type="button" className="preview3d-preset" onClick={resetView}>
            Reset View
          </button>
        </div>
        <div className="preview3d-meta">
          <span>North {northDirection} deg</span>
          <span>Drag to orbit</span>
        </div>
      </div>
      <div className="preview3d-shell" aria-label="3D preview of the current floor plan">
        {walls.length && webglStatus !== "unavailable" ? (
          <div ref={mountRef} className="preview3d-canvas" />
        ) : walls.length ? (
          <div className="preview3d-empty">3D preview could not start on this browser session. Refresh once and try again.</div>
        ) : (
          <div className="preview3d-empty">Add or detect some walls first to build the 3D room.</div>
        )}
      </div>
    </div>
  );
}
