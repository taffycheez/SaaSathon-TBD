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
    "couch": "couch",
    "sofa": "couch",
    "potted plant": "plant",
    "plant": "plant",
    "toilet": "toilet",
    "sink": "sink",
    "shower": "shower",
    "bathtub": "shower",
    "refrigerator": "fridge",
    "fridge": "fridge",
    "kitchen": "kitchenette",
    "counter": "kitchenette",
    "kitchenette": "kitchenette",
}

MAX_ANALYSIS_DIMENSION = 1600
SEGMENTATION_IMAGE_SIZE = 768
WALL_CONNECTION_TOLERANCE_PERCENT = 4.0
STRUCTURAL_ENDPOINT_TOLERANCE_PERCENT = 4.5
MIN_STRUCTURAL_WALL_LENGTH_PERCENT = 14.0
WINDOW_GAP_MIN_RATIO = 0.08
WINDOW_GAP_MAX_RATIO = 0.35
WINDOW_SCAN_HALF_THICKNESS = 3
MIN_OBJECT_CANDIDATE_AREA_RATIO = 0.0004
MAX_OBJECT_CANDIDATE_AREA_RATIO = 0.08
DOOR_MIN_RADIUS_RATIO = 0.025
DOOR_MAX_RADIUS_RATIO = 0.16
DOOR_ARC_SUPPORT_MIN_RATIO = 0.16
DOOR_ARC_SUPPORT_MAX_RATIO = 0.6
DOOR_ARC_ASPECT_RATIO_MAX = 1.85
SYMBOL_MIN_AREA_RATIO = 0.00035
SYMBOL_MAX_AREA_RATIO = 0.03


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


def segment_overlaps_rect(segment: Dict, rect: Tuple[float, float, float, float], padding: float = 0.0) -> bool:
    sample_count = max(4, int(round(segment_length(segment) / 4.0)))
    for sample_index in range(sample_count + 1):
        ratio = sample_index / max(sample_count, 1)
        point = (
            segment["x1_percent"] + ((segment["x2_percent"] - segment["x1_percent"]) * ratio),
            segment["y1_percent"] + ((segment["y2_percent"] - segment["y1_percent"]) * ratio),
        )
        if point_inside_rect(point, rect, padding):
            return True
    return False


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


def point_near_border(point: Tuple[float, float], tolerance: float = STRUCTURAL_ENDPOINT_TOLERANCE_PERCENT) -> bool:
    return (
        point[0] <= tolerance
        or point[0] >= 100.0 - tolerance
        or point[1] <= tolerance
        or point[1] >= 100.0 - tolerance
    )


def endpoint_anchor_score(
    segment: Dict,
    walls: List[Dict],
    tolerance: float = STRUCTURAL_ENDPOINT_TOLERANCE_PERCENT,
    reference_walls: List[Dict] = None,
) -> int:
    endpoints = [
        (segment["x1_percent"], segment["y1_percent"]),
        (segment["x2_percent"], segment["y2_percent"]),
    ]
    score = 0
    candidates = list(walls or [])
    candidates.extend(reference_walls or [])

    for endpoint in endpoints:
        if point_near_border(endpoint, tolerance):
            score += 1
            continue

        anchored = False
        for candidate in candidates:
            if candidate is segment:
                continue

            candidate_endpoints = [
                (candidate["x1_percent"], candidate["y1_percent"]),
                (candidate["x2_percent"], candidate["y2_percent"]),
            ]
            if any(np.hypot(endpoint[0] - other[0], endpoint[1] - other[1]) <= tolerance for other in candidate_endpoints):
                anchored = True
                break
            if point_on_segment(endpoint, candidate, tolerance):
                anchored = True
                break

        if anchored:
            score += 1

    return score


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


