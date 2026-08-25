import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080/index.html"
errors = []
R = {}

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_timeout(1500)

    # K1: theme toggle + gradient direction
    R["theme_initial"] = pg.eval_on_selector("html", "e => e.getAttribute('data-theme')")
    R["grad_light"] = pg.eval_on_selector(".menu-header", "e => getComputedStyle(e).backgroundImage")
    pg.click("#themeBtn"); pg.wait_for_timeout(300)
    R["theme_after_toggle"] = pg.eval_on_selector("html", "e => e.getAttribute('data-theme')")
    R["grad_dark"] = pg.eval_on_selector(".menu-header", "e => getComputedStyle(e).backgroundImage")
    R["grad_changed"] = R["grad_light"] != R["grad_dark"]

    # K2: persistence after reload
    pg.reload(wait_until="networkidle"); pg.wait_for_timeout(1200)
    R["theme_after_reload"] = pg.eval_on_selector("html", "e => e.getAttribute('data-theme')")

    # K3: cart + language preserved across theme switch
    # add 3 items
    for i in range(3):
        pg.click(f".item-card:nth-child({i+1}) .add-to-cart-btn"); pg.wait_for_timeout(120)
    R["cart_before_theme"] = pg.eval_on_selector("#cartItemCount", "e => e.textContent")
    R["lang_before"] = pg.eval_on_selector("html", "e => e.getAttribute('lang')")
    pg.click("#themeBtn"); pg.wait_for_timeout(300)  # toggle to dark
    R["cart_after_theme"] = pg.eval_on_selector("#cartItemCount", "e => e.textContent")
    R["lang_after"] = pg.eval_on_selector("html", "e => e.getAttribute('lang')")
    R["cart_preserved"] = R["cart_before_theme"] == R["cart_after_theme"]
    R["lang_preserved"] = R["lang_before"] == R["lang_after"]

    # K4: arrows scroll + hint visible + swipe still works
    R["hint_visible"] = pg.eval_on_selector(".cat-hint", "e => getComputedStyle(e).display != 'none'")
    R["hint_text_en"] = pg.eval_on_selector(".cat-hint", "e => e.textContent")
    before = pg.eval_on_selector("#categoriesNav", "e => e.scrollLeft")
    pg.click("#catArrowRight"); pg.wait_for_timeout(500)
    after = pg.eval_on_selector("#categoriesNav", "e => e.scrollLeft")
    R["arrow_scrolled"] = after > before
    # swipe (touch) still attached: simulate via dispatching no error
    R["arrow_left_exists"] = pg.eval_on_selector("#catArrowLeft", "e => !!e")
    R["arrow_right_exists"] = pg.eval_on_selector("#catArrowRight", "e => !!e")

    # K6: structure unchanged — still 11 categories, 56 cards
    R["categories"] = pg.eval_on_selector_all(".category-btn", "e => e.length")
    R["cards"] = pg.eval_on_selector_all(".item-card", "e => e.length")
    R["broken_imgs"] = pg.eval_on_selector_all(".item-image", "e => e.filter(i => i.complete && i.naturalWidth === 0).length")

    b.close()

print(json.dumps(R, ensure_ascii=False, indent=2))
print("\n=== ERRORS ===")
print("\n".join(errors) if errors else "NONE")
