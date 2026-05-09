import base64
import io
import os
from typing import Dict, List, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image


SUPPORTED_TYPES = {
    "desk": "desk",
    "workstation": "desk",
    "table": "table",
    "dining table": "meeting_table",
    "chair": "chair",
    "couch": "armchair",
    "sofa": "armchair",
    "potted plant": "plant",
    "plant": "plant",
    "toilet": "toilet",
    "sink": "sink",
    "shower": "shower",
    "bathtub": "shower",
}

MAX_ANALYSIS_DIMENSION = 1600
SEGMENTATION_IMAGE_SIZE = 768
WALL_CONNECTION_TOLERANCE_PERCENT = 4.0
WINDOW_GAP_MIN_RATIO = 0.08
WINDOW_GAP_MAX_RATIO = 0.35
WINDOW_SCAN_HALF_THICKNESS = 3
MIN_OBJECT_CANDIDATE_AREA_RATIO = 0.0004
MAX_OBJECT_CANDIDATE_AREA_RATIO = 0.08


class AnalysePayload(BaseModel):
    image: str


app = FastAPI(title="WorkspaceIQ CV Worker")
_SEGMENTATION_MODEL = None


def segmentation_mode() -> str:
    mode = os.environ.get("CV_SEGMENTATION_MODE", "auto").strip().lower()
    if mode in {"off", "always", "auto"}:
        return mode
    return "auto"


def clamp_percent(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


def clamp_angle(value: float) -> float:
    return float(value % 360.0)


def normalize_point(x: float, y: float, room_rect: Tuple[int, int, int, int]) -> Dict:
    rx, ry, rw, rh = room_rect
    return {
        "x_percent": clamp_percent(((x - rx) / max(rw, 1)) * 100),
        "y_percent": clamp_percent(((y - ry) / max(rh, 1)) * 100),
    }


def rect_hugs_image_border(rect: Tuple[int, int, int, int], image_shape: Tuple[int, int, int]) -> bool:
    x, y, w, h = rect
    image_h, image_w = image_shape[:2]
    margin = max(3, int(min(image_w, image_h) * 0.015))
    area_ratio = (w * h) / max(image_w * image_h, 1)

    return (
        area_ratio >= 0.92
        and x <= margin
        and y <= margin
        and x + w >= image_w - margin
        and y + h >= image_h - margin
    )


def decode_image(data_url: str) -> np.ndarray:
    if not data_url or "," not in data_url:
        raise ValueError("Expected image as a data URL.")

    encoded = data_url.split(",", 1)[1]
    image_bytes = base64.b64decode(encoded)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def scale_image_for_analysis(image: np.ndarray, max_dimension: int = MAX_ANALYSIS_DIMENSION) -> np.ndarray:
    image_h, image_w = image.shape[:2]
    longest_side = max(image_h, image_w)
    if longest_side <= max_dimension:
        return image

    scale = max_dimension / float(longest_side)
    return cv2.resize(
        image,
        (max(1, int(round(image_w * scale))), max(1, int(round(image_h * scale)))),
        interpolation=cv2.INTER_AREA,
    )


def choose_room_contour(image: np.ndarray) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 60, 160)
    kernel = np.ones((5, 5), np.uint8)
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    image_area = image.shape[0] * image.shape[1]
    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < image_area * 0.1:
            continue
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.015 * perimeter, True)
        x, y, w, h = cv2.boundingRect(approx)
        if rect_hugs_image_border((x, y, w, h), image.shape):
            continue
        candidates.append((area, approx, (x, y, w, h)))

    if not candidates:
        h, w = image.shape[:2]
        contour = np.array([[[0, 0]], [[w, 0]], [[w, h]], [[0, h]]], dtype=np.int32)
        return contour, (0, 0, w, h)

    _, best_contour, room_rect = max(candidates, key=lambda item: item[0])
    return best_contour, room_rect


def contour_to_walls(contour: np.ndarray, room_rect: Tuple[int, int, int, int]) -> List[Dict]:
    points = contour.reshape(-1, 2).tolist()
    if len(points) < 3:
        rx, ry, rw, rh = room_rect
        points = [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]]

    walls = []
    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        start = normalize_point(point[0], point[1], room_rect)
        end = normalize_point(next_point[0], next_point[1], room_rect)
        walls.append({
            "x1_percent": start["x_percent"],
            "y1_percent": start["y_percent"],
            "x2_percent": end["x_percent"],
            "y2_percent": end["y_percent"],
        })
    return walls


