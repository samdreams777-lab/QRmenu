# Verify Complete Order line structure: fixed right price column alignment
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8080/index.html"

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors_all = []
    results = []

    for n in [1, 2, 4, 8, 12]:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        ctx.add_init_script("try{localStorage.clear();sessionStorage.clear();}catch(e){}")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors_all.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_selector(".item-card")
        page.wait_for_timeout(400)
        # add n distinct items across categories
        cat_btns = page.query_selector_all("#categoriesNav .category-btn")
        added = 0
        ci = 0
        while added < n and ci < len(cat_btns):
            # click category ci
            page.evaluate(f"(i) => document.querySelectorAll('#categoriesNav .category-btn')[i].click()", ci)
            page.wait_for_timeout(150)
            cards = page.query_selector_all(".item-card")
            if cards:
                page.evaluate("() => document.querySelector('.item-card .add-to-cart-btn').click()")
                page.wait_for_timeout(80)
                added += 1
            else:
                # no cards in this category: click first card of previous to add qty
                if ci > 0:
                    page.evaluate("() => document.querySelectorAll('#categoriesNav .category-btn')[0].click()")
                    page.wait_for_timeout(120)
                    page.evaluate("() => document.querySelector('.item-card .add-to-cart-btn').click()")
                    page.wait_for_timeout(80)
                    added += 1
            ci += 1
        page.evaluate("() => document.getElementById('openCartBtn').click()")
        page.wait_for_timeout(200)
        page.evaluate("() => document.getElementById('placeOrderBtn').click()")
        page.wait_for_timeout(300)

        data = page.evaluate("""() => {
            const lines = [...document.querySelectorAll('#orderItemsList .order-line')];
            const rights = lines.map(l => {
                const pr = l.querySelector('.order-line-price').getBoundingClientRect();
                return { right: Math.round(pr.right) };
            });
            return {
                count: lines.length,
                rights: rights.map(r => r.right),
                total: document.getElementById('orderTotalFinal').textContent
            };
        }""")
        rights = data["rights"]
        aligned = len(set(rights)) <= 1 if rights else False
        max_right = max(rights) if rights else 0
        price_at_edge = all(r == max_right for r in rights) if rights else False
        results.append({
            "n": n, "count": data["count"], "aligned": aligned,
            "price_at_edge": price_at_edge, "rights": rights, "total": data["total"],
        })
        print(f"items={n} rendered={data['count']} rights={rights} aligned={aligned} edge={price_at_edge} total={data['total']}")
        ctx.close()

    browser.close()
    all_ok = all(r["aligned"] and r["price_at_edge"] and r["count"] >= 1 for r in results) and len(errors_all) == 0
    print("\nERRORS:", errors_all)
    print("ALL OK:", all_ok)
