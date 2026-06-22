const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_KEYS = {
    az: {
        "connection-reconnecting": "Bağlantı bərpa olunur...",
        "connection-reconnect-failed": "Bağlantını bərpa etmək olmadı. Lobbiyə qayıdın.",
        "forfeit-settlement-failed": "Mərc hesablanması tamamlanmadı. Coinlər qayıtmasa, dəstəyə müraciət edin.",
        "timeout-forfeit-title": "Vaxt bitdi",
        "timeout-forfeit-title-loser": "Vaxtın bitdi",
        "timeout-forfeit-title-waiting": "{player} vaxtında oynaya bilmədi",
        "timeout-forfeit-desc-loser": "Raundu vaxt bitdiyi üçün uduzdun",
        "timeout-forfeit-desc-waiting": "{player} oyuna davam edəcəkmi, gözlənilir",
        "timeout-forfeit-continue": "Davam et",
        "timeout-forfeit-continue-in-progress": "Davam etdirilir...",
        "timeout-forfeit-exit": "Çıx",
        "timeout-forfeit-topup": "Balansı artır",
        "timeout-forfeit-insufficient-balance": "Kifayət qədər coin yoxdur",
        "timeout-forfeit-stake-unavailable": "Mərc hazırda əlçatan deyil",
        "timeout-forfeit-room-closed": "Otaq bağlandı",
        "timeout-forfeit-countdown": "Davam pəncərəsi",
        "timeout-forfeit-waiting-other": "Davam qərarı gözlənilir"
    },
    en: {
        "connection-reconnecting": "Restoring connection...",
        "connection-reconnect-failed": "Could not restore the connection. Return to the lobby.",
        "forfeit-settlement-failed": "Stake settlement was not completed. If coins are not returned, contact support.",
        "timeout-forfeit-title": "Timeout forfeit",
        "timeout-forfeit-title-loser": "You timed out",
        "timeout-forfeit-title-waiting": "{player} timed out",
        "timeout-forfeit-desc-loser": "You lost the round by timeout",
        "timeout-forfeit-desc-waiting": "Waiting to see whether {player} will continue",
        "timeout-forfeit-continue": "Continue",
        "timeout-forfeit-continue-in-progress": "Continuing...",
        "timeout-forfeit-exit": "Exit",
        "timeout-forfeit-topup": "Top up balance",
        "timeout-forfeit-insufficient-balance": "Not enough coins",
        "timeout-forfeit-stake-unavailable": "Stake is unavailable right now",
        "timeout-forfeit-room-closed": "Room closed",
        "timeout-forfeit-countdown": "Continue window",
        "timeout-forfeit-waiting-other": "Waiting for continue"
    },
    ru: {
        "connection-reconnecting": "Восстанавливаем соединение...",
        "connection-reconnect-failed": "Не удалось восстановить соединение. Вернитесь в лобби.",
        "forfeit-settlement-failed": "Расчёт ставки не завершён. Если монеты не вернулись, обратитесь в поддержку.",
        "timeout-forfeit-title": "Время вышло",
        "timeout-forfeit-title-loser": "Вы не успели сделать ход",
        "timeout-forfeit-title-waiting": "{player} не успел сделать ход",
        "timeout-forfeit-desc-loser": "Вы проиграли раунд по таймауту",
        "timeout-forfeit-desc-waiting": "Ждём, продолжит ли {player} игру",
        "timeout-forfeit-continue": "Продолжить",
        "timeout-forfeit-continue-in-progress": "Продолжается...",
        "timeout-forfeit-exit": "Выйти",
        "timeout-forfeit-topup": "Пополнить баланс",
        "timeout-forfeit-insufficient-balance": "Недостаточно монет",
        "timeout-forfeit-stake-unavailable": "Ставка сейчас недоступна",
        "timeout-forfeit-room-closed": "Комната закрыта",
        "timeout-forfeit-countdown": "Окно продолжения",
        "timeout-forfeit-waiting-other": "Ждём решения о продолжении"
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
            for (const [key] of Object.entries(entries)) {
                assert.ok(
                    text.includes(`"${key}":`),
                    `${relativePath} is missing ${locale}.${key}`
                );
            }
        }
    }
});