def segment_length(segment: Dict) -> float:
    return ((segment["x2_percent"] - segment["x1_percent"]) ** 2 + (segment["y2_percent"] - segment["y1_percent"]) ** 2) ** 0.5


def orientation_for_line(x1: int, y1: int, x2: int, y2: int) -> str:
    return "horizontal" if abs(x2 - x1) >= abs(y2 - y1) else "vertical"


def mask_rectangles(mask: np.ndarray, room_rect: Tuple[int, int, int, int], blocked_rects: List[Tuple[float, float, float, float]]) -> np.ndarray:
    if not blocked_rects:
        return mask

    rx, ry, _, _ = room_rect
    padded = mask.copy()
    for x1, y1, x2, y2 in blocked_rects:
        local_x1 = max(0, int(round(x1 - rx - 6)))
        local_y1 = max(0, int(round(y1 - ry - 6)))
        local_x2 = min(mask.shape[1], int(round(x2 - rx + 6)))
        local_y2 = min(mask.shape[0], int(round(y2 - ry + 6)))
        if local_x2 > local_x1 and local_y2 > local_y1:
            padded[local_y1:local_y2, local_x1:local_x2] = 0
    return padded


def midpoint(segment: Dict) -> Tuple[float, float]:
    return (
        (segment["x1_percent"] + segment["x2_percent"]) / 2.0,
        (segment["y1_percent"] + segment["y2_percent"]) / 2.0,
    )


def point_inside_rect(point: Tuple[float, float], rect: Tuple[float, float, float, float], padding: float = 0.0) -> bool:
    x, y = point
    x1, y1, x2, y2 = rect
    return (x1 - padding) <= x <= (x2 + padding) and (y1 - padding) <= y <= (y2 + padding)


def point_on_segment(point: Tuple[float, float], segment: Dict, tolerance: float = 1.8) -> bool:
    px, py = point
    x1, y1, x2, y2 = (
        segment["x1_percent"],
        segment["y1_percent"],
        segment["x2_percent"],
        segment["y2_percent"],
    )
    cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1)
    if abs(cross) > tolerance:
        return False

    dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)
    if dot < -tolerance:
        return False

    squared_length = (x2 - x1) ** 2 + (y2 - y1) ** 2
    return dot <= squared_length + tolerance


def wall_near_border(segment: Dict, tolerance: float = 3.0) -> bool:
    return (
        abs(segment["x1_percent"]) <= tolerance
        and abs(segment["x2_percent"]) <= tolerance
        or abs(segment["x1_percent"] - 100.0) <= tolerance
        and abs(segment["x2_percent"] - 100.0) <= tolerance
        or abs(segment["y1_percent"]) <= tolerance
        and abs(segment["y2_percent"]) <= tolerance
        or abs(segment["y1_percent"] - 100.0) <= tolerance
        and abs(segment["y2_percent"] - 100.0) <= tolerance
    )


def wall_connection_score(segment: Dict, walls: List[Dict], tolerance: float = WALL_CONNECTION_TOLERANCE_PERCENT) -> int:
    endpoints = [
        (segment["x1_percent"], segment["y1_percent"]),
        (segment["x2_percent"], segment["y2_percent"]),
    ]
    score = 0

    for endpoint in endpoints:
        connected = False
        for candidate in walls:
            if candidate is segment:
                continue
            candidate_endpoints = [
                (candidate["x1_percent"], candidate["y1_percent"]),
                (candidate["x2_percent"], candidate["y2_percent"]),
            ]
            if any(np.hypot(endpoint[0] - other[0], endpoint[1] - other[1]) <= tolerance for other in candidate_endpoints):
                connected = True
                break
            if point_on_segment(endpoint, candidate, tolerance):
                connected = True
                break
        if connected:
            score += 1

    return score


