const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

test("client only enters open-room waiting screen while seat selection is still required", () => {
    const appSource = read("js/app.js");
    const webAppSource = read("www/js/app.js");

    assert.equal(
        appSource.includes("roomState.roomVisibility === 'open' && !roomState.gameActive && roomState.seatSelectionRequired === true") &&
        appSource.includes("this.enterOpenRoomWaitingScreen(roomState);"),
        true
    );
    assert.equal(
        webAppSource.includes("roomState.roomVisibility === 'open' && !roomState.gameActive && roomState.seatSelectionRequired === true") &&
        webAppSource.includes("this.enterOpenRoomWaitingScreen(roomState);"),
        true
    );
});
