import base64
import io
import json
import os
import sys
from typing import Dict, List, Tuple

import cv2
import numpy as np
from PIL import Image


SUPPORTED_TYPES = {
    "desk": "desk",
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


def read_input() -> Dict:
    return json.loads(sys.stdin.read() or "{}")


def decode_image(data_url: str) -> np.ndarray:
    if not data_url or "," not in data_url:
      raise ValueError("Expected image as a data URL.")

    encoded = data_url.split(",", 1)[1]
    image_bytes = base64.b64decode(encoded)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def normalize_point(x: float, y: float, room_rect: Tuple[int, int, int, int]) -> Dict:
    rx, ry, rw, rh = room_rect
    return {
        "x_percent": clamp_percent(((x - rx) / max(rw, 1)) * 100),
        "y_percent": clamp_percent(((y - ry) / max(rh, 1)) * 100),
    }


def clamp_percent(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


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


def choose_room_contour(image: np.ndarray) -> Tuple[np.ndarray, Tuple[int, int, int, int], bool]:
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
        return np.empty((0, 1, 2), dtype=np.int32), (0, 0, w, h), False

    _, best_contour, room_rect = max(candidates, key=lambda item: item[0])
    return best_contour, room_rect, True


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
    if abs(x2 - x1) >= abs(y2 - y1):
        return "horizontal"
    return "vertical"


def wall_midpoint(wall: Dict) -> Tuple[float, float]:
    return (
        (wall["x1_percent"] + wall["x2_percent"]) / 2,
        (wall["y1_percent"] + wall["y2_percent"]) / 2,
    )


def nearest_point_on_segment(point: Tuple[float, float], wall: Dict) -> Tuple[float, float]:
    px, py = point
    dx = wall["x2_percent"] - wall["x1_percent"]
    dy = wall["y2_percent"] - wall["y1_percent"]
    length_squared = dx * dx + dy * dy

    if length_squared <= 0:
        return (wall["x1_percent"], wall["y1_percent"])

    ratio = max(0.0, min(1.0, ((px - wall["x1_percent"]) * dx + (py - wall["y1_percent"]) * dy) / length_squared))
    return (
        wall["x1_percent"] + dx * ratio,
        wall["y1_percent"] + dy * ratio,
    )


def nearest_wall_index(point: Tuple[float, float], walls: List[Dict]) -> int:
    if not walls:
        return 0

    distances = [
        (
            index,
            (nearest_point_on_segment(point, wall)[0] - point[0]) ** 2 +
            (nearest_point_on_segment(point, wall)[1] - point[1]) ** 2
        )
        for index, wall in enumerate(walls)
    ]
    return min(distances, key=lambda item: item[1])[0]


def position_percent_on_wall(point: Tuple[float, float], wall: Dict) -> float:
    px, py = point
    dx = wall["x2_percent"] - wall["x1_percent"]
    dy = wall["y2_percent"] - wall["y1_percent"]
    length_squared = dx * dx + dy * dy
    if length_squared <= 0:
        return 50.0

    ratio = ((px - wall["x1_percent"]) * dx + (py - wall["y1_percent"]) * dy) / length_squared
    return clamp_percent(ratio * 100)


def detect_wall_segments(image: np.ndarray, room_rect: Tuple[int, int, int, int]) -> List[Dict]:
    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0:
        return []

    gray = cv2.cvtColor(room_crop, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        21,
        7
    )

    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(12, rw // 18), 1))
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(12, rh // 18)))
    horizontal = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horizontal_kernel, iterations=1)
    vertical = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vertical_kernel, iterations=1)
    wall_map = cv2.bitwise_or(horizontal, vertical)

    min_length = max(24, min(rw, rh) // 8)
    raw_lines = cv2.HoughLinesP(
        wall_map,
        1,
        np.pi / 180,
        threshold=50,
        minLineLength=min_length,
        maxLineGap=max(10, min_length // 3)
    )

    if raw_lines is None:
        return []

    horizontal_segments = []
    vertical_segments = []

    for line in raw_lines[:, 0]:
        x1, y1, x2, y2 = [int(value) for value in line.tolist()]
        orientation = orientation_for_line(x1, y1, x2, y2)
        if orientation == "horizontal":
            y = int(round((y1 + y2) / 2))
            x_start, x_end = sorted([x1, x2])
            horizontal_segments.append((y, x_start, x_end))
        else:
            x = int(round((x1 + x2) / 2))
            y_start, y_end = sorted([y1, y2])
            vertical_segments.append((x, y_start, y_end))

    merged = []
    merged.extend(merge_axis_aligned_segments(horizontal_segments, axis="horizontal", room_rect=room_rect))
    merged.extend(merge_axis_aligned_segments(vertical_segments, axis="vertical", room_rect=room_rect))
    return merged


def detect_doors(image: np.ndarray, room_rect: Tuple[int, int, int, int], walls: List[Dict]) -> List[Dict]:
    if not walls:
        return []

    rx, ry, rw, rh = room_rect
    room_crop = image[ry:ry + rh, rx:rx + rw]
    if room_crop.size == 0:
        return []

    gray = cv2.cvtColor(room_crop, cv2.COLOR_BGR2GRAY)
    blur = cv2.medianBlur(gray, 5)
    min_radius = max(8, min(rw, rh) // 35)
    max_radius = max(min_radius + 4, min(rw, rh) // 7)
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(18, min(rw, rh) // 9),
        param1=70,
        param2=18,
        minRadius=min_radius,
        maxRadius=max_radius
    )

    doors = []
    if circles is not None:
        for circle in np.round(circles[0, :]).astype("int"):
            x, y, radius = circle.tolist()
            if x <= 2 or y <= 2 or x >= rw - 2 or y >= rh - 2:
                continue

            normalized = normalize_point(rx + x, ry + y, room_rect)
            point = (normalized["x_percent"], normalized["y_percent"])
            wall_index = nearest_wall_index(point, walls)
            doors.append({
                "wall_index": wall_index,
                "position_percent": position_percent_on_wall(point, walls[wall_index]),
                "confidence": float(min(1.0, radius / max(max_radius, 1))),
            })

    # Many floor plans draw doors as simple breaks in long walls. Use large gaps between
    # collinear wall segments as a conservative fallback, but avoid inventing more than a few.
    if len(doors) < 3:
        horizontal = sorted(
            [wall for wall in walls if abs(wall["y1_percent"] - wall["y2_percent"]) <= 4],
            key=lambda wall: (round((wall["y1_percent"] + wall["y2_percent"]) / 2 / 4), wall["x1_percent"])
        )
        vertical = sorted(
            [wall for wall in walls if abs(wall["x1_percent"] - wall["x2_percent"]) <= 4],
            key=lambda wall: (round((wall["x1_percent"] + wall["x2_percent"]) / 2 / 4), wall["y1_percent"])
        )

        doors.extend(gap_doors(horizontal, walls, axis="horizontal"))
        doors.extend(gap_doors(vertical, walls, axis="vertical"))

    return dedupe_edge_items(doors)[:4]


def gap_doors(segments: List[Dict], walls: List[Dict], axis: str) -> List[Dict]:
    doors = []
    for first, second in zip(segments, segments[1:]):
        if axis == "horizontal":
            first_y = (first["y1_percent"] + first["y2_percent"]) / 2
            second_y = (second["y1_percent"] + second["y2_percent"]) / 2
            if abs(first_y - second_y) > 4:
                continue
            first_end = max(first["x1_percent"], first["x2_percent"])
            second_start = min(second["x1_percent"], second["x2_percent"])
            gap = second_start - first_end
            if 4 <= gap <= 18:
                point = ((first_end + second_start) / 2, (first_y + second_y) / 2)
            else:
                continue
        else:
            first_x = (first["x1_percent"] + first["x2_percent"]) / 2
            second_x = (second["x1_percent"] + second["x2_percent"]) / 2
            if abs(first_x - second_x) > 4:
                continue
            first_end = max(first["y1_percent"], first["y2_percent"])
            second_start = min(second["y1_percent"], second["y2_percent"])
            gap = second_start - first_end
            if 4 <= gap <= 18:
                point = ((first_x + second_x) / 2, (first_end + second_start) / 2)
            else:
                continue

        wall_index = nearest_wall_index(point, walls)
        doors.append({
            "wall_index": wall_index,
            "position_percent": position_percent_on_wall(point, walls[wall_index]),
            "confidence": 0.45,
        })

    return doors


def dedupe_edge_items(items: List[Dict]) -> List[Dict]:
    unique = []
    for item in sorted(items, key=lambda entry: entry.get("confidence", 0), reverse=True):
        duplicate = any(
            existing["wall_index"] == item["wall_index"]
            and abs(existing["position_percent"] - item["position_percent"]) <= 8
            for existing in unique
        )
        if not duplicate:
            unique.append({
                "wall_index": int(item["wall_index"]),
                "position_percent": clamp_percent(item["position_percent"]),
            })
    return unique


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
    rx, ry, rw, rh = room_rect

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


def dedupe_walls(walls: List[Dict]) -> List[Dict]:
    unique: List[Dict] = []
    for wall in sorted(walls, key=segment_length, reverse=True):
        duplicate = False
        for existing in unique:
            if (
                abs(wall["x1_percent"] - existing["x1_percent"]) <= 2
                and abs(wall["y1_percent"] - existing["y1_percent"]) <= 2
                and abs(wall["x2_percent"] - existing["x2_percent"]) <= 2
                and abs(wall["y2_percent"] - existing["y2_percent"]) <= 2
            ) or (
                abs(wall["x1_percent"] - existing["x2_percent"]) <= 2
                and abs(wall["y1_percent"] - existing["y2_percent"]) <= 2
                and abs(wall["x2_percent"] - existing["x1_percent"]) <= 2
                and abs(wall["y2_percent"] - existing["y1_percent"]) <= 2
            ):
                duplicate = True
                break
        if not duplicate:
            unique.append(wall)
    return unique


def estimate_room_size(room_rect: Tuple[int, int, int, int]) -> Tuple[float, float]:
    _, _, rw, rh = room_rect
    width_m = 8.0
    height_m = max(3.0, round(width_m * (rh / max(rw, 1)), 1))
    return width_m, height_m


def maybe_load_segmentation_model():
    model_path = os.environ.get("CV_SEGMENTATION_MODEL", "").strip()
    if not model_path:
        model_path = "yolov8n-seg.pt"

    try:
        from ultralytics import YOLO
    except Exception:
        return None

    try:
        return YOLO(model_path)
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
        width_percent = clamp_percent(((x2 - x1) / max(rw, 1)) * 100)
        height_percent = clamp_percent(((y2 - y1) / max(rh, 1)) * 100)
        item = {
            "type": object_type,
            "shape_kind": shape_kind,
            "x_percent": clamp_percent(((center_x - rx) / max(rw, 1)) * 100),
            "y_percent": clamp_percent(((center_y - ry) / max(rh, 1)) * 100),
            "width_percent": width_percent,
            "height_percent": height_percent,
            "rotation_deg": 0,
        }

        if shape_kind == "polygon":
            item["footprint_points"] = polygon_points_from_mask(np.array(masks[index]), (x1, y1, x2, y2))

        objects.append(item)

    return objects


def build_response(image: np.ndarray) -> Dict:
    contour, room_rect, has_room_contour = choose_room_contour(image)
    contour_walls = contour_to_walls(contour, room_rect) if has_room_contour else []
    detected_walls = detect_wall_segments(image, room_rect)
    walls = dedupe_walls(contour_walls + detected_walls)
    width_m, height_m = estimate_room_size(room_rect)
    model = maybe_load_segmentation_model()
    furniture = detect_objects_with_segmentation(model, image, room_rect)
    doors = detect_doors(image, room_rect, walls)

    return {
        "is_valid_room": True,
        "rejection_reason": "",
        "estimated_width_m": width_m,
        "estimated_height_m": height_m,
        "walls": walls,
        "windows": [],
        "doors": doors,
        "furniture": furniture,
        "pipeline": {
            "mode": "cv",
            "segmentation_enabled": model is not None,
            "room_rect": {
                "x": room_rect[0],
                "y": room_rect[1],
                "width": room_rect[2],
                "height": room_rect[3],
            },
        },
    }


def main():
    try:
        payload = read_input()
        image = decode_image(payload.get("image", ""))
        result = build_response(image)
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({
            "is_valid_room": False,
            "rejection_reason": f"CV pipeline failed: {error}",
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
