/** Explicit adult-owner audit adapter; construction/status cannot initialize ads. */
export function createRewardedReviewNativeAdapter(plugin, { adultOwner = false, testAccepted = false } = {}) {
    const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const ready = async () => {
        if (adultOwner !== true || testAccepted !== true) throw new Error('adult_test_confirmation_required');
        if (typeof plugin?.status !== 'function' || (await plugin.status())?.loadShowEnabled !== true) throw new Error('review_show_disabled');
    };
    return {
        async bindAttempt(attempt) {
            await ready();
            if (!validId(attempt?.attemptId) || typeof attempt?.expiresAt !== 'string') throw new Error('invalid_attempt');
            return plugin.bindAttempt({ attemptId: attempt.attemptId, expiresAt: attempt.expiresAt, adultOwner: true, testAccepted: true });
        },
        async show(attempt) {
            await ready();
            if (!validId(attempt?.attemptId)) throw new Error('invalid_attempt');
            return plugin.show({ attemptId: attempt.attemptId });
        }
    };
}
