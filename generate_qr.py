#!/usr/bin/env python
"""Generate demo QR codes for AI B.O.S.S. QR Menu tables.

Each table gets its own QR pointing at the deep link:
    https://menu.aiboss.digital/<restaurant>/order?table=NN

Two outputs per table:
    qr/<restaurant>/<restaurant>_table_NN.png      (production domain)
    qr_local/<restaurant>/<restaurant>_table_NN.png (local demo domain for testing)

Usage:
    python generate_qr.py
"""
import json
import os
from urllib.parse import urlencode

import qrcode

ROOT = os.path.dirname(os.path.abspath(__file__))
PROD_DOMAIN = "https://menu.aiboss.digital"
LOCAL_DOMAIN = "http://localhost:8080"

# restaurant -> list of tables (must match data/restaurants.json)
RESTAURANTS = {
    "camon": ["01", "02", "03"],
    "common": [],  # common has no tables in demo
}


def make_qr(url, out_path, label):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    # caption strip
    from PIL import Image, ImageDraw, ImageFont
    w, h = img.size
    cap = 60
    canvas = Image.new("RGB", (w, h + cap), "white")
    canvas.paste(img, (0, 0))
    d = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
    d.text((w // 2, h + 18), label, fill="black", font=font, anchor="mm")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.save(out_path)
    print("  ->", out_path)


def main():
    for rid, tables in RESTAURANTS.items():
        cfg_path = os.path.join(ROOT, "data", "restaurants.json")
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
        name = cfg.get(rid, {}).get("name", rid)
        for t in tables:
            for domain, folder in ((PROD_DOMAIN, "qr"), (LOCAL_DOMAIN, "qr_local")):
                url = f"{domain}/{rid}/order?table={t}"
                label = f"{name} — Table {t}"
                out = os.path.join(ROOT, folder, rid, f"{rid}_table_{t}.png")
                make_qr(url, out, label)


if __name__ == "__main__":
    main()
