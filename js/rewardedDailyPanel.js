/** UI only. Closing hides detail; only the flow/server can determine credit. */
export class RewardedDailyPanel {
    constructor({ root, flow, t, onCredit = async () => {} }) {
        this.root = root; this.flow = flow; this.t = t; this.onCredit = onCredit;
        this.closed = false; this.destroyed = false; this.notified = false; this.syncFailed = false;
        const doc = root.ownerDocument;
        this.body = doc.createElement('div');
        const title = doc.createElement('strong'); title.className = 'daily-reward-title'; this.title = title;
        this.message = doc.createElement('p'); this.message.setAttribute('role', 'status'); this.message.setAttribute('aria-live', 'polite'); this.message.setAttribute('aria-atomic', 'true');
        this.actions = doc.createElement('div'); this.actions.className = 'daily-reward-actions';
        const button = () => { const node = doc.createElement('button'); node.type = 'button'; node.className = 'btn btn-secondary'; this.actions.append(node); return node; };
        this.start = button(); this.check = button(); this.close = button();
        this.body.append(title, this.message); root.replaceChildren(this.body, this.actions);
        this.start.onclick = () => this.run('start'); this.check.onclick = () => this.run('check');
        this.close.onclick = () => { if (!this.destroyed) { this.closed = true; this.render(); } };
        this.previous = flow.onChange;
        this.listener = snapshot => {
            try { this.previous?.(snapshot); } catch { /* UI observers do not grant coins. */ }
            if (this.destroyed) return;
            this.render(snapshot);
            if (snapshot.phase === 'credited' && !this.notified) {
                this.notified = true;
                Promise.resolve().then(() => { if (!this.destroyed) return this.onCredit(); }).then(() => {
                    if (!this.destroyed) { this.syncFailed = false; this.render(); }
                }).catch(() => {
                    if (!this.destroyed) { this.syncFailed = true; this.notified = false; this.render(); }
                });
            }
        };
        flow.onChange = this.listener; this.render();
    }
    run(method) {
        if (this.destroyed) return;
        this.closed = false;
        const promise = this.flow[method](); this.render();
        promise.catch(() => { if (!this.destroyed) this.render(); });
    }
    render(snapshot = this.flow.snapshot) {
        if (this.destroyed) return;
        const phase = snapshot.phase;
        const messages = { idle: 'rewarded-idle', starting: 'rewarded-starting', binding: 'rewarded-starting', showing: 'rewarded-showing', checking: 'rewarded-checking', pending: 'rewarded-pending', awaiting_confirmation: 'rewarded-pending', credited: this.syncFailed ? 'rewarded-wallet-sync' : 'rewarded-credited', expired: 'rewarded-expired', cancelled: 'rewarded-cancelled', sign_in_required: 'rewarded-sign-in', not_eligible: 'rewarded-not-eligible' };
        this.title.textContent = this.t('rewarded-title'); this.message.textContent = this.t(messages[phase] || 'rewarded-unavailable');
        this.start.textContent = this.t('rewarded-start'); this.check.textContent = this.t('rewarded-check'); this.close.textContent = this.t('rewarded-close');
        this.body.hidden = this.closed;
        this.start.hidden = !snapshot.canStart || ['not_eligible', 'sign_in_required', 'blocked', 'disabled'].includes(phase);
        this.check.hidden = !snapshot.canCheck && !snapshot.busy;
        this.close.hidden = snapshot.busy || this.closed || phase === 'idle' || phase === 'disabled';
        this.start.disabled = snapshot.busy; this.check.disabled = snapshot.busy; this.close.disabled = snapshot.busy;
        this.root.setAttribute('aria-busy', String(snapshot.busy));
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.flow.onChange === this.listener) this.flow.onChange = this.previous;
        this.flow.dispose(); this.root.replaceChildren(); this.root.hidden = true;
    }
}
