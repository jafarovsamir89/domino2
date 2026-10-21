const test = require('node:test');
const assert = require('node:assert/strict');
const {loadGame} = require('./helpers/client-game.cjs');

for (const asset of ['js/app.js', 'www/js/app.js']) {
    test(`${asset}: no active invitation keeps one bounded watcher instead of a summary/poll/render loop`, async () => {
        let now=0, nextId=0, requests=0, reloads=0, authenticated=true;
        const intervals = new Map();
        const game=loadGame(asset, {
            Date:{now:()=>now},
            window:{setInterval:fn=>{intervals.set(++nextId,fn);return nextId;}},
            clearInterval:id=>intervals.delete(id),
            document:{getElementById:()=>({classList:{contains:()=>true}})}
        });
        game.hasAuthenticatedAccount=()=>authenticated;
        game.socialCenterTab='inbox';
        game.account={getPlayInvites:async()=>{requests++;return {incoming:[],outgoing:[],items:[]};}};
        game.mergeRoomInvitations=()=>({incoming:[],sent:[],items:[]});
        game.restoreGameInviteStateFromInvitations=()=>{};
        game.updateSocialCenterBadge=()=>{};
        game.loadSocialInvitesPage=async()=>{
            reloads++;
            // Real list loading refreshes summary, which starts/extends its watcher.
            // Bound the failing fixture so an old implementation cannot spin forever.
            if(reloads<5)game.startGameInviteRefresh();
        };
        game.startGameInviteRefresh();
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(requests,1,'no recursive immediate HTTP polling through summary');
        assert.equal(reloads,1);
        assert.equal(intervals.size,1,'idle account still watches incoming invites');
        [...intervals.values()][0]();
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(requests,2,'the next interval performs exactly one poll');
        assert.equal(reloads,2);
        // Without summary extension, the existing duration boundary still stops it.
        now=game._gameInviteRefreshUntil+1;
        [...intervals.values()][0]();
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(requests,2);
        assert.equal(intervals.size,0);
        game.startGameInviteRefresh();
        await new Promise(resolve=>setImmediate(resolve));
        authenticated=false;
        [...intervals.values()][0]();
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(requests,3);
        assert.equal(intervals.size,0,'logout still cancels the watcher');
    });
}
