/* AI B.O.S.S. QR Menu — loyalty / Zalo architecture (Phase 1 stub)
 *
 * PURPOSE: prepare the foundation for Phase 3 (Loyalty) and Phase 4 (Zalo)
 * WITHOUT implementing full CRM, registration, or Zalo calls (per ТЗ §14).
 *
 * What it does in Demo:
 *  - shows a non-intrusive "bonus on next visit" block after an order completes;
 *  - stores only anonymous, consent-free reward *offer state* locally;
 *  - defines the consent flow data structure for future Zalo linkage, but does
 *    NOT collect any Zalo ID or personal data, and does NOT talk to Zalo.
 *
 * Future phases plug into: showLoyaltyOptIn(), linkZalo(), applyConsent().
 */
(function (global) {
    'use strict';

    var REWARD_KEY = 'aiboss_reward_offer';

    function getOffer() {
        try { return JSON.parse(localStorage.getItem(REWARD_KEY) || 'null'); }
        catch (e) { return null; }
    }
    function setOffer(o) {
        try { localStorage.setItem(REWARD_KEY, JSON.stringify(o)); } catch (e) {}
    }

    // Demo reward: simple, no account. Just an offer tied to the anonymous session.
    function grantNextVisitReward(ctx) {
        var offer = {
            type: 'next_visit_discount',
            label_vi: 'Giảm 10% cho lần ghé tới',
            label_en: '10% off your next visit',
            pct: 10,
            granted_at: new Date().toISOString(),
            restaurant_id: (ctx && ctx.restaurant_id) || 'camon',
            session_id: (ctx && ctx.session_id) || null,
            claimed: false
        };
        setOffer(offer);
        return offer;
    }

    // Architecture stub for Phase 4 — not invoked in Demo.
    // When real Zalo OA ships, this becomes: open Zalo OA follow flow,
    // then exchange the official Zalo token for a customer_id AFTER explicit consent.
    function prepareZaloConsent() {
        return {
            stage: 'consent_pending',
            method: 'zalo_oa_official', // MUST be official Zalo mechanism, never from QR scan alone
            requires_explicit_consent: true,
            pii_collected: false
        };
    }

    function showLoyaltyBlock(container, ctx) {
        if (!container) return;
        var offer = grantNextVisitReward(ctx);
        var isVi = (global.__currentLang === 'vi') ||
            (ctx && ctx.lang === 'vi');
        var title = isVi ? '🎁 Nhận ưu đãi cho lần ghé tới' : '🎁 Get a bonus on your next visit';
        var body = isVi
            ? 'Cảm ơn bạn! Lần sau ghé Camon Coffee nhận <b>giảm 10%</b> cho đơn hàng.'
            : 'Thank you! Next time you visit Camon Coffee, get <b>10% off</b> your order.';
        var later = isVi ? 'Để sau' : 'Maybe later';

        var box = document.createElement('div');
        box.className = 'loyalty-block';
        box.innerHTML =
            '<div class="loyalty-title">' + title + '</div>' +
            '<div class="loyalty-body">' + body + '</div>' +
            '<button class="loyalty-dismiss" onclick="this.parentNode.style.display=\'none\'">' + later + '</button>';
        container.appendChild(box);
    }

    global.BossLoyalty = {
        grantNextVisitReward: grantNextVisitReward,
        showLoyaltyBlock: showLoyaltyBlock,
        prepareZaloConsent: prepareZaloConsent,
        getOffer: getOffer
    };
})(window);
