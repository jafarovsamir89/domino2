const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

test("client does not force open rooms into the game screen before gameActive", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");

    assert.equal(
        appSource.includes("roomState.roomVisibility === 'open' && !roomState.gameActive") &&
        appSource.includes("this.enterOpenRoomWaitingScreen(roomState);"),
        false
    );
    assert.equal(
        webAppSource.includes("roomState.roomVisibility === 'open' && !roomState.gameActive") &&
        webAppSource.includes("this.enterOpenRoomWaitingScreen(roomState);"),
        false
    );
});
