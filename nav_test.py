# Mobile navigation verification for Common Coffee QR menu
# Criteria from task spec: single horizontal row, swipe, arrows scroll ~250px,
# edge hide, fade cue, 320-430px widths, no wrap to 2nd row, height ~56px.
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"

WIDTHS = [320, 375, 390, 414, 430]
results = []

with sync_playwright() as p:
    browser = p.chromium.launch()

    for w in WIDTHS:
        ctx = browser.new_context(viewport={"width": w, "height": 844},
                                  is_mobile=True, has_touch=True)
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.add_init_script("try{sessionStorage.removeItem('cc-catnudge');}catch(e){}")
        page.goto(URL, wait_until="networkidle")
        page.wait_for_selector(".category-btn")
        # wait for intro nudge to finish completely
        page.wait_for_timeout(1400)

        nav = page.query_selector("#categoriesNav")
        nav_box = nav.bounding_box()
        nav_display = nav.evaluate("el => getComputedStyle(el).display")
        nav_wrap = nav.evaluate("el => getComputedStyle(el).flexWrap")
        nav_overflowx = nav.evaluate("el => getComputedStyle(el).overflowX")
        nav_h = nav_box["height"]
        # ensure back at start
        nav.evaluate("el => el.scrollTo({left:0, behavior:'instant'})")
        page.wait_for_timeout(200)

        rows = page.evaluate("""() => {
            const btns = [...document.querySelectorAll('#categoriesNav .category-btn')];
            const tops = new Set(btns.map(b => Math.round(b.getBoundingClientRect().top)));
            return { count: btns.length, rows: tops.size };
        }""")

        scroll_w = nav.evaluate("el => el.scrollWidth")
        client_w = nav.evaluate("el => el.clientWidth")
        overflow = scroll_w - client_w

        right_hidden_start = page.evaluate("() => document.getElementById('catArrowRight').hidden")
        left_hidden_start = page.evaluate("() => document.getElementById('catArrowLeft').hidden")

        before = nav.evaluate("el => el.scrollLeft")
        page.click("#catArrowRight", timeout=3000)
        page.wait_for_timeout(700)
        after = nav.evaluate("el => el.scrollLeft")
        scrolled = after - before

        nav.evaluate("el => el.scrollTo({left: el.scrollWidth, behavior:'instant'})")
        page.wait_for_timeout(400)
        right_hidden_end = page.evaluate("() => document.getElementById('catArrowRight').hidden")
        left_hidden_end = page.evaluate("() => document.getElementById('catArrowLeft').hidden")

        visible_at_start = page.evaluate("""() => {
            const nav = document.getElementById('categoriesNav');
            const nb = nav.getBoundingClientRect();
            return [...document.querySelectorAll('#categoriesNav .category-btn')]
                .filter(b => { const r = b.getBoundingClientRect();
                    return r.left < nb.right && r.right > nb.left; }).length;
        }""")

        ok = (nav_display == "flex" and nav_wrap == "nowrap"
              and rows["rows"] == 1 and overflow > 4
              and not right_hidden_start and left_hidden_start
              and scrolled > 150 and right_hidden_end and not left_hidden_end
              and 40 <= nav_h <= 80 and len(errors) == 0)

        results.append({
            "w": w, "display": nav_display, "wrap": nav_wrap,
            "rows": rows["rows"], "btns": rows["count"], "overflow": overflow,
            "navH": round(nav_h), "rightHiddenStart": right_hidden_start,
            "leftHiddenStart": left_hidden_start, "scrolledByArrow": scrolled,
            "rightHiddenEnd": right_hidden_end, "leftHiddenEnd": left_hidden_end,
            "visibleAtStart": visible_at_start, "errors": errors, "PASS": ok,
        })
        ctx.close()

    browser.close()

print(f"{'W':>4} {'disp':>5} {'wrap':>5} {'rows':>4} {'btns':>4} "
      f"{'ovf':>5} {'navH':>4} {'rHidS':>5} {'lHidS':>5} {'scrl':>5} "
      f"{'rHidE':>5} {'lHidE':>5} {'vis':>3} {'err':>3} {'PASS':>4}")
for r in results:
    print(f"{r['w']:>4} {r['display']:>5} {r['wrap']:>5} {r['rows']:>4} "
          f"{r['btns']:>4} {r['overflow']:>5} {r['navH']:>4} "
          f"{str(r['rightHiddenStart']):>5} {str(r['leftHiddenStart']):>5} "
          f"{r['scrolledByArrow']:>5} {str(r['rightHiddenEnd']):>5} "
          f"{str(r['leftHiddenEnd']):>5} {r['visibleAtStart']:>3} "
          f"{len(r['errors']):>3} {str(r['PASS']):>4}")
    if r['errors']:
        for e in r['errors']:
            print("    ERR:", e)

all_pass = all(r['PASS'] for r in results)
print("\nALL PASS:", all_pass)
