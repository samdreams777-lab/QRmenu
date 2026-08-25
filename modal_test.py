# Modal responsive verification: full order flow + size checks across resolutions
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"

SIZES = [
    (360, 800), (390, 844), (768, 1024),
    (1280, 720), (1366, 768), (1920, 1080),
]

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        report = []
        for (w, h) in SIZES:
            is_mobile = w < 600
            ctx = browser.new_context(
                viewport={"width": w, "height": h},
                is_mobile=is_mobile, has_touch=is_mobile)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script("try{localStorage.clear();sessionStorage.clear();}catch(e){}")
            page.goto(URL, wait_until="networkidle")
            page.wait_for_selector(".item-card")
            page.wait_for_timeout(600)

            # Add 3 distinct items to cart
            cards = page.query_selector_all(".item-card")
            n = min(3, len(cards))
            for i in range(n):
                page.evaluate(f"(i) => document.querySelectorAll('.item-card')[i].querySelector('.add-to-cart-btn').click()", i)
                page.wait_for_timeout(120)
            # open cart
            page.evaluate("() => document.getElementById('openCartBtn').click()")
            page.wait_for_timeout(300)
            cart_active = page.evaluate("() => document.getElementById('cartModal').classList.contains('active')")

            def box(sel):
                el = page.query_selector(sel)
                return el.bounding_box() if el else None

            cb = box("#cartModal .modal-content")
            cw = cb["width"] if cb else 0
            # widths expected: mobile ~90-94vw ; desktop ~580px ; not overflow
            vw = w
            mobile_ok = is_mobile and (cw >= vw*0.88) and (cw <= vw*0.96)
            desktop_ok = (not is_mobile) and (520 <= cw <= 640)
            no_horiz_overflow = cb and (cb["x"] >= -1) and (cb["x"] + cw <= vw + 1)
            within_vh = cb and (cb["height"] <= h * 0.95) and (cb["y"] >= -1)

            # place order
            page.evaluate("() => document.getElementById('placeOrderBtn').click()")
            page.wait_for_timeout(400)
            order_active = page.evaluate("() => document.getElementById('orderModal').classList.contains('active')")
            ob = box("#orderModal .modal-content")
            ow = ob["width"] if ob else 0
            order_items = page.evaluate("() => document.querySelectorAll('#orderItemsList .order-line').length")
            order_total = page.evaluate("() => document.getElementById('orderTotalFinal').textContent")
            order_no = page.evaluate("() => document.getElementById('orderNumber').textContent")

            # (send-order interaction is covered by email_logic_test.py; here we only
            # verify responsive layout, so we do NOT click send — avoids an expected
            # console.error when EmailJS keys are not configured)
            review_btn = page.evaluate("() => !!document.getElementById('googleReviewBtn')")
            back_btn = page.evaluate("() => !!document.getElementById('backToMenuBtn')")
            success_active = False
            success_closed = True

            size_ok = no_horiz_overflow and within_vh and (mobile_ok or desktop_ok)
            # flow: cart -> order opened with correct items/total/number (no false success dependency)
            flow_ok = cart_active and order_active and order_items == n and order_total and order_no.startswith('CC-')
            all_ok = size_ok and flow_ok and len(errors) == 0

            # success modal sizing (open directly to verify responsive layout only)
            page.evaluate("() => { const m=document.getElementById('successModal'); m.classList.add('active'); }")
            page.wait_for_timeout(150)
            sb = box("#successModal .modal-content")
            sw = sb["width"] if sb else 0
            sm_no_horiz = sb and (sb["x"] >= -1) and (sb["x"] + sw <= vw + 1)
            sm_within = sb and (sb["height"] <= h * 0.95)
            sm_ok = sm_no_horiz and sm_within and ((is_mobile and sw >= vw*0.88 and sw <= vw*0.96) or ((not is_mobile) and sw >= 440 and sw <= 640))
            page.evaluate("() => { document.getElementById('successModal').classList.remove('active'); }")

            report.append({
                "sz": f"{w}x{h}", "contentW": round(cw), "orderW": round(ow), "successW": round(sw),
                "mobile_ok": mobile_ok, "desktop_ok": desktop_ok, "noOverflow": no_horiz_overflow,
                "withinVH": within_vh, "orderItems": order_items, "total": order_total, "orderNo": order_no,
                "flow_ok": flow_ok, "successOk": sm_ok, "errors": len(errors), "PASS": all_ok and sm_ok,
            })
            ctx.close()
        browser.close()

        print(f"{'size':>10} {'cW':>4} {'oW':>4} {'sW':>4} {'mob':>4} {'dtp':>4} {'ofl':>4} {'vh':>4} {'items':>5} {'flow':>4} {'sOk':>4} {'err':>3} {'PASS':>4}")
        for r in report:
            print(f"{r['sz']:>10} {r['contentW']:>4} {r['orderW']:>4} {r['successW']:>4} "
                  f"{str(r['mobile_ok']):>4} {str(r['desktop_ok']):>4} {str(r['noOverflow']):>4} "
                  f"{str(r['withinVH']):>4} {r['orderItems']:>5} {str(r['flow_ok']):>4} "
                  f"{str(r['successOk']):>4} {r['errors']:>3} {str(r['PASS']):>4}")
        print("\nALL PASS:", all(r["PASS"] for r in report))

run()
