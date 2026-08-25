# Regression: cart, language switch, theme toggle, checkout, no console errors
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"
PY = r"C:/Users/Professional/AppData/Local/Programs/Python/Python314/python.exe"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("try{localStorage.clear();sessionStorage.clear();}catch(e){}")
    page.goto(URL, wait_until="networkidle")
    page.wait_for_selector(".item-card")
    page.wait_for_timeout(800)

    # Add first item to cart
    page.evaluate("() => document.querySelector('.item-card .add-to-cart-btn').click()")
    page.wait_for_timeout(300)
    cart_count = page.evaluate("() => document.getElementById('cartCount') ? document.getElementById('cartCount').textContent : 'n/a'")
    # open cart
    page.evaluate("() => document.getElementById('cartBtn') && document.getElementById('cartBtn').click()")
    page.wait_for_timeout(300)
    cart_modal_open = page.evaluate("() => document.getElementById('cartModal').classList.contains('active')")
    # checkout (demo)
    checkout_ok = True
    try:
        page.click("#checkoutBtn", timeout=2000)
        page.wait_for_timeout(400)
        # order modal or confirmation
        order_shown = page.evaluate("() => document.getElementById('orderModal') && document.getElementById('orderModal').classList.contains('active')")
        checkout_ok = bool(order_shown)
    except Exception as e:
        checkout_ok = False

    # language switch to VI
    page.evaluate("() => document.getElementById('langVi') && document.getElementById('langVi').click()")
    page.wait_for_timeout(300)
    lang = page.evaluate("() => document.documentElement.lang")
    nav_hint_vi = page.evaluate("() => (document.querySelector('.cat-hint .scroll-cue')||{}).textContent || ''")

    # theme toggle
    before_theme = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    page.evaluate("() => document.getElementById('themeBtn') && document.getElementById('themeBtn').click()")
    page.wait_for_timeout(200)
    after_theme = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    # language + cart preserved after theme toggle
    lang_after = page.evaluate("() => document.documentElement.lang")
    theme_ok = before_theme != after_theme and lang_after == lang

    browser.close()

    print("cart_count:", cart_count)
    print("cart_modal_open:", cart_modal_open)
    print("checkout_ok:", checkout_ok)
    print("lang after VI:", lang, "(expect vi)")
    print("cat hint VI text:", nav_hint_vi)
    print("theme before/after:", before_theme, "->", after_theme)
    print("theme preserved lang:", lang_after == lang)
    print("console errors:", errors)
    print("\nREGRESSION_OK:", cart_modal_open and checkout_ok and lang == 'vi' and theme_ok and len(errors) == 0)
