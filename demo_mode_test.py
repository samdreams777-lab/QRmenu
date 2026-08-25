# Verify DEMO MODE order flow per TZ:
#  - Send Order -> success (no error, no email/backend call)
#  - correct order number shown
#  - Leave a Google Review opens existing maps link
#  - responsive: mobile/tablet/desktop/large
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"
SIZES = [360, 768, 1280, 1920]
MAPS_URL = "https://www.google.com/maps/place/CAMON+COFFEE/@16.809984,107.1087616,13z/data=!4m8!3m7!1s0x3140e5d3dc99dcc1:0x85b106b6b49a58b4!8m2!3d16.8131413!4d107.1023573!9m1!1b1!16s%2Fg%2F11gl15sm7b4"

def check(browser, w, h):
    ctx = browser.new_context(viewport={"width":w,"height":h}, is_mobile=w<700, has_touch=w<700)
    ctx.add_init_script("try{localStorage.clear();sessionStorage.clear();}catch(e){}")
    page = ctx.new_page(); errs=[]
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    page.add_init_script("""() => {
        window.__opens = [];
        window.open = (u, n, f) => { window.__opens.push(u); return null; };
    }""")
    page.goto(URL, wait_until="networkidle")
    page.wait_for_selector(".item-card"); page.wait_for_timeout(300)

    # add two items
    page.evaluate("() => document.querySelectorAll('.item-card')[0].querySelector('.add-to-cart-btn').click()")
    page.wait_for_timeout(60)
    page.evaluate("() => document.querySelectorAll('.item-card')[1].querySelector('.add-to-cart-btn').click()")
    page.wait_for_timeout(120)

    # cart -> place order
    page.evaluate("() => document.getElementById('openCartBtn').click()"); page.wait_for_timeout(120)
    page.evaluate("() => document.getElementById('placeOrderBtn').click()"); page.wait_for_timeout(200)
    order_no = page.evaluate("() => document.getElementById('orderNumber').textContent")

    # send order (DEMO)
    page.evaluate("() => document.getElementById('sendOrderBtn').click()")
    page.wait_for_timeout(400)
    success_active = page.evaluate("() => document.getElementById('successModal').classList.contains('active')")
    title = page.evaluate("() => document.getElementById('successTitle').textContent")
    shown_no = page.evaluate("() => document.getElementById('successOrderNumber').textContent")
    # no error element should exist or be visible
    err_visible = page.evaluate("() => { const e=document.getElementById('orderError'); return !!(e && e.style.display!=='none'); }")
    # order number matches between screens
    no_match = (order_no in shown_no) and shown_no.startswith("Order #:")
    # google review button present + opens maps
    gbtn = page.evaluate("() => !!document.getElementById('googleReviewBtn')")
    opened = page.evaluate("""() => {
        let captured = null;
        const orig = window.open;
        window.open = (u) => { captured = u; return null; };
        document.getElementById('googleReviewBtn').click();
        window.open = orig;
        return captured;
    }""")
    maps_ok = MAPS_URL.split("CAMON+COFFEE")[0] in (opened or "")

    # success modal sizing
    sb = page.evaluate("""() => { const m=document.getElementById('successModal'); m.classList.add('active');
        const c=m.querySelector('.modal-content').getBoundingClientRect();
        const vw=window.innerWidth, vh=window.innerHeight;
        return {w:c.width,h:c.height,x:c.x,right:c.x+c.width,top:c.y,bottom:c.y+c.height,vw,vh}; }""")
    no_overflow = sb["x"] >= -1 and sb["right"] <= sb["vw"]+1 and sb["top"] >= -1 and sb["bottom"] <= sb["vh"]+1
    # desktop/large: modal not tiny (<400) and not full screen
    size_ok = sb["w"] >= min(420, sb["vw"]*0.9) and sb["w"] <= sb["vw"]*0.97 and sb["h"] <= sb["vh"]*0.95
    buttons_visible = page.evaluate("() => { const b=document.getElementById('backToMenuBtn').getBoundingClientRect(); return b.bottom <= window.innerHeight+1 && b.top >= 0; }")

    ctx.close()
    return {
        "sz": f"{w}x{h}", "success": success_active, "title": title[:20],
        "no_match": no_match, "err": err_visible, "gbtn": gbtn, "maps": maps_ok,
        "overflow": no_overflow, "size_ok": size_ok, "btns": buttons_visible,
        "errs": len(errs), "n_errs": errs[:2]
    }

with sync_playwright() as p:
    browser = p.chromium.launch()
    rows = [check(browser, w, 844 if w<1000 else 900) for w in SIZES]
    browser.close()
    print(f"{'size':>10} {'succ':>4} {'noMt':>4} {'err':>4} {'gbtn':>4} {'maps':>4} {'ofl':>4} {'szOk':>4} {'btns':>4} {'e':>3}")
    for r in rows:
        print(f"{r['sz']:>10} {str(r['success']):>4} {str(r['no_match']):>4} {str(r['err']):>4} {str(r['gbtn']):>4} {str(r['maps']):>4} {str(r['overflow']):>4} {str(r['size_ok']):>4} {str(r['btns']):>4} {r['errs']:>3}")
        if r['errs']: print("   ", r['n_errs'])
    ok = all(r["success"] and r["no_match"] and (not r["err"]) and r["gbtn"] and r["maps"] and r["overflow"] and r["size_ok"] and r["btns"] and r["errs"]==0 for r in rows)
    print("\nALL OK:", ok)
