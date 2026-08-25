import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080/index.html"
errors = []
results = {}

def switch_lang(page, lang):
    # set language via the actual button click only when no modal overlay blocks it
    page.evaluate("lang => window.__forceLang ? window.__forceLang(lang) : null", lang)
    # fallback: directly call switchLanguage if exposed
    page.evaluate("lang => { if (typeof switchLanguage === 'function') switchLanguage(lang); }", lang)
    page.wait_for_timeout(250)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)

    results["categories"] = page.eval_on_selector_all(".category-btn", "els => els.length")
    results["first_cat_cards"] = page.eval_on_selector_all(".item-card", "els => els.length")
    results["broken_in_first_cat"] = page.eval_on_selector_all(".item-image",
        "els => els.filter(i => i.complete && i.naturalWidth === 0).length")

    # VI switch (no modal open)
    switch_lang(page, "vi")
    results["vi_first_cat_name"] = page.eval_on_selector(".category-btn", "e => e.textContent")
    results["vi_view_cart_btn"] = page.eval_on_selector("#openCartBtn", "e => e.textContent")
    switch_lang(page, "en")
    results["en_view_cart_btn"] = page.eval_on_selector("#openCartBtn", "e => e.textContent")

    # Add 3 different items
    for i in range(3):
        page.click(f".item-card:nth-child({i+1}) .add-to-cart-btn")
        page.wait_for_timeout(150)
    results["cart_count_after_3"] = page.eval_on_selector("#cartItemCount", "e => e.textContent")
    results["cart_total_after_3"] = page.eval_on_selector("#cartTotalAmount", "e => e.textContent")
    results["cart_summary_visible"] = page.eval_on_selector("#cartSummary", "e => getComputedStyle(e).display")

    # Open cart
    page.click("#openCartBtn"); page.wait_for_timeout(400)
    results["cart_modal_items"] = page.eval_on_selector_all("#cartItemsList .cart-item", "els => els.length")

    page.eval_on_selector_all("#cartItemsList .cart-item:first-child .cart-quantity-btn",
        "btns => btns[1].click()")
    page.wait_for_timeout(200)
    results["qty_after_plus"] = page.eval_on_selector("#cartItemsList .cart-item:first-child .cart-quantity", "e => e.textContent")
    results["total_after_plus"] = page.eval_on_selector("#cartTotalFinal", "e => e.textContent")

    page.eval_on_selector_all("#cartItemsList .cart-item:first-child .cart-quantity-btn",
        "btns => btns[0].click()")
    page.wait_for_timeout(200)
    results["qty_after_minus"] = page.eval_on_selector("#cartItemsList .cart-item:first-child .cart-quantity", "e => e.textContent")

    if results["cart_modal_items"] >= 2:
        page.click("#cartItemsList .cart-item:nth-child(2) .cart-item-remove")
        page.wait_for_timeout(200)
        results["cart_items_after_remove"] = page.eval_on_selector_all("#cartItemsList .cart-item", "els => els.length")
    else:
        results["cart_items_after_remove"] = "skipped"

    # Switch to VI via evaluate (cart modal still open, button blocked) then place order
    switch_lang(page, "vi")
    page.click("#placeOrderBtn"); page.wait_for_timeout(400)
    results["order_number"] = page.eval_on_selector("#orderNumber", "e => e.textContent")
    results["order_total"] = page.eval_on_selector("#orderTotalFinal", "e => e.textContent")
    results["order_items"] = page.eval_on_selector_all("#orderItemsList .cart-item", "els => els.length")
    results["vi_order_title"] = page.eval_on_selector("#orderModalBody .modal-title", "e => e.textContent")
    results["vi_send_btn"] = page.eval_on_selector("#sendOrderBtn", "e => e.textContent")

    page.click("#sendOrderBtn"); page.wait_for_timeout(600)
    results["success_modal_open"] = page.eval_on_selector("#successModal", "e => e.classList.contains('active')")
    results["success_title_vi"] = page.eval_on_selector("#successTitle", "e => e.textContent")
    results["success_thanks_vi"] = page.eval_on_selector("#successThanks", "e => e.textContent")
    results["google_btn_vi"] = page.eval_on_selector("#googleReviewBtn", "e => e.textContent")

    switch_lang(page, "en")
    results["success_title_en"] = page.eval_on_selector("#successTitle", "e => e.textContent")
    results["google_btn_en"] = page.eval_on_selector("#googleReviewBtn", "e => e.textContent")

    results["mobile_cards_visible"] = page.eval_on_selector_all(".item-card", "els => els.filter(e=>e.offsetParent!==null).length")

    browser.close()

print(json.dumps(results, ensure_ascii=False, indent=2))
print("\n=== CONSOLE/PAGE ERRORS ===")
print("\n".join(errors) if errors else "NONE")
