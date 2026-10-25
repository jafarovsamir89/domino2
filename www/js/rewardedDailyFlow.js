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
        recover: () => account.platformRequest(`${ROOT}/recovery`),
        status: id => account.platformRequest(`${ROOT}/attempt/${attemptId(id)}`),
        cancel: id => account.platformRequest(`${ROOT}/cancel`, { method: 'POST', body: { attemptId: attemptId(id) } })
    };
}

/** Default-off integration candidate. No wallet arithmetic, persistence or timers.
 * The native adapter MUST bind init USER_ID before SDK init and retain that binding across
 * JS resets. It must never implement bindAttempt by changing unsigned dynamicUserId.
 */
export class RewardedDailyFlow {
    constructor({ api, ads, enabled = false, recoverBeforeStart = false, onChange = () => {}, now = Date.now }) {
        this.api = api;
        this.ads = ads;
        this.enabled = enabled === true;
        this.onChange = onChange;
        this.now = now;
        this.recoverBeforeStart = recoverBeforeStart === true;
        this._recovered = !this.recoverBeforeStart;
        this._canStart = false;
        this._records = [];
        this._generation = 0;
        this._attempt = null;
        this._nativeAttemptId = null;
        this._operation = null;
        this._busy = false;
        this.phase = this.enabled ? (this.recoverBeforeStart ? 'recovering' : 'idle') : 'disabled';
        this.code = '';
    }

    get snapshot() {
        return Object.freeze({
            phase: this.phase, code: this.code, busy: this._busy,
            canStart: this.enabled && !this._busy && (this.recoverBeforeStart ? this._recovered && this._canStart && typeof this.ads?.bindAttempt === 'function' && typeof this.ads?.show === 'function' : !this._attempt),
            canCheck: this.enabled && !this._busy && (this.recoverBeforeStart || Boolean(this._attempt)),
            claimDate: this._attempt?.claimDate || '',
            attempts: Object.freeze(this._records.map((record,index) => Object.freeze({index,claimDate:record.claimDate,baseReward:record.baseReward,state:record.state}))),
            selectedIndex: this._records.findIndex(record => record.id === this._attempt?.id),
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
        if (this.recoverBeforeStart) {
            const record = this._record(result);
            this._attempt = record;
            const index = this._records.findIndex(item => item.id === id);
            if (index < 0) this._records.unshift(record); else this._records[index] = record;
        }
        this._publish(generation, result.state);
        return result.state;
    }

    start() {
        if (this.recoverBeforeStart && !this._recovered) return this.recover();
        if (this.recoverBeforeStart ? !this._canStart : this._attempt) return this.check();
        return this._run(async generation => {
            if (generation !== this._generation) return;
            if (typeof this.ads?.bindAttempt !== 'function' || typeof this.ads?.show !== 'function') {
                this._publish(generation, 'unavailable', 'ad_unavailable');
                return;
            }
            if (!this._publish(generation, 'starting')) return;
            // A lost issue response must be discovered on the server before another opt-in.
            if (this.recoverBeforeStart) { this._canStart = false; this._recovered = false; }
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
        if (this.recoverBeforeStart) return this.recover();
        if (!this._attempt) return Promise.resolve(this.snapshot);
        return this._run(generation => this._refresh(generation));
    }

    _record(value) {
        const id = attemptId(value?.attemptId), expiresAt = Date.parse(value?.expiresAt), deadline = Date.parse(value?.settlementDeadline);
        if (!STATES.has(value?.state) || typeof value.expiresAt !== 'string' || typeof value.settlementDeadline !== 'string' || !Number.isFinite(expiresAt) || !Number.isFinite(deadline) || deadline < expiresAt || typeof value.claimDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.claimDate) || !Number.isSafeInteger(value.baseReward) || value.baseReward < 1 || value.baseReward > 10000) throw new Error('invalid_response');
        return {id,expiresAt,deadline,claimDate:value.claimDate,baseReward:value.baseReward,state:value.state};
    }

    recover() {
        if (!this.recoverBeforeStart) return this.check();
        return this._run(async generation => {
            if (generation !== this._generation || !this._publish(generation, 'recovering')) return;
            // Fail closed on malformed/lost discovery; a retry is always a GET.
            this._recovered = false; this._canStart = false;
            const result = await this.api.recover();
            if (generation !== this._generation) return;
            if (result?.flowVersion !== 'owner_8day_v1' || typeof result?.canStart !== 'boolean' || !Array.isArray(result.attempts) || result.attempts.length > 27) throw new Error('invalid_response');
            const records = result.attempts.map(value => this._record(value));
            if (new Set(records.map(value => value.id)).size !== records.length) throw new Error('invalid_response');
            const selected = records.find(value => value.id === this._attempt?.id) || records[0] || null;
            this._records = records; this._attempt = selected;
            this._recovered = true; this._canStart = result.canStart;
            this._publish(generation, selected?.state || (result.canStart ? 'idle' : 'not_eligible'));
        });
    }

    select(index) {
        if (!this.enabled || this._busy || !Number.isInteger(index) || !this._records[index]) return;
        this._attempt = this._records[index];
        this._publish(this._generation, this._attempt.state);
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
        this._records = []; this._recovered = !this.recoverBeforeStart; this._canStart = false;
        this._operation = null;
        this._busy = false;
        // Native SDK lifetime is longer than JS/account state. Never infer a native reset.
        this._publish(this._generation, this.enabled ? (this.recoverBeforeStart ? 'recovering' : 'idle') : 'disabled');
    }

    dispose() {
        this.enabled = false;
        this.reset();
    }
}
