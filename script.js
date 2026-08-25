/* AI B.O.S.S. QR Menu — JavaScript
 *
 * Phase 1 Demo additions over the original Common Coffee menu:
 *  - restaurant context (Deep Link / App Link fallback) via BossContext
 *  - anonymous session id
 *  - analytics events via BossAnalytics
 *  - order sent to backend (POST /api/order) with restaurant/table/session
 *  - non-intrusive loyalty block after order (Phase 3/4 architecture stub)
 *
 * Existing UI/UX (cart, modals, theme, language) is preserved.
 */

let menuData = null;
let currentLanguage = 'en';
let currentCategory = null;
let cart = {}; // key: `${catId}|${index}` -> { catId, idx, qty }

// ---- Context (restaurant / table / session / lang) ----
const CTX = (window.BossContext && window.BossContext.resolve) ? window.BossContext.resolve() : { restaurant_id: 'common', table_id: null, session_id: null, lang: null, device: null, source: null, campaign: null };
let RESTAURANT = { id: 'common', name: 'Common Coffee', default_lang: 'en', menu: 'data/menu.json', currency: 'VND', google_review: '' };

// ---- Fallback UI translations (for strings not in DOM) ----
const translations = {
    en: {
        no_items: 'No items available',
        empty_cart: 'Your cart is empty',
        loading: 'Loading menu...',
        add_to_cart: 'Add to Cart',
        quantity: 'Quantity',
        remove: 'Remove',
        each: 'each'
    },
    vi: {
        no_items: 'Không có món hàng',
        empty_cart: 'Giỏ hàng của bạn đang trống',
        loading: 'Đang tải thực đơn...',
        add_to_cart: 'Thêm Vào Giỏ',
        quantity: 'Số Lượng',
        remove: 'Xóa',
        each: 'mỗi'
    }
};

function t(key) {
    return (translations[currentLanguage] && translations[currentLanguage][key]) || key;
}

function syncLang() { window.__currentLang = currentLanguage; }

function formatPrice(price) {
    try {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
    } catch (e) {
        return '₫ ' + price;
    }
}

// ---- Item text helpers (always use current language) ----
function getItemName(item) {
    return currentLanguage === 'vi'
        ? (item.name_vi || item.name_en || item.name)
        : (item.name_en || item.name || item.name_vi);
}
function getItemDesc(item) {
    return currentLanguage === 'vi'
        ? (item.description_vi || item.description_en || item.description)
        : (item.description_en || item.description_vi || item.description);
}
function getCategoryName(cat) {
    if (cat.id === 'all') return currentLanguage === 'vi' ? 'Tất cả' : 'All';
    return currentLanguage === 'vi'
        ? (cat.name_vi || cat.name_en || cat.name)
        : (cat.name_en || cat.name || cat.name_vi);
}

// ---- Modifier label helpers ----
function getIceLabel(val) {
    const labels = {
        en: { normal: 'Normal ice', less: 'Less ice', none: 'No ice' },
        vi: { normal: 'Đá bình thường', less: 'Ít đá', none: 'Không đá' }
    };
    return labels[currentLanguage]?.[val] || val;
}
function getSugarLabel(val) {
    const labels = {
        en: { normal: 'Normal sugar', less: 'Less sugar', none: 'No sugar' },
        vi: { normal: 'Đường bình thường', less: 'Ít đường', none: 'Không đường' }
    };
    return labels[currentLanguage]?.[val] || val;
}
function getTempLabel(val) {
    const labels = {
        en: { hot: 'Hot', iced: 'Iced' },
        vi: { hot: 'Nóng', iced: 'Đá' }
    };
    return labels[currentLanguage]?.[val] || val;
}

// ---- Resolve item object from cart key ----
function getItemByKey(key) {
    const [catId, idxStr] = key.split('|');
    const cat = menuData.categories.find(c => c.id === catId);
    if (!cat) return null;
    return cat.items[parseInt(idxStr, 10)] || null;
}

