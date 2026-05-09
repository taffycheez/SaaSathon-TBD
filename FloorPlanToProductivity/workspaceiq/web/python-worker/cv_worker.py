from http.server import BaseHTTPRequestHandler
import base64
import io
import json
import os
from typing import Dict, List, Tuple

import cv2
import numpy as np
from PIL import Image


SUPPORTED_TYPES = {
    "desk": "desk",
    "table": "table",
    "dining table": "meeting_table",
    "chair": "armchair",
    "couch": "armchair",
    "sofa": "armchair",
    "potted plant": "plant",
    "plant": "plant",
    "toilet": "toilet",
    "sink": "sink",
    "shower": "shower",
    "bathtub": "shower",
    "tv": "office_equipment",
    "laptop": "office_equipment",
    "keyboard": "office_equipment",
    "mouse": "office_equipment",
    "printer": "office_equipment",
}


def clamp_percent(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


def normalize_point(x: float, y: float, room_rect: Tuple[int, int, int, int]) -> Dict:
    rx, ry, rw, rh = room_rect
    return {
        "x_percent": clamp_percent(((x - rx) / max(rw, 1)) * 100),
        "y_percent": clamp_percent(((y - ry) / max(rh, 1)) * 100),
    }


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


def detect_wall_segments(image: np.ndarray, room_rect: Tuple[int, int, int, int]) -> List[Dict]:
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
    model_name = os.environ.get("CV_SEGMENTATION_MODEL", "yolov8n-seg.pt").strip()
    try:
        from ultralytics import YOLO
        return YOLO(model_name)
    except Exception:
        return None


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


def detect_objects_with_segmentation(model, image: np.ndarray, room_rect: Tuple[int, int, int, int]) -> List[Dict]:
    if model is None:
        return []

    try:
        result = model.predict(image, verbose=False, conf=0.18, imgsz=1024)[0]
    except Exception:
        return []

    names = result.names if hasattr(result, "names") else {}
    masks = result.masks.xy if getattr(result, "masks", None) is not None else []
    boxes = result.boxes
    if boxes is None:
        return []

    rx, ry, rw, rh = room_rect
    objects = []
    for index, box in enumerate(boxes):
        cls_index = int(box.cls[0].item())
        label = names.get(cls_index, "").lower()
        object_type = SUPPORTED_TYPES.get(label)
        if not object_type:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2
        if not (rx <= center_x <= rx + rw and ry <= center_y <= ry + rh):
            continue

        shape_kind = "polygon" if index < len(masks) and len(masks[index]) >= 3 else "rect"
        item = {
            "type": object_type,
            "shape_kind": shape_kind,
            "x_percent": clamp_percent(((center_x - rx) / max(rw, 1)) * 100),
            "y_percent": clamp_percent(((center_y - ry) / max(rh, 1)) * 100),
            "width_percent": clamp_percent(((x2 - x1) / max(rw, 1)) * 100),
            "height_percent": clamp_percent(((y2 - y1) / max(rh, 1)) * 100),
            "rotation_deg": 0,
        }
        if shape_kind == "polygon":
            item["footprint_points"] = polygon_points_from_mask(np.array(masks[index]), (x1, y1, x2, y2))
        objects.append(item)
    return objects


def build_response(image: np.ndarray) -> Dict:
    contour, room_rect = choose_room_contour(image)
    walls = dedupe_walls(contour_to_walls(contour, room_rect) + detect_wall_segments(image, room_rect))
    model = maybe_load_segmentation_model()
    furniture = detect_objects_with_segmentation(model, image, room_rect)
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


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", "0"))
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body or b"{}")
            image = decode_image(payload.get("image", ""))
            result = build_response(image)
            body = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            body = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