def filter_structural_walls(
    walls: List[Dict],
    room_rect: Tuple[int, int, int, int],
    blocked_rects: List[Tuple[float, float, float, float]],
    reference_walls: List[Dict] = None,
) -> List[Dict]:
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
        if length < MIN_STRUCTURAL_WALL_LENGTH_PERCENT:
            continue

        wall_midpoint = midpoint(wall)
        if any(point_inside_rect(wall_midpoint, rect, 3.5) for rect in blocked_percent_rects):
            continue
        if any(segment_overlaps_rect(wall, rect, 2.5) for rect in blocked_percent_rects):
            continue

        connection_score = wall_connection_score(wall, walls)
        anchor_score = endpoint_anchor_score(wall, walls, reference_walls=reference_walls)
        if wall_near_border(wall):
            filtered.append(wall)
            continue

        if anchor_score >= 2 and connection_score >= 1:
            filtered.append(wall)
            continue

        if connection_score >= 2 and anchor_score >= 1 and length >= 18:
            filtered.append(wall)
            continue

        if length >= 28 and anchor_score >= 2:
            filtered.append(wall)

    return filtered


def wall_quality_score(walls: List[Dict]) -> float:
    if not walls:
        return 0.0

    return sum(segment_length(wall) for wall in walls) + (min(len(walls), 8) * 8.0)


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
    reference_walls: List[Dict] = None,
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
    return filter_structural_walls(merged, room_rect, blocked_rects or [], reference_walls)


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
        cv2.getStructuringElement(cv2.MORPH_RECT, (9, 5)),
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


def detect_object_candidate_rects(
    room_crop: np.ndarray,
    room_rect: Tuple[int, int, int, int],
    room_features: Dict[str, np.ndarray] = None,
) -> List[Tuple[float, float, float, float]]:
    if room_crop.size == 0:
        return []

    blob_mask = build_object_candidate_mask(room_crop, room_features)
    contours, _ = cv2.findContours(blob_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    room_area = max(room_crop.shape[0] * room_crop.shape[1], 1)
    rx, ry, _, _ = room_rect
    rects: List[Tuple[float, float, float, float]] = []

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
        if aspect_ratio > 10.5:
            continue

        rects.append((rx + x, ry + y, rx + x + w, ry + y + h))

    return rects


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


def quantize_object_rotation(base_type: str, raw_rotation: float) -> float:
    if base_type in {
        "desk",
        "l_shaped_desk",
        "chair",
        "couch",
        "toilet",
        "sink",
        "shower",
        "fridge",
        "kitchenette",
        "meeting_table",
        "table",
    }:
        return clamp_angle(round(raw_rotation / 90.0) * 90.0)
    return clamp_angle(raw_rotation)


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


def nearest_wall_distance(point: Tuple[float, float], walls: List[Dict]) -> float:
    if not walls:
        return 999.0
    return min(project_point_to_wall_percent(point, wall)[1] for wall in walls)


def nearby_wall_count(point: Tuple[float, float], walls: List[Dict], max_distance: float = 10.0) -> int:
    count = 0
    for wall in walls:
        _, distance = project_point_to_wall_percent(point, wall)
        if distance <= max_distance:
            count += 1
    return count


def object_area_percent(item: Dict) -> float:
    return (item.get("width_percent", 0.0) * item.get("height_percent", 0.0)) / 100.0


def looks_like_plausible_fixture(item: Dict, walls: List[Dict], confidence: float) -> bool:
    point = (item.get("x_percent", 50.0), item.get("y_percent", 50.0))
    wall_distance = nearest_wall_distance(point, walls)
    area = object_area_percent(item)
    aspect_ratio = max(item.get("width_percent", 1.0), item.get("height_percent", 1.0)) / max(
        min(item.get("width_percent", 1.0), item.get("height_percent", 1.0)),
        1.0,
    )
    item_type = item.get("type")

    if item_type == "toilet":
        return confidence >= 0.45 and wall_distance <= 9.0 and area <= 7.5 and aspect_ratio <= 2.1

    if item_type == "sink":
        return confidence >= 0.35 and wall_distance <= 9.5 and area <= 8.5 and aspect_ratio <= 2.6

    if item_type == "shower":
        return confidence >= 0.4 and nearby_wall_count(point, walls, 11.0) >= 2 and area <= 14.0

    if item_type in {"fridge", "kitchenette"}:
        return confidence >= 0.35 and wall_distance <= 11.0 and area <= 18.0

    return True


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


def detect_objects_with_segmentation(
    model,
    image: np.ndarray,
    room_rect: Tuple[int, int, int, int],
    walls: List[Dict],
) -> Tuple[List[Dict], List[Tuple[float, float, float, float]]]:
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
        confidence = float(box.conf[0].item()) if getattr(box, "conf", None) is not None else 0.0

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
            "rotation_deg": quantize_object_rotation(
                object_type,
                rotation_from_points(contour_points, (x1, y1, x2, y2)),
            ),
        }
        if not looks_like_plausible_fixture(item, walls, confidence):
            continue
        if shape_kind == "polygon":
            item["footprint_points"] = polygon_points_from_mask(contour_points, (x1, y1, x2, y2))
        objects.append(item)
        blocked_rects.append((rx + x1, ry + y1, rx + x2, ry + y2))
    return objects, blocked_rects