// ---- Load restaurant config then menu ----
async function loadMenuData() {
    try {
        const cfgResp = await fetch('./api/config?restaurant=' + encodeURIComponent(CTX.restaurant_id));
        if (cfgResp.ok) {
            RESTAURANT = Object.assign(RESTAURANT, await cfgResp.json());
        }
    } catch (e) { /* keep defaults */ }

    // default language: URL ?lang= > restaurant default > 'en'
    currentLanguage = CTX.lang || RESTAURANT.default_lang || 'en';
    syncLang();

    try {
        const response = await fetch(RESTAURANT.menu);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        menuData = await response.json();

        // reflect restaurant name in UI
        const titleEl = document.getElementById('loadingCafeName');
        const headerEl = document.getElementById('cafeName');
        if (titleEl) titleEl.textContent = RESTAURANT.name;
        if (headerEl) headerEl.textContent = RESTAURANT.name;
        document.title = RESTAURANT.name + ' — QR Menu';

        document.getElementById('loadingScreen').style.display = 'none';
        document.querySelector('.menu-content').style.display = 'block';
        initializeMenu();

        // analytics: menu open + first category view
        if (window.BossAnalytics) {
            window.BossAnalytics.track('menu_open');
            if (currentCategory) window.BossAnalytics.track('category_view', { category_id: currentCategory });
        }
    } catch (error) {
        console.error('Error loading menu data:', error);
        showError();
    }
}

function initializeMenu() {
    currentCategory = 'all';
    cart = {};
    renderCategories();
    renderItems();
    updateCartSummary();
    applyStaticTranslations();
    setupEventListeners();
}

// ---- Categories ----
function renderCategories() {
    const nav = document.getElementById('categoriesNav');
    nav.innerHTML = '';
    const allCat = { id: 'all', name_en: 'All', name_vi: 'Tất cả' };
    [allCat, ...menuData.categories].forEach((cat) => {
        const btn = document.createElement('button');
        btn.className = 'category-btn' + (cat.id === currentCategory ? ' active' : '');
        btn.dataset.category = cat.id;
        btn.textContent = getCategoryName(cat);
        nav.appendChild(btn);
    });
}

