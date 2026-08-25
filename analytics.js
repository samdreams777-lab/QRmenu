/* AI B.O.S.S. QR Menu — analytics client
 * Sends standard demo events to POST ./api/event.
 * No personal data. Falls back silently if backend is unavailable (does not break UX).
 */
(function (global) {
    'use strict';

    function getCtx() {
        return (global.BossContext && global.BossContext.get) ? global.BossContext.get() : { restaurant_id: 'common', session_id: null, table_id: null };
    }

    function safeSend(payload) {
        try {
            if (!global.fetch) return;
            fetch('./api/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(function () {});
        } catch (e) { /* never break UX */ }
    }

    var Analytics = {
        track: function (eventName, extra) {
            var ctx = getCtx();
            var payload = {
                event: eventName,
                restaurant_id: ctx.restaurant_id,
                table_id: ctx.table_id || null,
                session_id: ctx.session_id,
                lang: ctx.lang || (global.__currentLang) || null,
                device: ctx.device,
                source: ctx.source,
                campaign: ctx.campaign,
                timestamp: new Date().toISOString()
            };
            if (extra && typeof extra === 'object') {
                // whitelist non-PII fields
                ['product_id', 'category_id', 'order_id', 'qty', 'value', 'visitor_id', 'visit_session_id'].forEach(function (k) {
                    if (extra[k] !== undefined) payload[k] = extra[k];
                });
            }
            safeSend(payload);
        }
    };

    global.BossAnalytics = Analytics;
})(window);
