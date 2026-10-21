function buildInfo(env = process.env) {
    const candidate = String(env.DEPLOY_SHA || env.GITHUB_SHA || env.SOURCE_VERSION || '').trim();
    const deploySha = /^[a-f0-9]{7,64}$/i.test(candidate) ? candidate.toLowerCase() : 'unknown';
    return { deploySha, release: env.SENTRY_RELEASE || `domino-server@${deploySha}` };
}
module.exports = { buildInfo };