// ---- Items ----
function renderItems() {
    const container = document.getElementById('itemsContainer');
    // Virtual 'all' category: flat list of every item with its real catId|idx key
    let items = [];
    if (currentCategory === 'all') {
        menuData.categories.forEach(cat => {
            cat.items.forEach((item, index) => {
                items.push({ item, key: `${cat.id}|${index}` });
            });
        });
    } else {
        const cat = menuData.categories.find(c => c.id === currentCategory);
        if (!cat || cat.items.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>${t('no_items')}</p></div>`;
            return;
        }
        cat.items.forEach((item, index) => {
            items.push({ item, key: `${cat.id}|${index}` });
        });
    }
    if (items.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>${t('no_items')}</p></div>`;
        return;
    }
    container.innerHTML = items.map(({ item, key }) => {
        const qty = cart[key] ? cart[key].qty : 0;
        const imgPath = (RESTAURANT.photos || './menu_photos/') + item.image;
        return `
            <div class="item-card" data-key="${key}" onclick="openItemDetail('${key}')">
                <div class="item-image-wrap">
                    <img src="${imgPath}" alt="" class="item-image-bg" aria-hidden="true" onerror="this.style.display='none';">
                    <img src="${imgPath}" alt="${getItemName(item)}" class="item-image"
                         onerror="this.style.display='none'; this.closest('.item-image-wrap').querySelector('.item-image-placeholder').style.display='flex';">
                    <div class="item-image-placeholder" style="display:none;">📷</div>
                </div>
                <div class="item-info">
                    <h3 class="item-name">${getItemName(item)}</h3>
                    ${getItemDesc(item) ? `<p class="item-description">${getItemDesc(item)}</p>` : ''}
                    <div class="item-price">${formatPrice(item.price)}</div>
                </div>
                <button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart('${key}')" aria-label="Add to cart">+</button>
                ${qty > 0 ? `<span class="cart-count-badge">${qty}</span>` : ''}
            </div>`;
    }).join('');
}

// ---- Cart ----
function addToCart(key) {
    if (!getItemByKey(key)) return;
    if (!cart[key]) cart[key] = { catId: key.split('|')[0], idx: parseInt(key.split('|')[1], 10), qty: 0 };
    cart[key].qty++;
    renderItems();
    updateCartSummary();
    if (window.BossAnalytics) {
        const [catId, idx] = key.split('|');
        const item = getItemByKey(key);
        window.BossAnalytics.track('add_to_cart', { product_id: key, category_id: catId, qty: cart[key].qty, value: item ? item.price * cart[key].qty : null });
    }
}

function changeCartQuantity(key, delta) {
    if (!cart[key]) return;
    const wasPositive = cart[key].qty > 0;
    cart[key].qty += delta;
    if (cart[key].qty <= 0) {
        delete cart[key];
        if (window.BossAnalytics) window.BossAnalytics.track('remove_from_cart', { product_id: key });
    }
    updateCartSummary();
    renderCartModal();
    if (wasPositive && cart[key] && window.BossAnalytics) {
        const [catId] = key.split('|');
        window.BossAnalytics.track('add_to_cart', { product_id: key, category_id: catId, qty: cart[key].qty });
    }
}

function removeFromCart(key) {
    delete cart[key];
    updateCartSummary();
    renderCartModal();
    renderItems();
    if (window.BossAnalytics) window.BossAnalytics.track('remove_from_cart', { product_id: key });
}

function clearCart() {
    cart = {};
    updateCartSummary();
    renderCartModal();
    renderItems();
}

function cartTotals() {
    let total = 0, count = 0;
    Object.keys(cart).forEach(key => {
        // Extract base key (without modifiers) - format: catId|idx|temp:x|ice:y|sugar:z
        const baseKey = key.split('|')[0] + '|' + key.split('|')[1];
        const item = getItemByKey(baseKey);
        if (item) { total += item.price * cart[key].qty; count += cart[key].qty; }
    });
    return { total, count };
}

function updateCartSummary() {
    const { total, count } = cartTotals();
    document.getElementById('cartTotalAmount').textContent = formatPrice(total);
    document.getElementById('cartItemCount').textContent = count;
    const bar = document.getElementById('cartSummary');
    if (count > 0) {
        bar.classList.add('visible');
    } else {
        bar.classList.remove('visible');
    }
}

// ---- Cart Modal ----
function openCart() {
    renderCartModal();
    document.getElementById('cartModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function renderCartModal() {
    const list = document.getElementById('cartItemsList');
    const { total, count } = cartTotals();
    const keys = Object.keys(cart);
    if (count === 0) {
        list.innerHTML = `<div class="empty-cart"><div class="empty-cart-icon">🛒</div><p>${t('empty_cart')}</p></div>`;
    } else {
        list.innerHTML = keys.map(key => {
            const cartItem = cart[key];
            // Extract base key (without modifiers) - format: catId|idx|temp:x|ice:y|sugar:z
            const baseKey = key.split('|')[0] + '|' + key.split('|')[1];
            const item = getItemByKey(baseKey);
            if (!item) return '';
            const qty = cartItem.qty;
            const lineTotal = item.price * qty;
            const imgPath = (RESTAURANT.photos || './menu_photos/') + item.image;
            
            // Build modifiers display
            let modifiersHtml = '';
            if (cartItem.modifiers) {
                const modLabels = [];
                if (cartItem.modifiers.temperature) {
                    modLabels.push(getTempLabel(cartItem.modifiers.temperature));
                }
                if (cartItem.modifiers.ice) {
                    modLabels.push(getIceLabel(cartItem.modifiers.ice));
                }
                if (cartItem.modifiers.sugar) {
                    modLabels.push(getSugarLabel(cartItem.modifiers.sugar));
                }
                if (modLabels.length > 0) {
                    modifiersHtml = `<div class="cart-item-modifiers">${modLabels.join(' • ')}</div>`;
                }
            }
            
            return `
                <div class="cart-item">
                    <img src="${imgPath}" alt="${getItemName(item)}" class="cart-item-img"
                         onerror="this.style.display='none';">
                    <div class="cart-item-main">
                        <div class="cart-item-name">${getItemName(item)}${modifiersHtml}</div>
                        <div class="cart-item-price">${formatPrice(lineTotal)}</div>
                        <div class="cart-item-controls">
                            <button class="cart-quantity-btn" onclick="changeCartQuantity('${key}', -1)">−</button>
                            <span class="cart-quantity">${qty}</span>
                            <button class="cart-quantity-btn" onclick="changeCartQuantity('${key}', 1)">+</button>
                            <button class="cart-item-remove" onclick="removeFromCart('${key}')">${t('remove')}</button>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }
    document.getElementById('cartTotalFinal').textContent = formatPrice(total);
}

// ---- Language switch ----
function switchLanguage(lang) {
    currentLanguage = lang;
    syncLang();
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    renderCategories();  // Re-render categories including virtual 'all' category
    applyStaticTranslations();
    renderItems();
    // Re-render item modal if open to update modifier labels
    const itemModal = document.getElementById('itemModal');
    if (itemModal && itemModal.classList.contains('active')) {
        // Find which item is currently displayed
        const modalBody = document.getElementById('itemModalBody');
        const title = modalBody.querySelector('.modal-title');
        if (title) {
            // Find the item by name (not perfect but works for demo)
            const allItems = [];
            menuData.categories.forEach(cat => {
                cat.items.forEach((item, idx) => {
                    allItems.push({ item, key: `${cat.id}|${idx}` });
                });
            });
            const found = allItems.find(({ item }) => getItemName(item) === title.textContent);
            if (found) {
                openItemDetail(found.key);
            }
        }
    }
    if (document.getElementById('cartModal').classList.contains('active')) renderCartModal();
    if (document.getElementById('orderModal').classList.contains('active')) renderOrderModal();
}

function applyStaticTranslations() {
    document.querySelectorAll('[data-en]').forEach(el => {
        const text = el.dataset[currentLanguage] || el.dataset.en;
        const cue = el.querySelector('.scroll-cue');
        if (cue) {
            cue.textContent = text;
        } else {
            el.textContent = text;
        }
    });
    document.documentElement.lang = currentLanguage;
}

// Helper: escape key for safe CSS selectors (| is special in CSS attribute selectors)
function safeKey(key) {
    return key.replace(/\|/g, '_');
}

// ---- Item detail modal ----
function openItemDetail(key) {
    const item = getItemByKey(key);
    if (!item) return;
    const body = document.getElementById('itemModalBody');
    const imgPath = (RESTAURANT.photos || './menu_photos/') + item.image;
    const sKey = safeKey(key);
    
    // Build modifiers HTML if item has modifiers
    let modifiersHtml = '';
    if (item.modifiers && Object.keys(item.modifiers).length > 0) {
        const tempOptions = item.modifiers.temperature || [];
        const iceOptions = item.modifiers.ice || [];
        const sugarOptions = item.modifiers.sugar || [];
        
        let groupsHtml = '';
        
        // Temperature group
        if (tempOptions.length > 1) {
            groupsHtml += `
            <div class="modifier-group">
                <span class="modifier-group-label" data-en="Temperature" data-vi="Nhiệt độ">Temperature</span>
                <div class="modifier-options">
                    ${tempOptions.map(opt => `
                        <label class="modifier-toggle" data-group="temperature" data-value="${opt}">
                            <input type="radio" name="modifier_temp_${sKey}" value="${opt}" ${opt === tempOptions[0] ? 'checked' : ''}>
                            <span class="modifier-label">${getTempLabel(opt)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>`;
        } else if (tempOptions.length === 1) {
            // Only one temperature option - show as info, not selectable
            groupsHtml += `
            <div class="modifier-group">
                <span class="modifier-group-label" data-en="Temperature" data-vi="Nhiệt độ">Temperature</span>
                <div class="modifier-options">
                    <label class="modifier-toggle" data-group="temperature" data-value="${tempOptions[0]}" style="opacity: 0.6; pointer-events: none;">
                        <input type="radio" name="modifier_temp_${sKey}" value="${tempOptions[0]}" checked disabled>
                        <span class="modifier-label">${getTempLabel(tempOptions[0])}</span>
                    </label>
                </div>
            </div>`;
        }
        
        // Ice group
        if (iceOptions.length > 0) {
            groupsHtml += `
            <div class="modifier-group">
                <span class="modifier-group-label" data-en="Ice" data-vi="Đá">Ice</span>
                <div class="modifier-options">
                    ${iceOptions.map(opt => `
                        <label class="modifier-toggle" data-group="ice" data-value="${opt}">
                            <input type="radio" name="modifier_ice_${sKey}" value="${opt}" ${opt === 'normal' ? 'checked' : ''}>
                            <span class="modifier-label">${getIceLabel(opt)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>`;
        }
        
        // Sugar group
        if (sugarOptions.length > 0) {
            groupsHtml += `
            <div class="modifier-group">
                <span class="modifier-group-label" data-en="Sugar" data-vi="Đường">Sugar</span>
                <div class="modifier-options">
                    ${sugarOptions.map(opt => `
                        <label class="modifier-toggle" data-group="sugar" data-value="${opt}">
                            <input type="radio" name="modifier_sugar_${sKey}" value="${opt}" ${opt === 'normal' ? 'checked' : ''}>
                            <span class="modifier-label">${getSugarLabel(opt)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>`;
        }
        
        if (groupsHtml) {
            modifiersHtml = `
            <div class="modifiers-section">
                <h3 class="modifiers-title" data-en="Customize your drink" data-vi="Tùy chỉnh đồ uống">Customize your drink</h3>
                ${groupsHtml}
            </div>`;
        }
    }
    
    body.innerHTML = `
        <div class="modal-image-wrap">
            <img src="${imgPath}" alt="" class="modal-image-bg" aria-hidden="true" onerror="this.style.display='none';">
            <img src="${imgPath}" alt="${getItemName(item)}" class="modal-image"
                 onerror="this.style.display='none';">
        </div>
        <div class="modal-details">
            <h2 class="modal-title">${getItemName(item)}</h2>
            ${getItemDesc(item) ? `<p class="modal-description">${getItemDesc(item)}</p>` : ''}
            <div class="modal-price">${formatPrice(item.price)}</div>
            ${modifiersHtml}
            <button class="add-to-cart-btn" style="width:100%;" onclick="addToCartWithModifiers('${key}'); closeModal('itemModal');">${t('add_to_cart')}</button>
        </div>`;
    document.getElementById('itemModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.BossAnalytics) {
        const [catId] = key.split('|');
        window.BossAnalytics.track('product_view', { product_id: key, category_id: catId });
    }
}

// Add to cart with modifiers
function addToCartWithModifiers(baseKey) {
    const item = getItemByKey(baseKey);
    if (!item) return;
    
    // Get selected modifiers from modal
    let tempVal = '', iceVal = '', sugarVal = '';
    const sKey = safeKey(baseKey);
    if (item.modifiers) {
        if (item.modifiers.temperature) {
            const tempChecked = document.querySelector(`input[name="modifier_temp_${sKey}"]:checked`);
            if (tempChecked) tempVal = tempChecked.value;
            else tempVal = item.modifiers.temperature[0]; // default to first
        }
        if (item.modifiers.ice) {
            const iceChecked = document.querySelector(`input[name="modifier_ice_${sKey}"]:checked`);
            if (iceChecked) iceVal = iceChecked.value;
            else iceVal = 'normal';
        }
        if (item.modifiers.sugar) {
            const sugarChecked = document.querySelector(`input[name="modifier_sugar_${sKey}"]:checked`);
            if (sugarChecked) sugarVal = sugarChecked.value;
            else sugarVal = 'normal';
        }
    }
    
    // Create cart key with modifiers (only include non-default/non-empty)
    let modKey = baseKey;
    const mods = {};
    if (tempVal) { mods.temperature = tempVal; }
    if (iceVal && iceVal !== 'normal') { mods.ice = iceVal; }
    if (sugarVal && sugarVal !== 'normal') { mods.sugar = sugarVal; }
    
    if (Object.keys(mods).length > 0) {
        modKey = baseKey + '|' + Object.entries(mods).map(([k,v]) => `${k}:${v}`).join('|');
    }
    
    if (!cart[modKey]) {
        cart[modKey] = { 
            catId: baseKey.split('|')[0], 
            idx: parseInt(baseKey.split('|')[1], 10), 
            qty: 0,
            modifiers: Object.keys(mods).length > 0 ? mods : null
        };
    }
    cart[modKey].qty++;
    renderItems();
    updateCartSummary();
    if (window.BossAnalytics) {
        const [catId] = baseKey.split('|');
        window.BossAnalytics.track('add_to_cart', { product_id: modKey, category_id: catId, qty: cart[modKey].qty, value: item ? item.price * cart[modKey].qty : null });
    }
}

// ---- Order flow ----
function placeOrder() {
    if (Object.keys(cart).length === 0) { alert(t('empty_cart')); return; }
    renderOrderModal();
    document.getElementById('orderModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.BossAnalytics) window.BossAnalytics.track('checkout_start');
}

function renderOrderModal() {
    const list = document.getElementById('orderItemsList');
    const { total } = cartTotals();
    const prefix = RESTAURANT.id === 'camon' ? 'CAMON-' : 'CC-';
    list.innerHTML = Object.keys(cart).map(key => {
        const cartItem = cart[key];
        // Extract base key (without modifiers)
        const baseKey = key.split('|')[0] + '|' + key.split('|')[1];
        const item = getItemByKey(baseKey);
        if (!item) return '';
        const qty = cartItem.qty;
        
        // Build modifiers display for order
        let modifiersHtml = '';
        if (cartItem.modifiers) {
            const modLabels = [];
            if (cartItem.modifiers.temperature) {
                modLabels.push(getTempLabel(cartItem.modifiers.temperature));
            }
            if (cartItem.modifiers.ice) {
                modLabels.push(getIceLabel(cartItem.modifiers.ice));
            }
            if (cartItem.modifiers.sugar) {
                modLabels.push(getSugarLabel(cartItem.modifiers.sugar));
            }
            if (modLabels.length > 0) {
                modifiersHtml = `<div class="order-line-modifiers">${modLabels.join(' • ')}</div>`;
            }
        }
        
        return `
            <div class="order-line">
                <div class="order-line-main">
                    <div class="order-line-name">${getItemName(item)} <span class="order-line-qty">× ${qty}</span>${modifiersHtml}</div>
                    <div class="order-line-unit">${formatPrice(item.price)} ${t('each')}</div>
                </div>
                <div class="order-line-price">${formatPrice(item.price * qty)}</div>
            </div>`;
    }).join('');
    document.getElementById('orderTotalFinal').textContent = formatPrice(total);
    document.getElementById('orderNumber').textContent = prefix + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    document.getElementById('sendOrderBtn').style.display = 'block';
    applyStaticTranslations();
}

function orderPayload() {
    const items = Object.keys(cart).map(key => {
        const cartItem = cart[key];
        // Extract base key (without modifiers) - format: catId|idx|temp:x|ice:y|sugar:z
        const baseKey = key.split('|')[0] + '|' + key.split('|')[1];
        const item = getItemByKey(baseKey);
        const [catId] = baseKey.split('|');
        const result = {
            product_id: key,
            category_id: catId,
            name: getItemName(item),
            qty: cartItem.qty,
            price: item ? item.price : 0
        };
        if (cartItem.modifiers) {
            result.modifiers = cartItem.modifiers;
        }
        return result;
    });
    const { total, count } = cartTotals();
    return {
        restaurant_id: CTX.restaurant_id,
        table_id: CTX.table_id || null,
        session_id: CTX.session_id,
        // Phase 3 schema fields: not yet collected (no customer identity yet).
        visitor_id: null,
        visit_session_id: null,
        order_number: document.getElementById('orderNumber').textContent,
        lang: currentLanguage,
        device: CTX.device,
        source: CTX.source,
        campaign: CTX.campaign,
        items: items,
        total: total,
        count: count
    };
}

let isSendingOrder = false;

async function handleSendOrder() {
    if (isSendingOrder) return; // защита от двойного клика
    isSendingOrder = true;

    const payload = orderPayload();
    const orderNumber = payload.order_number;

    // register order on backend (best-effort; demo still succeeds even if backend offline)
    let backendOrderId = null;
    try {
        if (window.fetch) {
            const r = await fetch('./api/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (r.ok) {
                const j = await r.json();
                backendOrderId = j.order_id || null;
            }
        }
    } catch (e) { /* offline-safe */ }

    const noEl = document.getElementById('successOrderNumber');
    if (noEl) {
        noEl.textContent = (currentLanguage === 'vi')
            ? 'Mã đơn: ' + orderNumber
            : 'Order #: ' + orderNumber;
    }

    applyStaticTranslations();
    clearCart();
    document.getElementById('orderModal').classList.remove('active');
    document.getElementById('successModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    if (window.BossAnalytics) {
        window.BossAnalytics.track('order_created', { order_id: backendOrderId || orderNumber, value: payload.total });
        window.BossAnalytics.track('order_completed', { order_id: backendOrderId || orderNumber, value: payload.total });
    }

    // Loyalty / return-visit block (Phase 3/4 architecture stub; no PII, no Zalo call)
    if (window.BossLoyalty) {
        const box = document.getElementById('successLoyalty');
        if (box) {
            box.innerHTML = '';
            window.BossLoyalty.showLoyaltyBlock(box, CTX);
        }
    }

    isSendingOrder = false;
}

// ---- Modals helpers ----
function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
    document.body.style.overflow = '';
}

function showError() {
    const titleEl = document.getElementById('loadingCafeName');
    if (titleEl) titleEl.textContent = RESTAURANT.name;
    document.getElementById('loadingScreen').innerHTML = `
        <div class="loading-content">
            <div class="logo" style="filter:grayscale(100%);">☕</div>
            <h2 class="loading-title" id="loadingCafeName">${RESTAURANT.name}</h2>
            <p class="loading-subtitle" data-en="Could not load menu data" data-vi="Không thể tải dữ liệu thực đơn">Could not load menu data</p>
            <button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;background:white;color:var(--primary);border:none;border-radius:24px;cursor:pointer;font-weight:500;">${currentLanguage === 'vi' ? 'Thử lại' : 'Retry'}</button>
        </div>`;
    applyStaticTranslations();
}

// ---- Setup ----
function setupEventListeners() {
    initTheme();
    setupCategoryArrows();
    document.getElementById('langEn').addEventListener('click', () => switchLanguage('en'));
    document.getElementById('langVi').addEventListener('click', () => switchLanguage('vi'));

    document.getElementById('categoriesNav').addEventListener('click', e => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;
        currentCategory = btn.dataset.category;
        document.querySelectorAll('.category-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderItems();
        if (window.BossAnalytics) window.BossAnalytics.track('category_view', { category_id: currentCategory });
    });

    document.getElementById('openCartBtn').addEventListener('click', openCart);
    document.getElementById('cartModalClose').addEventListener('click', () => closeModal('cartModal'));
    document.getElementById('cartModal').addEventListener('click', e => { if (e.target.classList.contains('modal')) closeModal('cartModal'); });
    document.getElementById('clearCartBtn').addEventListener('click', clearCart);
    document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);

    document.getElementById('orderModalClose').addEventListener('click', () => closeModal('orderModal'));
    document.getElementById('orderModal').addEventListener('click', e => { if (e.target.classList.contains('modal')) closeModal('orderModal'); });
    document.getElementById('sendOrderBtn').addEventListener('click', handleSendOrder);

    document.getElementById('successModal').addEventListener('click', e => { if (e.target.classList.contains('modal')) closeModal('successModal'); });
    document.getElementById('backToMenuBtn').addEventListener('click', () => closeModal('successModal'));
    document.getElementById('googleReviewBtn').addEventListener('click', () => {
        window.open(RESTAURANT.google_review || 'https://www.google.com/maps', '_blank');
    });

    document.getElementById('itemModalClose').addEventListener('click', () => closeModal('itemModal'));
    document.getElementById('itemModal').addEventListener('click', e => { if (e.target.classList.contains('modal')) closeModal('itemModal'); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['itemModal', 'cartModal', 'orderModal', 'successModal'].forEach(closeModal);
        }
    });
}

document.addEventListener('DOMContentLoaded', loadMenuData);

// ---- Theme (Light/Dark) — purely visual overlay, NO re-render ----
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☾' : '☀';
}

function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('cc-theme'); } catch (e) {}
    applyTheme(saved || 'dark');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem('cc-theme', next); } catch (e) {}
    });
}

