# Verify success modal: single vertical axis, centered elements, equal button widths
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"
SIZES = [320, 375, 430, 768, 1280]

def run(page, w, lang):
    # reset + add item + order + send (fast demo)
    page.evaluate("() => { try{localStorage.clear();sessionStorage.clear();}catch(e){} }")
    page.goto(URL, wait_until="networkidle")
    page.wait_for_selector(".item-card")
    page.wait_for_timeout(350)
    if lang == 'vi':
        page.evaluate("() => document.getElementById('langVi').click()")
        page.wait_for_timeout(150)
    page.evaluate("() => document.querySelector('.item-card .add-to-cart-btn').click()")
    page.wait_for_timeout(100)
    page.evaluate("() => document.getElementById('openCartBtn').click()")
    page.wait_for_timeout(150)
    page.evaluate("() => document.getElementById('placeOrderBtn').click()")
    page.wait_for_timeout(250)
    page.evaluate("() => document.getElementById('sendOrderBtn').click()")
    page.wait_for_timeout(700)

    data = page.evaluate("""() => {
        const mc = document.querySelector('#successModal .modal-content').getBoundingClientRect();
        const center = mc.left + mc.width/2;
        const sel = ['.success-icon','#successTitle','.success-order-no','.success-thanks','.success-review-prompt','#googleReviewBtn','#backToMenuBtn'];
        const elems = sel.map(s => {
            const el = document.querySelector(s);
            const r = el.getBoundingClientRect();
            return { s, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), cx: Math.round(r.left + r.width/2) };
        });
        const gr = document.getElementById('googleReviewBtn').getBoundingClientRect();
        const bm = document.getElementById('backToMenuBtn').getBoundingClientRect();
        return { center: Math.round(center), elems, grW: Math.round(gr.width), bmW: Math.round(bm.width),
                 promptText: document.querySelector('.success-review-prompt').textContent };
    }""")
    # each element center should match modal center within tolerance
    tol = 2
    aligned = all(abs(e['cx'] - data['center']) <= tol for e in data['elems'])
    widths_equal = abs(data['grW'] - data['bmW']) <= 1
    # all within modal content bounds (no overflow)
    within = all(e['left'] >= data['center'] - data['elems'][0]['w'] and e['right'] <= data['center'] + data['elems'][0]['w'] for e in data['elems'])
    return aligned, widths_equal, data

with sync_playwright() as p:
    browser = p.chromium.launch()
    all_ok = True
    for lang in ['en', 'vi']:
        for w in SIZES:
            ctx = browser.new_context(viewport={"width": w, "height": 800}, is_mobile=(w<600), has_touch=(w<600))
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            aligned, widths_equal, data = run(page, w, lang)
            print(f"lang={lang} w={w} center={data['center']} aligned={aligned} btnW_eq={widths_equal} "
                  f"grW={data['grW']} bmW={data['bmW']} prompt={data['promptText'][:30]!r}")
            if not (aligned and widths_equal and len(errors)==0):
                all_ok = False
                print("   ERRORS:", errors)
            ctx.close()
    browser.close()
    print("\nALL OK:", all_ok)
