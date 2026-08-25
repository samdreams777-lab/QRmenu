/* AI B.O.S.S. QR Menu — session & context
 * Creates an anonymous guest session id and resolves the deep-link context
 * (restaurant_id, table_id, session_id, lang, source, campaign) from the URL.
 *
 * Privacy: no personal data is read or generated here. Session id is an anonymous
 * UUID stored only in localStorage. If a user clears storage, a NEW unique id is
 * generated on next visit (satisfies "each new session = unique id").
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'aiboss_session';
    var CONTEXT_KEY = 'aiboss_ctx'; // last resolved context (for cross-page reuse)

    function uuid() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') {
            try { return global.crypto.randomUUID(); } catch (e) {}
        }
        // fallback
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getOrCreateSessionId() {
        var sid = null;
        try { sid = localStorage.getItem(STORAGE_KEY); } catch (e) {}
        if (!sid) {
            sid = uuid();
            try { localStorage.setItem(STORAGE_KEY, sid); } catch (e) {}
        }
        return sid;
    }

    // Resolve context from URL: /<restaurant>/order?table=NN&lang=vi&source=qr&campaign=...
    function resolveContext() {
        var ctx = { restaurant_id: 'common', table_id: null, session_id: null, lang: null, source: null, campaign: null, device: null };

        var path = '';
        try { path = global.location.pathname || ''; } catch (e) {}
        // /camon/order  -> restaurant 'camon'
        var m = path.match(/^\/([a-z0-9_-]+)\/order\/?$/i);
        if (m) ctx.restaurant_id = m[1].toLowerCase();

        var params = {};
        try { global.location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
            if (!kv) return;
            var p = kv.split('=');
            params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
        }); } catch (e) {}

        if (params.table) ctx.table_id = String(params.table).trim();
        if (params.lang) ctx.lang = String(params.lang).toLowerCase();
        if (params.source) ctx.source = String(params.source).toLowerCase();
        if (params.campaign) ctx.campaign = String(params.campaign);

        ctx.session_id = getOrCreateSessionId();

        // device type (coarse)
        try {
            var ua = global.navigator.userAgent || '';
            ctx.device = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) ? 'mobile' : 'desktop';
        } catch (e) { ctx.device = 'unknown'; }

        // persist for reuse by analytics/dashboard navigation
        try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx)); } catch (e) {}
        return ctx;
    }

    function getContext() {
        // reuse last resolved context if available (same tab session)
        try {
            var c = sessionStorage.getItem(CONTEXT_KEY);
            if (c) return JSON.parse(c);
        } catch (e) {}
        return resolveContext();
    }

    global.BossContext = {
        resolve: resolveContext,
        get: getContext,
        newSessionId: function () { return uuid(); }
    };
})(window);