// ---- Category scroll arrows (layout unchanged, swipe preserved) ----
function setupCategoryArrows() {
    const nav = document.getElementById('categoriesNav');
    const left = document.getElementById('catArrowLeft');
    const right = document.getElementById('catArrowRight');
    if (!nav) return;

    const SCROLL_STEP = 250;
    let nudgeTimers = [];
    let nudgeActive = false;

    function cancelNudge() {
        if (!nudgeActive) return;
        nudgeTimers.forEach(clearTimeout);
        nudgeTimers = [];
        nudgeActive = false;
    }

    function updateArrows() {
        const maxScroll = nav.scrollWidth - nav.clientWidth;
        const atStart = nav.scrollLeft <= 2;
        const atEnd = nav.scrollLeft >= maxScroll - 2;
        const noOverflow = maxScroll <= 4;
        if (left) left.hidden = noOverflow || atStart;
        if (right) right.hidden = noOverflow || atEnd;
    }

    if (left) left.addEventListener('click', () => {
        cancelNudge();
        nav.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' });
    });
    if (right) right.addEventListener('click', () => {
        cancelNudge();
        nav.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' });
    });
    nav.addEventListener('wheel', cancelNudge, { passive: true });
    nav.addEventListener('touchstart', cancelNudge, { passive: true });

    nav.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);

    updateArrows();

    const maxScroll = nav.scrollWidth - nav.clientWidth;
    if (maxScroll > 40) {
        try {
            if (!sessionStorage.getItem('cc-catnudge')) {
                sessionStorage.setItem('cc-catnudge', '1');
                nudgeActive = true;
                nudgeTimers.push(setTimeout(() => nav.scrollTo({ left: 45, behavior: 'smooth' }), 350));
                nudgeTimers.push(setTimeout(() => { nav.scrollTo({ left: 0, behavior: 'smooth' }); nudgeActive = false; }, 1050));
                nudgeTimers.push(setTimeout(updateArrows, 1150));
            }
        } catch (e) {}
    }
}
