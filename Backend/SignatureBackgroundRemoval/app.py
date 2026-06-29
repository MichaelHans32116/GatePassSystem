from io import BytesIO

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from rembg import remove


app = FastAPI(title="Gate Pass Signature Background Removal")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def corner_color(rgb: np.ndarray) -> np.ndarray:
    height, width, _ = rgb.shape
    size = max(4, int(min(height, width) * 0.08))
    corners = np.concatenate(
        [
            rgb[:size, :size].reshape(-1, 3),
            rgb[:size, width - size :].reshape(-1, 3),
            rgb[height - size :, :size].reshape(-1, 3),
            rgb[height - size :, width - size :].reshape(-1, 3),
        ],
        axis=0,
    )
    return np.median(corners, axis=0)


def threshold_candidate(image: Image.Image, mode: str) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    background = corner_color(rgb)

    if mode == "white":
        background = np.array([255.0, 255.0, 255.0])
        distance = np.linalg.norm(rgb - background, axis=2)
        brightness = rgb.mean(axis=2)
        saturation = rgb.max(axis=2) - rgb.min(axis=2)
        remove_strength = np.maximum(
            np.clip((brightness - 190.0) / 55.0, 0.0, 1.0),
            np.clip((75.0 - distance) / 75.0, 0.0, 1.0)
            * (saturation < 55),
        )
    else:
        distance = np.linalg.norm(rgb - background, axis=2)
        blue_dominance = rgb[:, :, 2] - rgb[:, :, 0]
        remove_strength = (
            np.clip((95.0 - distance) / 95.0, 0.0, 1.0)
            * np.clip((blue_dominance + 10.0) / 45.0, 0.0, 1.0)
        )

    rgba[:, :, 3] = np.minimum(
        rgba[:, :, 3],
        ((1.0 - remove_strength) * 255).astype(np.uint8),
    )
    return Image.fromarray(rgba, "RGBA")


def quality_score(original: Image.Image, candidate: Image.Image) -> float:
    original_rgb = np.asarray(original.convert("RGB")).astype(np.float32)
    candidate_array = np.asarray(candidate.convert("RGBA"))
    alpha = candidate_array[:, :, 3].astype(np.float32) / 255.0

    height, width = alpha.shape
    size = max(4, int(min(height, width) * 0.08))
    corner_alpha = np.concatenate(
        [
            alpha[:size, :size].ravel(),
            alpha[:size, width - size :].ravel(),
            alpha[height - size :, :size].ravel(),
            alpha[height - size :, width - size :].ravel(),
        ]
    )
    corner_transparency = 1.0 - float(corner_alpha.mean())
    foreground_ratio = float((alpha > 0.35).mean())

    brightness = original_rgb.mean(axis=2)
    saturation = original_rgb.max(axis=2) - original_rgb.min(axis=2)
    ink_mask = (brightness < 190) | (saturation > 70)
    ink_preservation = (
        float((alpha[ink_mask] > 0.45).mean()) if ink_mask.any() else 0.0
    )

    foreground_penalty = 0.0
    if foreground_ratio < 0.002:
        foreground_penalty = 3.0
    elif foreground_ratio > 0.55:
        foreground_penalty = (foreground_ratio - 0.55) * 4.0

    return (
        corner_transparency * 3.0
        + ink_preservation * 3.0
        + (1.0 - min(foreground_ratio, 1.0))
        - foreground_penalty
    )


def best_background_removal(image: Image.Image) -> tuple[str, Image.Image]:
    candidates = {
        "white-threshold": threshold_candidate(image, "white"),
        "blue-threshold": threshold_candidate(image, "blue"),
        "ai-rembg": remove(image),
    }
    return max(
        candidates.items(),
        key=lambda item: quality_score(image, item[1]),
    )


@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)) -> Response:
    if file.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
        raise HTTPException(
            status_code=400,
            detail="Only PNG and JPEG images are supported.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        image = Image.open(BytesIO(raw)).convert("RGBA")
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image.",
        ) from exc

    method, output = best_background_removal(image)
    buffer = BytesIO()
    output.save(buffer, format="PNG")

    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"X-Signature-Removal-Method": method},
    )


@app.post("/compress")
async def compress(file: UploadFile = File(...)) -> Response:
    if file.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
        raise HTTPException(
            status_code=400,
            detail="Only PNG and JPEG images are supported.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        image = Image.open(BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image.",
        ) from exc

    image.thumbnail((1600, 1600))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=70, optimize=True)

    return Response(
        content=buffer.getvalue(),
        media_type="image/jpeg",
    )
