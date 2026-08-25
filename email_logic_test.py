# Verify EmailJS-based sendOrder per strict TZ:
#  - no false success when EmailJS keys missing
#  - cart cleared ONLY on real success (emailjs.send resolves)
#  - double-click protection (emailjs.send called once)
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"

def new_page(browser):
    ctx = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    ctx.add_init_script("try{localStorage.clear();sessionStorage.clear();}catch(e){}")
    page = ctx.new_page(); errs=[]
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    page.wait_for_selector(".item-card"); page.wait_for_timeout(350)
    return ctx, page, errs

def add_two(page):
    page.evaluate("() => document.querySelectorAll('.item-card')[0].querySelector('.add-to-cart-btn').click()")
    page.wait_for_timeout(80)
    page.evaluate("() => document.querySelectorAll('.item-card')[1].querySelector('.add-to-cart-btn').click()")
    page.wait_for_timeout(80)

def to_order(page):
    page.evaluate("() => document.getElementById('openCartBtn').click()"); page.wait_for_timeout(150)
    page.evaluate("() => document.getElementById('placeOrderBtn').click()"); page.wait_for_timeout(250)

with sync_playwright() as p:
    browser = p.chromium.launch()
    R={}

    # [A] No EmailJS keys -> NO false success, error shown, cart kept
    ctx, page, errs = new_page(browser)
    add_two(page); cb = page.evaluate("() => document.getElementById('cartItemCount').textContent")
    to_order(page)
    page.evaluate("() => document.getElementById('sendOrderBtn').click()")
    page.wait_for_timeout(700)
    R['A_success'] = page.evaluate("() => document.getElementById('successModal').classList.contains('active')")
    R['A_err'] = page.evaluate("() => { const e=document.getElementById('orderError'); return !!(e && e.style.display!=='none'); }")
    R['A_cart'] = page.evaluate("() => document.getElementById('cartItemCount').textContent")
    ctx.close()

    # [B] Mock emailjs.send resolve -> success + cart cleared
    ctx, page, errs = new_page(browser)
    add_two(page); to_order(page)
    page.evaluate("""() => {
        window.emailjs = { init(){}, send(){ return Promise.resolve({status:200, text:'OK'}); } };
        // make config look configured so reject-before-send doesn't fire
        window.ORDER_DELIVERY.emailjs = { publicKey:'x', serviceId:'y', templateId:'z' };
    }""")
    page.evaluate("() => document.getElementById('sendOrderBtn').click()")
    page.wait_for_timeout(700)
    R['B_success'] = page.evaluate("() => document.getElementById('successModal').classList.contains('active')")
    R['B_cart'] = page.evaluate("() => document.getElementById('cartItemCount').textContent")
    R['B_no'] = page.evaluate("() => document.getElementById('successOrderNumber').textContent")
    ctx.close()

    # [C] Double-click -> emailjs.send called exactly once
    ctx, page, errs = new_page(browser)
    add_two(page); to_order(page)
    page.evaluate("""() => {
        window.__c = 0;
        window.emailjs = { init(){}, send(){ window.__c++; return new Promise(r=>setTimeout(()=>r({status:200}),400)); } };
        window.ORDER_DELIVERY.emailjs = { publicKey:'x', serviceId:'y', templateId:'z' };
    }""")
    page.evaluate("() => { document.getElementById('sendOrderBtn').click(); document.getElementById('sendOrderBtn').click(); }")
    page.wait_for_timeout(800)
    R['C_count'] = page.evaluate("() => window.__c || 0")
    ctx.close()

    browser.close()
    print("A:", R['A_success'], R['A_err'], cb, "->", R['A_cart'])
    print("B:", R['B_success'], R['B_cart'], R['B_no'])
    print("C: emailjs.send called", R['C_count'])
    ok = (R['A_success'] is False and R['A_err'] is True and R['A_cart']==cb
          and R['B_success'] is True and R['B_cart']=='0' and R['B_no'].startswith('Order #: CC-')
          and R['C_count']==1)
    print("\nALL OK:", ok)
