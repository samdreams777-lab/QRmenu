import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080/index.html"
report = {"per_category": {}, "total_broken": 0, "total_cards": 0}

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_timeout(1500)
    n_cats = pg.eval_on_selector_all(".category-btn", "e => e.length")
    for i in range(n_cats):
        pg.eval_on_selector_all(".category-btn", f"els => els[{i}].click()")
        pg.wait_for_timeout(300)
        cards = pg.eval_on_selector_all(".item-card", "e => e.length")
        broken = pg.eval_on_selector_all(".item-image",
            "els => els.filter(im => im.complete && im.naturalWidth === 0).length")
        cat_name = pg.eval_on_selector_all(".category-btn", f"els => els[{i}].textContent")
        report["per_category"][cat_name] = {"cards": cards, "broken": broken}
        report["total_broken"] += broken
        report["total_cards"] += cards
    b.close()

print(json.dumps(report, ensure_ascii=False, indent=2))
