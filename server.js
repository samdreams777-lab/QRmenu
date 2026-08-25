// AI B.O.S.S. QR Menu — backend
// Phase 1 Demo (hardened): static SPA serving + analytics/order collection + SPA fallback routing.
//
// Run:  node server.js          (http://localhost:8080)
//       PORT=9000 node server.js (custom port)
//
// Security (hardening, see audit):
//   - restaurant_id / table_id are validated server-side against data/restaurants.json.
//     The client body is NOT trusted for these fields; the server overrides them with
//     the resolved, validated context. Only session_id (anonymous device id) is passed
//     through, plus forward-looking visitor_id / visit_session_id (null in Phase 1).
//   - /api/analytics requires an owner token: DASHBOARD_TOKEN env (or ?token= / Authorization).
//     Demo default token is set ONLY when DASHBOARD_TOKEN is unset, and a warning is logged.
//     In production ALWAYS set DASHBOARD_TOKEN to a strong secret.
//   - PII fields (name/phone/email/zalo_id) are always stripped server-side.
//
// Routes:
//   GET  /<restaurant>/order?table=NN   -> index.html (SPA fallback, deep link / app link target)
//   GET  /dashboard                     -> dashboard.html (SPA fallback)
//   GET  /api/config?restaurant=ID      -> restaurant metadata
//   POST /api/event                     -> append analytics event (server-validated context)
//   POST /api/order                     -> append order (server-validated context)
//   GET  /api/analytics?restaurant=ID&token=...  -> aggregated demo stats (owner-auth)
//   GET  /.well-known/assetlinks.json  -> Android App Links association (stub)
//   GET  /.well-known/apple-app-site-association -> iOS Universal Links (stub)
//   * other paths with extension        -> static file

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

// ---- Owner token for analytics (demo-safe default; production MUST set env) ----
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || 'demo-aiboss-owner-token';
const USING_DEFAULT_TOKEN = !process.env.DASHBOARD_TOKEN;

// ---- Data stores (demo: append-only JSONL) ----
const DATA_DIR = path.join(ROOT, 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.jsonl');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.jsonl');

// ---- Restaurant registry (validated context source of truth) ----
let RESTAURANTS = {};
function loadRestaurants() {
    const cfgPath = path.join(DATA_DIR, 'restaurants.json');
    if (!fs.existsSync(cfgPath)) return {};
    try { return JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) || {}; }
    catch (e) { return {}; }
}
RESTAURANTS = loadRestaurants();

// Validate a restaurant id; returns the config or null.
function getRestaurant(rid) {
    if (!rid) return null;
    rid = String(rid).toLowerCase();
    return RESTAURANTS[rid] || null;
}

// Validate a table id against a restaurant's declared tables.
// Returns the normalized table id, or null if invalid/unknown.
function validateTable(restaurant, tableId) {
    if (!restaurant) return null;
    if (tableId === null || tableId === undefined) return null;
    const tables = Array.isArray(restaurant.tables) ? restaurant.tables : [];
    if (tables.length === 0) return null; // restaurant has no tables (e.g. common)
    const t = String(tableId).trim();
    // allow only declared tables (exact match, case-insensitive)
    const found = tables.find(x => String(x).toLowerCase() === t.toLowerCase());
    return found ? String(found) : null;
}

function ensureDataFile(file) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf-8');
}

function appendJSONL(file, obj) {
    ensureDataFile(file);
    fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf-8');
}

function readJSONL(file) {
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf-8');
    if (!text.trim()) return [];
    return text.split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
}

// ---- Helpers ----
function sendJSON(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
}

function todayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
            if (data.length > 1_000_000) req.destroy(); // guard
        });
        req.on('end', () => {
            if (!data) return resolve({});
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

// Strip any PII-like fields the client might send (defence in depth).
function stripPII(obj) {
    delete obj.name; delete obj.phone; delete obj.email; delete obj.zalo_id;
    return obj;
}

// Build a server-validated event/order context from the client body.
// restaurant_id / table_id are OVERRIDDEN by server truth; client cannot forge another venue.
function resolveContext(body) {
    const claimedRid = body && body.restaurant_id;
    const restaurant = getRestaurant(claimedRid);
    if (!restaurant) {
        // unknown restaurant -> reject (don't fall back to default; prevents cross-venue spoofing)
        return { error: 'unknown_restaurant' };
    }
    const claimedTid = body ? body.table_id : null;
    const tableId = validateTable(restaurant, claimedTid); // null when not applicable / invalid
    return {
        restaurant_id: restaurant.id,
        table_id: tableId,
        rejected_table: (claimedTid !== null && claimedTid !== undefined && !tableId)
    };
}

// ---- SPA fallback ----
function isSPAIndex(pathname) {
    if (pathname === '/' || pathname === '') return true;
    if (pathname === '/dashboard') return true;
    if (/^\/[a-z0-9_-]+\/order\/?$/.test(pathname)) return true;
    return false;
}

function serveStatic(res, filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}
function serveIndex(res, file = 'index.html') {
    serveStatic(res, path.join(ROOT, file));
}

// ---- Aggregation for dashboard ----
function aggregateAnalytics(restaurantId) {
    const events = readJSONL(ANALYTICS_FILE);
    const orders = readJSONL(ORDERS_FILE);
    const day = todayKey();

    // scope to the authorized restaurant only
    const dayEvents = events.filter(e => (e.date || '').startsWith(day) && e.restaurant_id === restaurantId);
    const dayOrders = orders.filter(o => (o.date || '').startsWith(day) && o.restaurant_id === restaurantId);

    const sessSet = new Set(dayEvents.map(e => e.session_id).filter(Boolean));
    const todayMenuOpens = dayEvents.filter(e => e.event === 'menu_open').length;

    const tableSessions = {};
    dayEvents.forEach(e => {
        if (!e.table_id) return;
        if (!tableSessions[e.table_id]) tableSessions[e.table_id] = new Set();
        if (e.session_id) tableSessions[e.table_id].add(e.session_id);
    });
    const tableStats = Object.entries(tableSessions)
        .map(([t, s]) => ({ table_id: t, sessions: s.size }))
        .sort((a, b) => a.table_id.localeCompare(b.table_id));

    const viewCount = {};
    dayEvents.forEach(e => {
        if (e.event === 'product_view' && e.product_id) {
            viewCount[e.product_id] = (viewCount[e.product_id] || 0) + 1;
        }
    });
    const topViewed = Object.entries(viewCount)
        .map(([pid, c]) => ({ product_id: pid, views: c }))
        .sort((a, b) => b.views - a.views).slice(0, 10);

    const orderCount = {};
    dayOrders.forEach(o => {
        (o.items || []).forEach(it => {
            orderCount[it.product_id] = (orderCount[it.product_id] || 0) + (it.qty || 1);
        });
    });
    const topOrdered = Object.entries(orderCount)
        .map(([pid, c]) => ({ product_id: pid, ordered: c }))
        .sort((a, b) => b.ordered - a.ordered).slice(0, 10);

    const conversion = todayMenuOpens > 0 ? (dayOrders.length / todayMenuOpens) : 0;

    return {
        restaurant_id: restaurantId,
        date: day,
        menu_opens: todayMenuOpens,
        unique_sessions: sessSet.size,
        orders: dayOrders.length,
        conversion: conversion,
        table_stats: tableStats,
        top_viewed: topViewed,
        top_ordered: topOrdered,
        total_events: dayEvents.length,
        total_orders_all: orders.filter(o => o.restaurant_id === restaurantId).length
    };
}

// ---- Auth for analytics ----
function authorizedForAnalytics(req, parsedUrl) {
    let token = parsedUrl.searchParams.get('token');
    const auth = req.headers['authorization'] || '';
    if (!token && auth.toLowerCase().startsWith('bearer ')) {
        token = auth.slice(7).trim();
    }
    if (!token) return false;
    // constant-time-ish compare
    if (token.length !== DASHBOARD_TOKEN.length) return false;
    let diff = 0;
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ DASHBOARD_TOKEN.charCodeAt(i);
    return diff === 0;
}

// ---- Main request handler ----
const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const method = req.method;

    // API: config
    if (method === 'GET' && pathname === '/api/config') {
        const rid = parsedUrl.searchParams.get('restaurant') || 'camon';
        const r = getRestaurant(rid);
        if (!r) { sendJSON(res, 404, { error: 'unknown_restaurant' }); return; }
        sendJSON(res, 200, r);
        return;
    }

    // API: event (server-validated context)
    if (method === 'POST' && pathname === '/api/event') {
        try {
            const body = stripPII(await readBody(req));
            const ctx = resolveContext(body);
            if (ctx.error === 'unknown_restaurant') {
                sendJSON(res, 403, { ok: false, error: 'unknown_restaurant' });
                return;
            }
            const ev = {
                event: typeof body.event === 'string' ? body.event : 'unknown',
                restaurant_id: ctx.restaurant_id,            // server truth
                table_id: ctx.table_id,                       // server truth (null if invalid/none)
                session_id: typeof body.session_id === 'string' ? body.session_id : null,
                visitor_id: typeof body.visitor_id === 'string' ? body.visitor_id : null,         // Phase 3
                visit_session_id: typeof body.visit_session_id === 'string' ? body.visit_session_id : null, // Phase 3
                lang: typeof body.lang === 'string' ? body.lang : null,
                device: typeof body.device === 'string' ? body.device : null,
                source: typeof body.source === 'string' ? body.source : null,
                campaign: typeof body.campaign === 'string' ? body.campaign : null,
                product_id: typeof body.product_id === 'string' ? body.product_id : null,
                category_id: typeof body.category_id === 'string' ? body.category_id : null,
                order_id: typeof body.order_id === 'string' ? body.order_id : null,
                qty: (typeof body.qty === 'number') ? body.qty : null,
                value: (typeof body.value === 'number') ? body.value : null,
                date: todayKey(),
                timestamp: new Date().toISOString()
            };
            appendJSONL(ANALYTICS_FILE, ev);
            sendJSON(res, 200, { ok: true, restaurant_id: ev.restaurant_id, table_id: ev.table_id });
        } catch (e) { sendJSON(res, 400, { ok: false, error: e.message }); }
        return;
    }

    // API: order (server-validated context)
    if (method === 'POST' && pathname === '/api/order') {
        try {
            const body = stripPII(await readBody(req));
            const ctx = resolveContext(body);
            if (ctx.error === 'unknown_restaurant') {
                sendJSON(res, 403, { ok: false, error: 'unknown_restaurant' });
                return;
            }
            const order_id = 'AIBOSS-' + Date.now().toString(36).toUpperCase() + '-' +
                Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            const order = {
                order_id,
                restaurant_id: ctx.restaurant_id,             // server truth
                table_id: ctx.table_id,                        // server truth
                session_id: typeof body.session_id === 'string' ? body.session_id : null,
                visitor_id: typeof body.visitor_id === 'string' ? body.visitor_id : null,          // Phase 3
                visit_session_id: typeof body.visit_session_id === 'string' ? body.visit_session_id : null, // Phase 3
                order_number: typeof body.order_number === 'string' ? body.order_number : null,
                lang: typeof body.lang === 'string' ? body.lang : null,
                device: typeof body.device === 'string' ? body.device : null,
                source: typeof body.source === 'string' ? body.source : null,
                campaign: typeof body.campaign === 'string' ? body.campaign : null,
                items: Array.isArray(body.items) ? body.items : [],
                total: (typeof body.total === 'number') ? body.total : null,
                count: (typeof body.count === 'number') ? body.count : null,
                date: todayKey(),
                timestamp: new Date().toISOString()
            };
            appendJSONL(ORDERS_FILE, order);
            sendJSON(res, 200, { ok: true, order_id, restaurant_id: order.restaurant_id, table_id: order.table_id });
        } catch (e) { sendJSON(res, 400, { ok: false, error: e.message }); }
        return;
    }

    // API: analytics (owner-auth, scoped to one restaurant)
    if (method === 'GET' && pathname === '/api/analytics') {
        if (!authorizedForAnalytics(req, parsedUrl)) {
            sendJSON(res, 401, { error: 'unauthorized', hint: 'provide ?token= or Authorization: Bearer <DASHBOARD_TOKEN>' });
            return;
        }
        const rid = parsedUrl.searchParams.get('restaurant') || 'camon';
        const r = getRestaurant(rid);
        if (!r) { sendJSON(res, 404, { error: 'unknown_restaurant' }); return; }
        try { sendJSON(res, 200, aggregateAnalytics(r.id)); }
        catch (e) { sendJSON(res, 500, { error: e.message }); }
        return;
    }

    // Well-known association files (App Links / Universal Links stubs)
    if (pathname === '/.well-known/assetlinks.json') {
        serveStatic(res, path.join(ROOT, '.well-known', 'assetlinks.json'));
        return;
    }
    if (pathname === '/.well-known/apple-app-site-association') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ "applinks": { "apps": [], "details": [] } }));
        return;
    }

    // SPA fallback
    if (isSPAIndex(pathname)) {
        if (pathname === '/dashboard') serveIndex(res, 'dashboard.html');
        else serveIndex(res, 'index.html');
        return;
    }

    // Static file (prevent traversal)
    let rel = pathname;
    if (rel.startsWith('/')) rel = rel.slice(1);
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    serveStatic(res, filePath);
});

server.listen(PORT, () => {
    console.log(`AI B.O.S.S. QR Menu server running at http://localhost:${PORT}/`);
    console.log(`  Demo venue: http://localhost:${PORT}/camon/order?table=01`);
    console.log(`  Dashboard:  http://localhost:${PORT}/dashboard`);
    if (USING_DEFAULT_TOKEN) {
        console.log(`  [SECURITY] Using DEMO dashboard token "${DASHBOARD_TOKEN}".`);
        console.log(`            In production set DASHBOARD_TOKEN env to a strong secret.`);
    } else {
        console.log(`  [SECURITY] Dashboard token loaded from DASHBOARD_TOKEN env.`);
    }
});
