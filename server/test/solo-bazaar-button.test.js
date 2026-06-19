const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

test("solo bazaar UI uses multiplayer-gated connectionLost in both app copies", () => {
    const oldConnectionLost = "const connectionLost = !this.network?.isRoomConnectionOpen?.() || this.networkActionBlockedForReconnect;";
    const newConnectionLost = "const connectionLost = Boolean(this.network?.isMultiplayer) && (";
    const files = ["js/app.js", "www/js/app.js"];

    for (const file of files) {
        const content = read(file);

        assert.equal(content.includes(oldConnectionLost), false, `${file} still contains the old connectionLost gate`);
        assert.equal(content.includes(newConnectionLost), true, `${file} is missing the multiplayer-gated connectionLost`);
        assert.equal(content.includes("getHumanHandForRender()"), true, `${file} is missing the render helper`);
        assert.equal(content.includes("const myHand = this.getHumanHandForRender();"), true, `${file} is not using the helper in renderState/renderRealtimeGameDeltaView`);
    }
});

test("solo bazaar draw button stays enabled when the human has no play and boneyard has tiles", () => {
    const computeDrawDisabled = ({
        connectionLost = false,
        waitingOpenRoom = false,
        myTurn = true,
        canPlay = false,
        emptyBoneyard = false,
        postMoveWindowActive = false,
        turnInProgress = false
    } = {}) => (
        connectionLost ||
        waitingOpenRoom ||
        !myTurn ||
        canPlay ||
        emptyBoneyard ||
        postMoveWindowActive ||
        turnInProgress
    );

    assert.equal(
        computeDrawDisabled({
            connectionLost: false,
            waitingOpenRoom: false,
            myTurn: true,
            canPlay: false,
            emptyBoneyard: false,
            postMoveWindowActive: false,
            turnInProgress: false
        }),
        false
    );

    assert.equal(
        computeDrawDisabled({
            connectionLost: false,
            waitingOpenRoom: false,
            myTurn: true,
            canPlay: true,
            emptyBoneyard: false,
            postMoveWindowActive: false,
            turnInProgress: false
        }),
        true
    );
});