def symbol_item_from_bbox(
    item_type: str,
    bbox: Tuple[float, float, float, float],
    room_rect: Tuple[int, int, int, int],
    rotation_deg: float = 0.0,
    shape_kind: str = "rect",
) -> Dict:
    rx, ry, rw, rh = room_rect
    x1, y1, x2, y2 = bbox
    center_x = (x1 + x2) / 2.0
    center_y = (y1 + y2) / 2.0
    return {
        "type": item_type,
        "shape_kind": shape_kind,
        "x_percent": clamp_percent((center_x / max(rw, 1)) * 100),
        "y_percent": clamp_percent((center_y / max(rh, 1)) * 100),
        "width_percent": clamp_percent(((x2 - x1) / max(rw, 1)) * 100),
        "height_percent": clamp_percent(((y2 - y1) / max(rh, 1)) * 100),
        "rotation_deg": quantize_object_rotation(item_type, rotation_deg),
    }


def dedupe_furniture_items(items: List[Dict], tolerance: float = 6.0) -> List[Dict]:
    unique: List[Dict] = []
    for item in items:
        duplicate = False
        for existing in unique:
            if existing.get("type") != item.get("type"):
                continue
            if (
                abs(existing.get("x_percent", 0.0) - item.get("x_percent", 0.0)) <= tolerance
                and abs(existing.get("y_percent", 0.0) - item.get("y_percent", 0.0)) <= tolerance
            ):
                duplicate = True
                break
        if not duplicate:
            unique.append(item)
    return unique


