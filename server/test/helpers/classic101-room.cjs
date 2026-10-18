process.env.REDIS_URI = "";
process.env.DOMINO_SERVER_SECRET ||= "remediation-local-only-not-a-production-secret-2026";
process.env.BETTER_AUTH_SECRET ||= process.env.DOMINO_SERVER_SECRET;
const DominoRoom = require("../../DominoRoom");
const {Player} = require("../../schema/GameState");
let serial = 0;

async function makeRoom(t, count = 2, team = false) {
    const room = new DominoRoom();
    room.roomId = `regression-101-${++serial}`;
    const stats = {events: [], settlements: 0, records: 0, finals: 0, deals: 0, timers: 0, finalPromise: Promise.resolve()};
    room.broadcast = (type, payload) => stats.events.push({type, payload});
    room.scheduleTurnTimer = () => {stats.timers++;};
    room.scheduleNextDeal = () => {};
    room.scheduleNextRound = () => {};
    room.recordMatchResult = () => {stats.records++;};
    room.settleEconomyRound = async () => {stats.settlements++; return {result: "win"};};
    await room.onCreate({gameMode: "classic101", playerCount: count, roomMode: team ? "team" : "ffa", aiCount: 0, stakeKey: "free"});
    clearInterval(room.presenceInterval);
    room.presenceInterval = null;
    t.after(() => {room.onDispose(); room.clock.clear();});
    for (let index = 0; index < count; index++) {
        const player = new Player();
        player.name = `Fixture ${index}`;
        player.seatIndex = index;
        player.isConnected = true;
        room.state.players.set(`s${index}`, player);
        room.state.playerOrder.push(`s${index}`);
    }
    const endRound = room.endRound.bind(room), endDeal = room.endDeal.bind(room);
    room.endRound = (...args) => {stats.finals++; return stats.finalPromise = endRound(...args);};
    room.endDeal = (...args) => {stats.deals++; return endDeal(...args);};
    return {room, stats};
}

module.exports = {makeRoom};
