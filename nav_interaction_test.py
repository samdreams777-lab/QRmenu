# Interaction checks: touch swipe, category click, desktop DevTools 375px
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"

with sync_playwright() as p:
    browser = p.chromium.launch()

    # --- Touch swipe + category click (mobile 390) ---
    ctx = browser.new_context(viewport={"width": 390, "height": 844},
                              is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.add_init_script("try{sessionStorage.removeItem('cc-catnudge');}catch(e){}")
    page.goto(URL, wait_until="networkidle")
    page.wait_for_selector(".category-btn")
    page.wait_for_timeout(1400)

    nav = page.query_selector("#categoriesNav")
    box = nav.bounding_box()
    cy = box["y"] + box["height"] / 2
    # Real touch swipe via CDP Input.dispatchTouchEvent (leftward drag)
    client = ctx.new_cdp_session(page)
    x_start = box["x"] + box["width"] - 50
    x_end = box["x"] + 50
    client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x_start, "y": cy}]})
    steps = 12
    for i in range(1, steps + 1):
        xi = x_start + (x_end - x_start) * i / steps
        client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": xi, "y": cy}]})
        page.wait_for_timeout(15)
    client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(500)
    swipe_scroll = nav.evaluate("el => el.scrollLeft")

    # click 4th category -> items render, active class moves
    btns = page.query_selector_all("#categoriesNav .category-btn")
    btns[3].click()
    page.wait_for_timeout(300)
    active_idx = page.evaluate("""() => {
        const b = [...document.querySelectorAll('#categoriesNav .category-btn')];
        return b.findIndex(x => x.classList.contains('active'));
    }""")
    items_visible = page.evaluate("() => document.querySelectorAll('.item-card').length")

    print("SWIPE scrollLeft after drag:", swipe_scroll, "(>0 means swipe works)")
    print("Clicked category index:", active_idx, "(expect 3)")
    print("Items rendered for that category:", items_visible)

    # --- Desktop DevTools 375px emulation ---
    ctx2 = browser.new_context(viewport={"width": 375, "height": 720})
    page2 = ctx2.new_page()
    page2.add_init_script("try{sessionStorage.removeItem('cc-catnudge');}catch(e){}")
    page2.goto(URL, wait_until="networkidle")
    page2.wait_for_selector(".category-btn")
    page2.wait_for_timeout(1400)
    nav2 = page2.query_selector("#categoriesNav")
    drows = page2.evaluate("""() => {
        const btns = [...document.querySelectorAll('#categoriesNav .category-btn')];
        return new Set(btns.map(b => Math.round(b.getBoundingClientRect().top))).size;
    }""")
    doverflow = nav2.evaluate("el => el.scrollWidth - el.clientWidth")
    dright = page2.evaluate("() => !document.getElementById('catArrowRight').hidden")
    print("DESKTOP 375px rows:", drows, "overflow:", doverflow, "rightArrowVisible:", dright)

    browser.close()

    swipe_ok = swipe_scroll > 20
    click_ok = active_idx == 3 and items_visible > 0
    desktop_ok = drows == 1 and doverflow > 4 and dright
    print("\nSWIPE_OK:", swipe_ok, "| CLICK_OK:", click_ok, "| DESKTOP_OK:", desktop_ok)
    print("ALL_INTERACTION_OK:", swipe_ok and click_ok and desktop_ok)