def detect_symbol_fixtures(
    image: np.ndarray,
    room_rect: Tuple[int, int, int, int],
    walls: List[Dict],
    blocked_rects: List[Tuple[float, float, float, float]],
    room_features: Dict[str, np.ndarray] = None,
) -> Tuple[List[Dict], List[Tuple[float, float, float, float]]]:
    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0:
        return [], []

    features = room_features or build_room_features(room_crop)
    symbol_mask = cv2.bitwise_and(features["thresh"], cv2.bitwise_not(features["wall_map"]))
    symbol_mask = cv2.morphologyEx(
        symbol_mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
        iterations=1,
    )
    symbol_mask = cv2.morphologyEx(
        symbol_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
        iterations=1,
    )
    symbol_mask = mask_rectangles(symbol_mask, room_rect, blocked_rects or [])
    contours, _ = cv2.findContours(symbol_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    fixtures: List[Dict] = []
    blocked: List[Tuple[float, float, float, float]] = []
    room_area = float(max(rw * rh, 1))

    for contour in contours:
        area = float(cv2.contourArea(contour))
        if area <= 0:
            continue
        area_ratio = area / room_area
        if area_ratio < SYMBOL_MIN_AREA_RATIO or area_ratio > SYMBOL_MAX_AREA_RATIO:
            continue

        perimeter = float(cv2.arcLength(contour, True))
        if perimeter <= 0:
            continue

        x, y, width, height = cv2.boundingRect(contour)
        if width < 8 or height < 8:
            continue

        aspect_ratio = max(width, height) / max(min(width, height), 1)
        circularity = (4.0 * np.pi * area) / max(perimeter * perimeter, 1.0)
        extent = area / max(width * height, 1)
        points = contour.reshape(-1, 2).astype(np.float32)
        center_point = (
            clamp_percent(((x + width / 2.0) / max(rw, 1)) * 100),
            clamp_percent(((y + height / 2.0) / max(rh, 1)) * 100),
        )
        wall_distance = nearest_wall_distance(center_point, walls)
        nearby_walls = nearby_wall_count(center_point, walls, 12.0)
        bbox = (float(x), float(y), float(x + width), float(y + height))
        rotation = rotation_from_points(points, bbox)

        item_type = None
        shape_kind = "rect"

        if wall_distance <= 10.0 and circularity >= 0.42 and 0.7 <= aspect_ratio <= 1.6 and extent >= 0.45:
            item_type = "toilet"
            shape_kind = "ellipse"
        elif wall_distance <= 10.0 and extent >= 0.52 and 0.9 <= aspect_ratio <= 2.6:
            item_type = "sink"
        elif nearby_walls >= 2 and 0.75 <= aspect_ratio <= 1.35 and extent >= 0.58:
            item_type = "shower"
        elif wall_distance >= 4.0 and extent >= 0.55 and 1.1 <= aspect_ratio <= 4.4:
            item_type = "meeting_table" if area_ratio >= 0.006 else "desk"

        if not item_type:
            continue

        item = symbol_item_from_bbox(item_type, bbox, room_rect, rotation, shape_kind)
        if not looks_like_plausible_fixture(item, walls, 0.72):
            continue

        fixtures.append(item)
        blocked.append((rx + x, ry + y, rx + x + width, ry + y + height))

    return dedupe_furniture_items(fixtures, 7.0), blocked


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


def circle_support_ratio(edge_map: np.ndarray, center_x: float, center_y: float, radius: float) -> float:
    if radius <= 0:
        return 0.0

    hits = 0
    samples = 48
    image_h, image_w = edge_map.shape[:2]

    for sample_index in range(samples):
        angle = (2.0 * np.pi * sample_index) / samples
        x = int(round(center_x + np.cos(angle) * radius))
        y = int(round(center_y + np.sin(angle) * radius))
        if 0 <= x < image_w and 0 <= y < image_h and edge_map[y, x] > 0:
            hits += 1

    return hits / max(samples, 1)


def opening_from_hinge_point(point: Tuple[float, float], walls: List[Dict], max_distance: float = 6.0):
    best = None
    for wall_index, wall in enumerate(walls):
        position_percent, distance = project_point_to_wall_percent(point, wall)
        if distance > max_distance:
            continue

        candidate = {
            "wall_index": wall_index,
            "position_percent": clamp_percent(position_percent),
            "distance": distance,
        }
        if best is None or candidate["distance"] < best["distance"]:
            best = candidate

    if best is None:
        return None

    return {
        "wall_index": best["wall_index"],
        "position_percent": round(best["position_percent"], 2),
        "opening_anchor": "edge",
        "hinge_side": "end" if best["position_percent"] >= 50 else "start",
        "swing_direction": 1,
    }


def detect_door_arc_contours(edge_map: np.ndarray, walls: List[Dict]) -> List[Dict]:
    contours, _ = cv2.findContours(edge_map, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    openings: List[Dict] = []

    for contour in contours:
        if len(contour) < 18:
            continue

        perimeter = cv2.arcLength(contour, False)
        if perimeter <= 0:
            continue

        (center_x, center_y), radius = cv2.minEnclosingCircle(contour)
        if radius <= 0:
            continue

        x, y, width, height = cv2.boundingRect(contour)
        aspect_ratio = max(width, height) / max(min(width, height), 1)
        if aspect_ratio > DOOR_ARC_ASPECT_RATIO_MAX:
            continue

        circumference_ratio = perimeter / max(2.0 * np.pi * radius, 1.0)
        if circumference_ratio < DOOR_ARC_SUPPORT_MIN_RATIO or circumference_ratio > 0.45:
            continue

        opening = opening_from_hinge_point((center_x, center_y), walls)
        if opening is not None:
            openings.append(opening)

    return openings


def detect_door_openings(image: np.ndarray, room_rect: Tuple[int, int, int, int], walls: List[Dict], blocked_rects: List[Tuple[float, float, float, float]]) -> List[Dict]:
    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0 or not walls:
        return []

    features = build_room_features(room_crop)
    gray = features["gray"]
    blurred = cv2.GaussianBlur(gray, (7, 7), 1.4)
    edges = cv2.Canny(blurred, 40, 110)
    edges = mask_rectangles(edges, room_rect, blocked_rects or [])
    min_radius = max(8, int(min(rw, rh) * DOOR_MIN_RADIUS_RATIO))
    max_radius = max(min_radius + 4, int(min(rw, rh) * DOOR_MAX_RADIUS_RATIO))
    circles = cv2.HoughCircles(
        edges,
        cv2.HOUGH_GRADIENT,
        dp=1.1,
        minDist=max(18, min_radius * 2),
        param1=110,
        param2=8,
        minRadius=min_radius,
        maxRadius=max_radius,
    )

    arc_doors = []
    if circles is not None:
        for circle in circles[0]:
            local_x, local_y, radius = [float(value) for value in circle.tolist()]
            support_ratio = circle_support_ratio(edges, local_x, local_y, radius)
            if support_ratio < DOOR_ARC_SUPPORT_MIN_RATIO or support_ratio > DOOR_ARC_SUPPORT_MAX_RATIO:
                continue

            point = (
                clamp_percent((local_x / max(rw, 1)) * 100),
                clamp_percent((local_y / max(rh, 1)) * 100),
            )
            opening = opening_from_hinge_point(point, walls)
            if opening is not None:
                arc_doors.append(opening)

    contour_mask = cv2.bitwise_and(edges, cv2.bitwise_not(features["wall_map"]))
    contour_mask = cv2.morphologyEx(
        contour_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
        iterations=1,
    )
    contour_mask = mask_rectangles(contour_mask, room_rect, blocked_rects or [])
    arc_doors.extend(detect_door_arc_contours(contour_mask, walls))

    if arc_doors:
        return dedupe_openings(arc_doors, 10.0)

    fallback_doors = detect_door_openings_from_wall_gaps(features["wall_map"], contour_mask, walls)

    return dedupe_openings(fallback_doors, 10.0)


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


def wall_gap_center_local(wall: Dict, position_percent: float, image_shape: Tuple[int, int]) -> Tuple[int, int]:
    image_h, image_w = image_shape[:2]
    local_x = ((wall["x1_percent"] + ((wall["x2_percent"] - wall["x1_percent"]) * (position_percent / 100.0))) / 100.0) * max(image_w - 1, 1)
    local_y = ((wall["y1_percent"] + ((wall["y2_percent"] - wall["y1_percent"]) * (position_percent / 100.0))) / 100.0) * max(image_h - 1, 1)
    return int(round(local_x)), int(round(local_y))


def gap_has_door_arc_support(
    edge_mask: np.ndarray,
    wall: Dict,
    start_percent: float,
    end_percent: float,
) -> bool:
    if edge_mask.size == 0:
        return False

    axis = orientation_for_line(
        int(round(wall["x1_percent"])),
        int(round(wall["y1_percent"])),
        int(round(wall["x2_percent"])),
        int(round(wall["y2_percent"])),
    )
    center_percent = (start_percent + end_percent) / 2.0
    center_x, center_y = wall_gap_center_local(wall, center_percent, edge_mask.shape)
    gap_length_px = max(
        10,
        int(
            round(
                ((abs(end_percent - start_percent) / 100.0) * max(edge_mask.shape[0], edge_mask.shape[1]))
            )
        ),
    )
    lateral_half = max(8, int(round(gap_length_px * 0.8)))
    normal_depth = max(10, int(round(gap_length_px * 1.1)))

    if axis == "horizontal":
        left = max(0, center_x - lateral_half)
        right = min(edge_mask.shape[1], center_x + lateral_half)
        above = edge_mask[max(0, center_y - normal_depth): max(0, center_y - 1), left:right]
        below = edge_mask[min(edge_mask.shape[0], center_y + 1): min(edge_mask.shape[0], center_y + normal_depth), left:right]
        regions = [above, below]
    else:
        top = max(0, center_y - lateral_half)
        bottom = min(edge_mask.shape[0], center_y + lateral_half)
        left_region = edge_mask[top:bottom, max(0, center_x - normal_depth): max(0, center_x - 1)]
        right_region = edge_mask[top:bottom, min(edge_mask.shape[1], center_x + 1): min(edge_mask.shape[1], center_x + normal_depth)]
        regions = [left_region, right_region]

    for region in regions:
        if region.size == 0:
            continue
        non_zero = int(np.count_nonzero(region))
        density = non_zero / max(region.size, 1)
        if non_zero >= 14 and density >= 0.045:
            return True

    return False


def gap_hinge_side_from_arc_support(
    edge_mask: np.ndarray,
    wall: Dict,
    start_percent: float,
    end_percent: float,
) -> str | None:
    if edge_mask.size == 0:
        return None

    start_x, start_y = wall_gap_center_local(wall, start_percent, edge_mask.shape)
    end_x, end_y = wall_gap_center_local(wall, end_percent, edge_mask.shape)
    gap_length_px = max(
        12,
        int(
            round(
                ((abs(end_percent - start_percent) / 100.0) * max(edge_mask.shape[0], edge_mask.shape[1]))
            )
        ),
    )
    radius = max(8, int(round(gap_length_px * 0.45)))

    def endpoint_support(center_x: int, center_y: int) -> int:
        x1 = max(0, center_x - radius)
        x2 = min(edge_mask.shape[1], center_x + radius + 1)
        y1 = max(0, center_y - radius)
        y2 = min(edge_mask.shape[0], center_y + radius + 1)
        if x2 <= x1 or y2 <= y1:
            return 0
        region = edge_mask[y1:y2, x1:x2]
        return int(np.count_nonzero(region))

    start_support = endpoint_support(start_x, start_y)
    end_support = endpoint_support(end_x, end_y)
    strongest = max(start_support, end_support)
    weakest = min(start_support, end_support)

    if strongest < 10:
        return None
    if strongest < weakest * 1.15 + 3:
        return None

    return "start" if start_support >= end_support else "end"


def detect_door_openings_from_wall_gaps(
    wall_map: np.ndarray,
    edge_mask: np.ndarray,
    walls: List[Dict],
) -> List[Dict]:
    doors: List[Dict] = []

    for wall_index, wall in enumerate(walls):
        for start_percent, end_percent in sample_wall_gap_runs(wall_map, wall):
            if not gap_has_door_arc_support(edge_mask, wall, start_percent, end_percent):
                continue
            hinge_side = gap_hinge_side_from_arc_support(edge_mask, wall, start_percent, end_percent)
            if hinge_side is None:
                continue

            doors.append({
                "wall_index": wall_index,
                "position_percent": round((start_percent + end_percent) / 2.0, 2),
                "opening_anchor": "edge",
                "hinge_side": hinge_side,
                "swing_direction": 1,
            })

    return doors


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
    wall_map = mask_rectangles(features["wall_map"], room_rect, blocked_rects or [])
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
    contour_walls = contour_to_walls(contour, room_rect)
    preblocked_rects = detect_object_candidate_rects(room_crop, room_rect, room_features)
    blocked_detected_walls = detect_wall_segments(image, room_rect, preblocked_rects, room_features, contour_walls)
    unblocked_detected_walls = detect_wall_segments(image, room_rect, [], room_features, contour_walls)
    detected_walls = blocked_detected_walls
    if not blocked_detected_walls and wall_quality_score(unblocked_detected_walls) > 0:
        detected_walls = unblocked_detected_walls
    elif len(blocked_detected_walls) < 2 and wall_quality_score(unblocked_detected_walls) > wall_quality_score(blocked_detected_walls) * 1.35:
        detected_walls = unblocked_detected_walls
    walls = dedupe_walls(contour_walls + detected_walls)
    furniture = []
    blocked_rects: List[Tuple[float, float, float, float]] = list(preblocked_rects)

    if should_run_segmentation(room_crop, walls, room_features):
        model = maybe_load_segmentation_model()
        if model is not None:
            furniture, segmentation_rects = detect_objects_with_segmentation(model, image, room_rect, walls)
            if segmentation_rects:
                blocked_rects.extend(segmentation_rects)
                refined_walls = detect_wall_segments(image, room_rect, blocked_rects, room_features, contour_walls)
                if refined_walls:
                    walls = dedupe_walls(contour_walls + refined_walls)

    symbol_fixtures, symbol_rects = detect_symbol_fixtures(image, room_rect, walls, blocked_rects, room_features)
    if symbol_fixtures:
        furniture = dedupe_furniture_items(furniture + symbol_fixtures, 7.0)
        blocked_rects.extend(symbol_rects)

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
