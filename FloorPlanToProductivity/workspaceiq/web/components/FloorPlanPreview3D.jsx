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

function getSunState(timeOfDay, northDirectionDeg) {
  const daylight = clampRange(Math.sin(((timeOfDay - 6) / 12) * Math.PI), 0, 1);
  const duskBlend = clampRange(1 - daylight, 0, 1);
  const nightBlend = clampRange((8 - timeOfDay) / 4, 0, 1) + clampRange((timeOfDay - 18) / 4, 0, 1);
  const azimuthDeg = northDirectionDeg + 90 + ((timeOfDay - 6) / 12) * 180;
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const distance = 12;
  const elevation = 1.2 + daylight * 8.4;

  return {
    ambient: 0.12 + daylight * 0.9,
    keyLight: 0.06 + daylight * 1.85,
    fillLight: 0.04 + daylight * 0.52,
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

function createWallMesh(wall, bounds, scale) {
  const start = toWorldPoint({ x: wall.x1_percent, y: wall.y1_percent }, bounds, scale);
  const end = toWorldPoint({ x: wall.x2_percent, y: wall.y2_percent }, bounds, scale);
  const center = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);
  const angle = Math.atan2(end.z - start.z, end.x - start.x);
  const geometry = new THREE.BoxGeometry(length, WALL_HEIGHT_M, WALL_THICKNESS_M);
  const material = new THREE.MeshStandardMaterial({ color: "#d1c1a6", roughness: 0.92 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center.x, WALL_HEIGHT_M / 2, center.z);
  mesh.rotation.y = -angle;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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
    opacity: kind === "windows" ? 0.58 : 0.96
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(point.x, y, point.z);
  mesh.rotation.y = angle;
  return mesh;
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

export default function FloorPlanPreview3D({ room }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [timeOfDay, setTimeOfDay] = useState(12);
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
    controls.enableRotate = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.minDistance = 6;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minPolarAngle = Math.PI / 5;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.8, 0);
    controls.update();

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
    const sun = getSunState(timeOfDay, clampNumber(room?.north_direction_deg, 0));
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
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    root.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#f4f1ea", sun.fillLight);
    fillLight.position.set(-6, 5, -4);
    root.add(fillLight);

    root.add(createFloorMesh(floorPoints, bounds, scale, sun.floor));
    normalizedWalls.forEach((wall) => root.add(createWallMesh(wall, bounds, scale)));
    (room?.windows || []).forEach((windowItem) => root.add(createOpeningMesh(windowItem, "windows", bounds, scale)));
    (room?.doors || []).forEach((doorItem) => root.add(createOpeningMesh(doorItem, "doors", bounds, scale)));
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
  }, [room, timeOfDay]);

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
