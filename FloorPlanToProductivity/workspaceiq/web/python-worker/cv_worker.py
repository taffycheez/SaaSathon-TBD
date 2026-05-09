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


class AnalysePayload(BaseModel):
    image: str


app = FastAPI(title="WorkspaceIQ CV Worker")
_SEGMENTATION_MODEL = None


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


def detect_wall_segments(image: np.ndarray, room_rect: Tuple[int, int, int, int], blocked_rects: List[Tuple[float, float, float, float]] = None) -> List[Dict]:
    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0:
        return []

    gray = cv2.cvtColor(room_crop, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 7)

    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(12, rw // 18), 1))
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(12, rh // 18)))
    horizontal = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horizontal_kernel, iterations=1)
    vertical = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vertical_kernel, iterations=1)
    wall_map = cv2.bitwise_or(horizontal, vertical)
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

    return merge_axis_aligned_segments(horizontal_segments, "horizontal", room_rect) + merge_axis_aligned_segments(vertical_segments, "vertical", room_rect)


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

    try:
        result = model.predict(image, verbose=False, conf=0.18, imgsz=1024)[0]
    except Exception:
        return [], []

    names = result.names if hasattr(result, "names") else {}
    masks = result.masks.xy if getattr(result, "masks", None) is not None else []
    boxes = result.boxes
    if boxes is None:
        return [], []

    rx, ry, rw, rh = room_rect
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
        if not (rx <= center_x <= rx + rw and ry <= center_y <= ry + rh):
            continue

        contour_points = np.array(masks[index]) if index < len(masks) and len(masks[index]) >= 3 else np.empty((0, 2), dtype=np.float32)
        object_type = infer_object_type(base_type, contour_points, (x1, y1, x2, y2))
        shape_kind = "polygon" if contour_points.size >= 6 else "rect"
        item = {
            "type": object_type,
            "shape_kind": shape_kind,
            "x_percent": clamp_percent(((center_x - rx) / max(rw, 1)) * 100),
            "y_percent": clamp_percent(((center_y - ry) / max(rh, 1)) * 100),
            "width_percent": clamp_percent(((x2 - x1) / max(rw, 1)) * 100),
            "height_percent": clamp_percent(((y2 - y1) / max(rh, 1)) * 100),
            "rotation_deg": rotation_from_points(contour_points, (x1, y1, x2, y2)),
        }
        if shape_kind == "polygon":
            item["footprint_points"] = polygon_points_from_mask(contour_points, (x1, y1, x2, y2))
        objects.append(item)
        blocked_rects.append((x1, y1, x2, y2))
    return objects, blocked_rects


def build_response(image: np.ndarray) -> Dict:
    contour, room_rect = choose_room_contour(image)
    model = maybe_load_segmentation_model()
    furniture, blocked_rects = detect_objects_with_segmentation(model, image, room_rect)
    detected_walls = detect_wall_segments(image, room_rect, blocked_rects)
    contour_walls = contour_to_walls(contour, room_rect)
    walls = dedupe_walls(detected_walls if len(detected_walls) >= 4 else contour_walls + detected_walls)
    _, _, rw, rh = room_rect

    return {
        "is_valid_room": True,
        "rejection_reason": "",
        "estimated_width_m": 8.0,
        "estimated_height_m": max(3.0, round(8.0 * (rh / max(rw, 1)), 1)),
        "walls": walls,
        "windows": [],
        "doors": [],
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
