const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_KEYS = {
    az: {
        "connection-reconnecting": "Bağlantı bərpa olunur...",
        "connection-reconnect-failed": "Bağlantını bərpa etmək olmadı. Lobbiyə qayıdın.",
        "forfeit-settlement-failed": "Mərc hesablanması tamamlanmadı. Coinlər qayıtmasa, dəstəyə müraciət edin."
    },
    en: {
        "connection-reconnecting": "Restoring connection...",
        "connection-reconnect-failed": "Could not restore the connection. Return to the lobby.",
        "forfeit-settlement-failed": "Stake settlement was not completed. If coins are not returned, contact support."
    },
    ru: {
        "connection-reconnecting": "Восстанавливаем соединение...",
        "connection-reconnect-failed": "Не удалось восстановить соединение. Вернитесь в лобби.",
        "forfeit-settlement-failed": "Расчёт ставки не завершён. Если монеты не вернулись, обратитесь в поддержку."
    }
};

function readFile(root, relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("translation source files contain reconnect and forfeit keys in all locales", () => {
    const root = path.resolve(__dirname, "..", "..");
    const files = ["js/translations.js", "www/js/translations.js"];

    for (const relativePath of files) {
        const text = readFile(root, relativePath);
        for (const [locale, entries] of Object.entries(REQUIRED_KEYS)) {
            for (const [key, value] of Object.entries(entries)) {
                assert.ok(
                    text.includes(`"${key}": "${value}"`),
                    `${relativePath} is missing ${locale}.${key}`
                );
            }
        }
    }
});
