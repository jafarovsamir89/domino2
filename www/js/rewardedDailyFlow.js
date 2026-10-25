const NONCE = /^[a-f0-9]{64}$/;
const STATES = new Set(['pending', 'awaiting_confirmation', 'credited', 'cancelled', 'expired']);
const ROOT = '/economy/daily-bonus/rewarded';

function attemptId(value) {
    if (typeof value !== 'string' || !NONCE.test(value)) throw new Error('invalid_response');
    return value;
}

/** Uses existing authenticated transport; no player, amount or completion assertion is sent. */
export function createRewardedDailyApi(account) {
    return {
        issue: () => account.platformRequest(`${ROOT}/attempt`, { method: 'POST', body: { optIn: true } }),
        status: id => account.platformRequest(`${ROOT}/attempt/${attemptId(id)}`),
        cancel: id => account.platformRequest(`${ROOT}/cancel`, { method: 'POST', body: { attemptId: attemptId(id) } })
    };
}

/** Disabled, unmounted integration candidate. No wallet arithmetic, persistence or timers.
 * The native adapter MUST bind init USER_ID before SDK init and retain that binding across
 * JS resets. It must never implement bindAttempt by changing unsigned dynamicUserId.
 */
export class RewardedDailyFlow {
    constructor({ api, ads, enabled = false, onChange = () => {}, now = Date.now }) {
        this.api = api;
        this.ads = ads;
        this.enabled = enabled === true;
        this.onChange = onChange;
        this.now = now;
        this._generation = 0;
        this._attempt = null;
        this._nativeAttemptId = null;
        this._operation = null;
        this._busy = false;
        this.phase = this.enabled ? 'idle' : 'disabled';
        this.code = '';
    }

    get snapshot() {
        return Object.freeze({
            phase: this.phase, code: this.code, busy: this._busy,
            canStart: this.enabled && !this._busy && !this._attempt,
            canCheck: this.enabled && !this._busy && Boolean(this._attempt),
            canCancel: this.enabled && !this._busy && Boolean(this._attempt) &&
                !['awaiting_confirmation', 'credited', 'cancelled', 'expired'].includes(this.phase)
        });
    }

    _publish(generation, phase, code = '') {
        if (generation !== this._generation) return false;
        this.phase = phase;
        this.code = code;
        try { this.onChange(this.snapshot); } catch { /* An observer cannot decide a reward. */ }
        return generation === this._generation;
    }

    _run(work) {
        if (!this.enabled) return Promise.resolve(this.snapshot);
        if (this._operation) return this._operation;
        const generation = this._generation;
        this._busy = true;
        this._operation = Promise.resolve().then(() => work(generation)).catch(error => {
            const message = error instanceof Error ? error.message : '';
            if (message === 'active_session_required') this._publish(generation, 'sign_in_required');
            else if (['normal_daily_required', 'frequency_cap', 'attempt_cap', 'active_attempt_scope_conflict'].includes(message)) this._publish(generation, 'not_eligible', message);
            else this._publish(generation, 'unavailable', message === 'invalid_response' ? 'invalid_response' : 'retry_status');
        }).then(() => {
            if (generation === this._generation) {
                this._busy = false;
                this._operation = null;
                this._publish(generation, this.phase, this.code);
            }
            return this.snapshot;
        });
        return this._operation;
    }

    async _refresh(generation) {
        if (generation !== this._generation || !this._attempt) return null;
        const id = this._attempt.id;
        if (!this._publish(generation, 'checking')) return null;
        const result = await this.api.status(id);
        if (generation !== this._generation) return null;
        if (result?.attemptId !== id || !STATES.has(result?.state)) throw new Error('invalid_response');
        this._publish(generation, result.state);
        return result.state;
    }

    start() {
        if (this._attempt) return this.check(); // A retry checks the same attempt, never replays an ad.
        return this._run(async generation => {
            if (generation !== this._generation) return;
            if (typeof this.ads?.bindAttempt !== 'function' || typeof this.ads?.show !== 'function') {
                this._publish(generation, 'unavailable', 'ad_unavailable');
                return;
            }
            if (!this._publish(generation, 'starting')) return;
            const issued = await this.api.issue();
            if (generation !== this._generation) return;
            if (typeof issued?.expiresAt !== 'string') throw new Error('invalid_response');
            const id = attemptId(issued?.attemptId), expiresAt = Date.parse(issued?.expiresAt);
            if (!Number.isFinite(expiresAt)) throw new Error('invalid_response');
            this._attempt = { id, expiresAt };
            if (await this._refresh(generation) !== 'pending' || generation !== this._generation) return;
            if (expiresAt <= this.now()) {
                this._publish(generation, 'pending', 'retry_status');
                return;
            }
            if (this._nativeAttemptId && this._nativeAttemptId !== id) {
                this._publish(generation, 'blocked', 'native_binding_conflict');
                return;
            }
            // Pin before awaiting: a failed/stale bind can still have initialized the native SDK.
            if (!this._publish(generation, 'binding')) return;
            this._nativeAttemptId = id;
            const bound = await this.ads.bindAttempt({ attemptId: id, expiresAt: issued.expiresAt });
            if (generation !== this._generation) return;
            if (bound?.bound !== true || bound?.attemptId !== id) {
                this._publish(generation, 'blocked', 'native_binding_conflict');
                return;
            }
            if (!this._publish(generation, 'showing')) return;
            let displayFailed = false;
            try { await this.ads.show({ attemptId: id }); } catch { displayFailed = true; }
            if (generation !== this._generation) return;
            // Closed/rewarded callbacks can arrive out of order. Neither is a server grant.
            const state = await this._refresh(generation);
            if (state === 'pending' && displayFailed) this._publish(generation, 'pending', 'ad_unavailable');
        });
    }

    check() {
        if (!this._attempt) return Promise.resolve(this.snapshot);
        return this._run(generation => this._refresh(generation));
    }

    cancel() {
        if (!this._attempt) return Promise.resolve(this.snapshot);
        return this._run(async generation => {
            if (generation !== this._generation) return;
            const id = this._attempt.id;
            if (!this._publish(generation, 'checking')) return;
            const result = await this.api.cancel(id);
            if (generation !== this._generation) return;
            if (result?.attemptId !== id || !STATES.has(result?.state)) throw new Error('invalid_response');
            this._publish(generation, result.state); // Credit may have won the transaction race.
        });
    }

    reset() {
        this._generation++;
        this._attempt = null;
        this._operation = null;
        this._busy = false;
        // Native SDK lifetime is longer than JS/account state. Never infer a native reset.
        this._publish(this._generation, this.enabled ? 'idle' : 'disabled');
    }

    dispose() {
        this.enabled = false;
        this.reset();
    }
}