def filter_structural_walls(walls: List[Dict], room_rect: Tuple[int, int, int, int], blocked_rects: List[Tuple[float, float, float, float]]) -> List[Dict]:
    if not walls:
        return []

    rx, ry, rw, rh = room_rect
    blocked_percent_rects = []
    for x1, y1, x2, y2 in blocked_rects or []:
        blocked_percent_rects.append(
            (
                clamp_percent(((x1 - rx) / max(rw, 1)) * 100),
                clamp_percent(((y1 - ry) / max(rh, 1)) * 100),
                clamp_percent(((x2 - rx) / max(rw, 1)) * 100),
                clamp_percent(((y2 - ry) / max(rh, 1)) * 100),
            )
        )

    filtered: List[Dict] = []
    for wall in walls:
        length = segment_length(wall)
        if length < 10:
            continue

        wall_midpoint = midpoint(wall)
        if any(point_inside_rect(wall_midpoint, rect, 3.5) for rect in blocked_percent_rects):
            continue

        connection_score = wall_connection_score(wall, walls)
        if wall_near_border(wall) or connection_score >= 2 or (length >= 22 and connection_score >= 1):
            filtered.append(wall)

    return filtered


def build_room_features(room_crop: np.ndarray) -> Dict[str, np.ndarray]:
    gray = cv2.cvtColor(room_crop, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 7
    )
    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (max(12, room_crop.shape[1] // 18), 1)
    )
    vertical_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (1, max(12, room_crop.shape[0] // 18))
    )
    horizontal = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horizontal_kernel, iterations=1)
    vertical = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vertical_kernel, iterations=1)
    wall_map = cv2.bitwise_or(horizontal, vertical)

    return {
        "gray": gray,
        "thresh": thresh,
        "wall_map": wall_map,
    }


def merge_axis_aligned_segments(segments: List[Tuple[int, int, int]], axis: str, room_rect: Tuple[int, int, int, int]) -> List[Dict]:
    if not segments:
        return []

    proximity = 8
    gap_tolerance = 12
    sorted_segments = sorted(segments, key=lambda item: (item[0], item[1], item[2]))
    groups: List[List[Tuple[int, int, int]]] = []

    for segment in sorted_segments:
        coordinate, start, end = segment
        placed = False
        for group in groups:
            group_coordinate = int(round(sum(item[0] for item in group) / len(group)))
            group_start = min(item[1] for item in group)
            group_end = max(item[2] for item in group)
            if abs(coordinate - group_coordinate) <= proximity and start <= group_end + gap_tolerance and end >= group_start - gap_tolerance:
                group.append(segment)
                placed = True
                break
        if not placed:
            groups.append([segment])

    walls = []
    rx, ry, _, _ = room_rect
    for group in groups:
        coordinate = int(round(sum(item[0] for item in group) / len(group)))
        start = min(item[1] for item in group)
        end = max(item[2] for item in group)

        if axis == "horizontal":
            start_point = normalize_point(rx + start, ry + coordinate, room_rect)
            end_point = normalize_point(rx + end, ry + coordinate, room_rect)
        else:
            start_point = normalize_point(rx + coordinate, ry + start, room_rect)
            end_point = normalize_point(rx + coordinate, ry + end, room_rect)

        wall = {
            "x1_percent": start_point["x_percent"],
            "y1_percent": start_point["y_percent"],
            "x2_percent": end_point["x_percent"],
            "y2_percent": end_point["y_percent"],
        }

        if segment_length(wall) >= 10:
            walls.append(wall)

    return walls


def detect_wall_segments(
    image: np.ndarray,
    room_rect: Tuple[int, int, int, int],
    blocked_rects: List[Tuple[float, float, float, float]] = None,
    room_features: Dict[str, np.ndarray] = None,
) -> List[Dict]:
    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0:
        return []

    features = room_features or build_room_features(room_crop)
    wall_map = features["wall_map"]
    wall_map = mask_rectangles(wall_map, room_rect, blocked_rects or [])

    min_length = max(24, min(rw, rh) // 8)
    raw_lines = cv2.HoughLinesP(wall_map, 1, np.pi / 180, threshold=50, minLineLength=min_length, maxLineGap=max(10, min_length // 3))
    if raw_lines is None:
        return []

    horizontal_segments = []
    vertical_segments = []
    for line in raw_lines[:, 0]:
        x1, y1, x2, y2 = [int(value) for value in line.tolist()]
        if orientation_for_line(x1, y1, x2, y2) == "horizontal":
            y = int(round((y1 + y2) / 2))
            x_start, x_end = sorted([x1, x2])
            horizontal_segments.append((y, x_start, x_end))
        else:
            x = int(round((x1 + x2) / 2))
            y_start, y_end = sorted([y1, y2])
            vertical_segments.append((x, y_start, y_end))

    merged = merge_axis_aligned_segments(horizontal_segments, "horizontal", room_rect) + merge_axis_aligned_segments(vertical_segments, "vertical", room_rect)
    return filter_structural_walls(merged, room_rect, blocked_rects or [])


def dedupe_walls(walls: List[Dict]) -> List[Dict]:
    unique: List[Dict] = []
    for wall in sorted(walls, key=segment_length, reverse=True):
        duplicate = False
        for existing in unique:
            same_direction = (
                abs(wall["x1_percent"] - existing["x1_percent"]) <= 2
                and abs(wall["y1_percent"] - existing["y1_percent"]) <= 2
                and abs(wall["x2_percent"] - existing["x2_percent"]) <= 2
                and abs(wall["y2_percent"] - existing["y2_percent"]) <= 2
            )
            reverse_direction = (
                abs(wall["x1_percent"] - existing["x2_percent"]) <= 2
                and abs(wall["y1_percent"] - existing["y2_percent"]) <= 2
                and abs(wall["x2_percent"] - existing["x1_percent"]) <= 2
                and abs(wall["y2_percent"] - existing["y1_percent"]) <= 2
            )
            if same_direction or reverse_direction:
                duplicate = True
                break
        if not duplicate:
            unique.append(wall)
    return unique


def maybe_load_segmentation_model():
    if segmentation_mode() == "off":
        return None

    global _SEGMENTATION_MODEL
    if _SEGMENTATION_MODEL is not None:
        return _SEGMENTATION_MODEL

    model_name = os.environ.get("CV_SEGMENTATION_MODEL", "yolov8n-seg.pt").strip()
    try:
        from ultralytics import YOLO
        _SEGMENTATION_MODEL = YOLO(model_name)
        return _SEGMENTATION_MODEL
    except Exception:
        _SEGMENTATION_MODEL = False
        return None


def build_object_candidate_mask(room_crop: np.ndarray, room_features: Dict[str, np.ndarray] = None) -> np.ndarray:
    features = room_features or build_room_features(room_crop)
    blob_mask = cv2.subtract(features["thresh"], features["wall_map"])
    blob_mask = cv2.morphologyEx(
        blob_mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
        iterations=1,
    )
    blob_mask = cv2.morphologyEx(
        blob_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
        iterations=1,
    )
    return blob_mask


def count_object_like_regions(room_crop: np.ndarray, room_features: Dict[str, np.ndarray] = None) -> int:
    if room_crop.size == 0:
        return 0

    blob_mask = build_object_candidate_mask(room_crop, room_features)
    contours, _ = cv2.findContours(blob_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    room_area = max(room_crop.shape[0] * room_crop.shape[1], 1)
    count = 0

    for contour in contours:
        area = cv2.contourArea(contour)
        area_ratio = area / room_area
        if area_ratio < MIN_OBJECT_CANDIDATE_AREA_RATIO or area_ratio > MAX_OBJECT_CANDIDATE_AREA_RATIO:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        if x <= 1 or y <= 1 or x + w >= room_crop.shape[1] - 1 or y + h >= room_crop.shape[0] - 1:
            continue
        if min(w, h) < 8:
            continue

        aspect_ratio = max(w, h) / max(min(w, h), 1)
        if aspect_ratio > 4.5:
            continue

        count += 1

    return count


def should_run_segmentation(room_crop: np.ndarray, walls: List[Dict], room_features: Dict[str, np.ndarray] = None) -> bool:
    mode = segmentation_mode()
    if mode == "off":
        return False
    if mode == "always":
        return True
    if room_crop.size == 0:
        return False

    image_h, image_w = room_crop.shape[:2]
    if min(image_h, image_w) < 120:
        return False

    candidate_count = count_object_like_regions(room_crop, room_features)
    if candidate_count >= 1:
        return True

    # On sparse plan-like drawings with clean wall evidence, skip the model.
    return len(walls) < 4


def polygon_area(points: np.ndarray) -> float:
    contour = points.astype(np.float32).reshape(-1, 1, 2)
    return float(abs(cv2.contourArea(contour)))


def rotation_from_points(points: np.ndarray, bbox: Tuple[float, float, float, float]) -> float:
    if points.size >= 6:
        rect = cv2.minAreaRect(points.astype(np.float32))
        (_, _), (width, height), angle = rect
        if width < height:
            angle += 90.0
        return clamp_angle(angle)

    x1, y1, x2, y2 = bbox
    return 0.0 if (x2 - x1) >= (y2 - y1) else 90.0


def infer_object_type(base_type: str, contour_points: np.ndarray, bbox: Tuple[float, float, float, float]) -> str:
    if base_type != "desk" or contour_points.size < 6:
        return base_type

    x1, y1, x2, y2 = bbox
    bbox_area = max(1.0, (x2 - x1) * (y2 - y1))
    fill_ratio = polygon_area(contour_points) / bbox_area
    hull = cv2.convexHull(contour_points.astype(np.float32))
    hull_area = max(1.0, polygon_area(hull.reshape(-1, 2)))
    concavity_ratio = polygon_area(contour_points) / hull_area

    if fill_ratio <= 0.82 and concavity_ratio <= 0.92:
        return "l_shaped_desk"

    return base_type


def polygon_points_from_mask(mask: np.ndarray, bbox: Tuple[float, float, float, float]) -> List[Dict]:
    x1, y1, x2, y2 = bbox
    width = max(1.0, x2 - x1)
    height = max(1.0, y2 - y1)
    contour = mask.astype(np.int32)
    if contour.ndim == 3:
        contour = contour.reshape(-1, 2)

    points = []
    for x, y in contour.tolist():
        local_x = ((x - x1) / width) * 100 - 50
        local_y = ((y - y1) / height) * 100 - 50
        points.append({
            "x_percent": max(-50.0, min(50.0, float(local_x))),
            "y_percent": max(-50.0, min(50.0, float(local_y))),
        })
    return points[:24]


def detect_objects_with_segmentation(model, image: np.ndarray, room_rect: Tuple[int, int, int, int]) -> Tuple[List[Dict], List[Tuple[float, float, float, float]]]:
    if model is None:
        return [], []

    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0:
        return [], []

    try:
        result = model.predict(room_crop, verbose=False, conf=0.2, imgsz=SEGMENTATION_IMAGE_SIZE)[0]
    except Exception:
        return [], []

    names = result.names if hasattr(result, "names") else {}
    masks = result.masks.xy if getattr(result, "masks", None) is not None else []
    boxes = result.boxes
    if boxes is None:
        return [], []

    objects = []
    blocked_rects: List[Tuple[float, float, float, float]] = []
    for index, box in enumerate(boxes):
        cls_index = int(box.cls[0].item())
        label = names.get(cls_index, "").lower()
        base_type = SUPPORTED_TYPES.get(label)
        if not base_type:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2
        contour_points = np.array(masks[index]) if index < len(masks) and len(masks[index]) >= 3 else np.empty((0, 2), dtype=np.float32)
        object_type = infer_object_type(base_type, contour_points, (x1, y1, x2, y2))
        shape_kind = "polygon" if contour_points.size >= 6 else "rect"
        item = {
            "type": object_type,
            "shape_kind": shape_kind,
            "x_percent": clamp_percent((center_x / max(rw, 1)) * 100),
            "y_percent": clamp_percent((center_y / max(rh, 1)) * 100),
            "width_percent": clamp_percent(((x2 - x1) / max(rw, 1)) * 100),
            "height_percent": clamp_percent(((y2 - y1) / max(rh, 1)) * 100),
            "rotation_deg": rotation_from_points(contour_points, (x1, y1, x2, y2)),
        }
        if shape_kind == "polygon":
            item["footprint_points"] = polygon_points_from_mask(contour_points, (x1, y1, x2, y2))
        objects.append(item)
        blocked_rects.append((rx + x1, ry + y1, rx + x2, ry + y2))
    return objects, blocked_rects


def dedupe_openings(openings: List[Dict], position_tolerance: float = 7.0) -> List[Dict]:
    unique: List[Dict] = []
    for opening in openings:
        duplicate = False
        for existing in unique:
            if existing["wall_index"] != opening["wall_index"]:
                continue
            if abs(existing["position_percent"] - opening["position_percent"]) <= position_tolerance:
                duplicate = True
                break
        if not duplicate:
            unique.append(opening)
    return unique


def project_point_to_wall_percent(point: Tuple[float, float], wall: Dict) -> Tuple[float, float]:
    ax, ay = wall["x1_percent"], wall["y1_percent"]
    bx, by = wall["x2_percent"], wall["y2_percent"]
    abx = bx - ax
    aby = by - ay
    denominator = abx * abx + aby * aby
    if denominator <= 0.0001:
        return 50.0, float(np.hypot(point[0] - ax, point[1] - ay))

    raw_t = ((point[0] - ax) * abx + (point[1] - ay) * aby) / denominator
    t = max(0.0, min(1.0, raw_t))
    projected = (ax + abx * t, ay + aby * t)
    return t * 100.0, float(np.hypot(point[0] - projected[0], point[1] - projected[1]))


def detect_door_openings(image: np.ndarray, room_rect: Tuple[int, int, int, int], walls: List[Dict], blocked_rects: List[Tuple[float, float, float, float]]) -> List[Dict]:
    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0 or not walls:
        return []

    gray = cv2.cvtColor(room_crop, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 1.4)
    edges = cv2.Canny(blurred, 50, 130)
    edges = mask_rectangles(edges, room_rect, blocked_rects or [])
    min_radius = max(8, int(min(rw, rh) * 0.03))
    max_radius = max(min_radius + 4, int(min(rw, rh) * 0.14))
    circles = cv2.HoughCircles(
        edges,
        cv2.HOUGH_GRADIENT,
        dp=1.1,
        minDist=max(18, min_radius * 2),
        param1=120,
        param2=10,
        minRadius=min_radius,
        maxRadius=max_radius,
    )
    if circles is None:
        return []

    doors = []
    for circle in circles[0]:
        local_x, local_y, _radius = [float(value) for value in circle.tolist()]
        point = (
            clamp_percent((local_x / max(rw, 1)) * 100),
            clamp_percent((local_y / max(rh, 1)) * 100),
        )

        best = None
        for wall_index, wall in enumerate(walls):
            position_percent, distance = project_point_to_wall_percent(point, wall)
            if distance > 4.5:
                continue
            candidate = {
                "wall_index": wall_index,
                "position_percent": clamp_percent(position_percent),
                "distance": distance,
            }
            if best is None or candidate["distance"] < best["distance"]:
                best = candidate

        if best is not None:
            doors.append({
                "wall_index": best["wall_index"],
                "position_percent": round(best["position_percent"], 2),
            })

    return dedupe_openings(doors, 10.0)


def sample_wall_gap_runs(wall_map: np.ndarray, wall: Dict) -> List[Tuple[float, float]]:
    axis = orientation_for_line(
        int(round(wall["x1_percent"])),
        int(round(wall["y1_percent"])),
        int(round(wall["x2_percent"])),
        int(round(wall["y2_percent"])),
    )
    image_h, image_w = wall_map.shape[:2]
    values = []

    if axis == "horizontal":
        y = int(round(((wall["y1_percent"] + wall["y2_percent"]) / 2) / 100 * max(image_h - 1, 1)))
        x1 = int(round(min(wall["x1_percent"], wall["x2_percent"]) / 100 * max(image_w - 1, 1)))
        x2 = int(round(max(wall["x1_percent"], wall["x2_percent"]) / 100 * max(image_w - 1, 1)))
        strip = wall_map[max(0, y - WINDOW_SCAN_HALF_THICKNESS): min(image_h, y + WINDOW_SCAN_HALF_THICKNESS + 1), x1:x2 + 1]
        if strip.size == 0:
            return []
        values = strip.mean(axis=0)
    else:
        x = int(round(((wall["x1_percent"] + wall["x2_percent"]) / 2) / 100 * max(image_w - 1, 1)))
        y1 = int(round(min(wall["y1_percent"], wall["y2_percent"]) / 100 * max(image_h - 1, 1)))
        y2 = int(round(max(wall["y1_percent"], wall["y2_percent"]) / 100 * max(image_h - 1, 1)))
        strip = wall_map[y1:y2 + 1, max(0, x - WINDOW_SCAN_HALF_THICKNESS): min(image_w, x + WINDOW_SCAN_HALF_THICKNESS + 1)]
        if strip.size == 0:
            return []
        values = strip.mean(axis=1)

    if len(values) < 12:
        return []

    threshold = max(18.0, float(np.percentile(values, 30)))
    gaps: List[Tuple[float, float]] = []
    run_start = None
    for index, value in enumerate(values):
        is_gap = value <= threshold
        if is_gap and run_start is None:
            run_start = index
        elif not is_gap and run_start is not None:
            gaps.append((run_start, index - 1))
            run_start = None
    if run_start is not None:
        gaps.append((run_start, len(values) - 1))

    wall_length = len(values)
    normalized = []
    for start, end in gaps:
        run_length_ratio = (end - start + 1) / max(wall_length, 1)
        if run_length_ratio < WINDOW_GAP_MIN_RATIO or run_length_ratio > WINDOW_GAP_MAX_RATIO:
            continue
        normalized.append(((start / wall_length) * 100.0, (end / wall_length) * 100.0))
    return normalized


def detect_window_openings(
    image: np.ndarray,
    room_rect: Tuple[int, int, int, int],
    walls: List[Dict],
    doors: List[Dict],
    blocked_rects: List[Tuple[float, float, float, float]],
    room_features: Dict[str, np.ndarray] = None,
) -> List[Dict]:
    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0 or not walls:
        return []

    features = room_features or build_room_features(room_crop)
    wall_map = mask_rectangles(features["thresh"], room_rect, blocked_rects or [])
    door_positions = {(door["wall_index"], int(round(door["position_percent"] / 5))) for door in doors}
    windows = []

    for wall_index, wall in enumerate(walls):
        if not wall_near_border(wall):
            continue

        for start_percent, end_percent in sample_wall_gap_runs(wall_map, wall):
            position_percent = round((start_percent + end_percent) / 2.0, 2)
            if (wall_index, int(round(position_percent / 5))) in door_positions:
                continue
            windows.append({
                "wall_index": wall_index,
                "position_percent": position_percent,
            })

    return dedupe_openings(windows, 8.0)


def build_response(image: np.ndarray) -> Dict:
    image = scale_image_for_analysis(image)
    contour, room_rect = choose_room_contour(image)
    room_crop = image[room_rect[1]:room_rect[1] + room_rect[3], room_rect[0]:room_rect[0] + room_rect[2]]
    room_features = build_room_features(room_crop) if room_crop.size != 0 else None
    detected_walls = detect_wall_segments(image, room_rect, [], room_features)
    contour_walls = contour_to_walls(contour, room_rect)
    walls = dedupe_walls(detected_walls if len(detected_walls) >= 4 else contour_walls + detected_walls)
    furniture = []
    blocked_rects: List[Tuple[float, float, float, float]] = []

    if should_run_segmentation(room_crop, walls, room_features):
        model = maybe_load_segmentation_model()
        if model is not None:
            furniture, blocked_rects = detect_objects_with_segmentation(model, image, room_rect)
            if blocked_rects:
                refined_walls = detect_wall_segments(image, room_rect, blocked_rects, room_features)
                if refined_walls:
                    walls = dedupe_walls(refined_walls if len(refined_walls) >= 4 else walls + refined_walls)

    doors = detect_door_openings(image, room_rect, walls, blocked_rects)
    windows = detect_window_openings(image, room_rect, walls, doors, blocked_rects, room_features)
    _, _, rw, rh = room_rect

    return {
        "is_valid_room": True,
        "rejection_reason": "",
        "estimated_width_m": 8.0,
        "estimated_height_m": max(3.0, round(8.0 * (rh / max(rw, 1)), 1)),
        "walls": walls,
        "windows": windows,
        "doors": doors,
        "furniture": furniture,
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "workspaceiq-cv-worker"}


@app.post("/")
@app.post("/analyse-room")
def analyse_room(payload: AnalysePayload):
    try:
        image = decode_image(payload.image)
        return build_response(image)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
