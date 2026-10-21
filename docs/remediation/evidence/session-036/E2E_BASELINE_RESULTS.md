# S036 — E2E baseline refresh for R-25

Date: 2026-10-20  
Branch: `fix/audit-foundation`  
Scope: align three E2E scenarios with the current UI contract and re-run the full browser suite. Tests use the local Playwright server and synthetic API fixtures; no production or Play account/data was accessed.

## Changes

1. The mobile start-screen test expected a retired `social-live-1` cache query. It now checks that the app and network module have cache-busting versions without pinning an old release string. Its localization assertions accept the current English labels alongside AZ/RU.
2. The open-room test expected a removed intermediate menu and join button. It now verifies the current direct room list, filter/list visibility, and contextual create action.
3. The pause-menu test expected only AZ/RU/older English text. It now accepts the current English `Resume` and `Quit` labels.

These were stale test contracts, not product-code changes. Assertions continue to verify mobile start behavior, direct list access/create flow, and the limited pause menu.

## Verification

- Focused three-scenario run: **3/3 pass**.
- Full `npm run test:e2e`: **57/64 pass**, 7 failures remain.
- The seven remaining failing scenarios are: Konva open-end highlight overlap; Konva tile viewport rectangle/collision geometry; authenticated profile invite visibility; incoming invite polling; expired seat reservation restore cleanup; invite room-code payload; and authenticated daily bonus visibility/claim.
- `git diff --check` — pass.

The preceding recorded E2E baseline was S025 at 53/62 with nine failures. S036 resolves three of those stale expectations, while the current suite contains two additional scenarios and seven failures still require diagnosis. R-25 remains partial and the CI gate has not been demonstrated green. Overall card count remains **24/42**.

## Для владельца

Исправлены три автоматические проверки, которые описывали старый вид интерфейса. В реальном продукте ничего для этого пакета не менялось. Полный браузерный прогон стал лучше, но ещё семь сценариев требуют отдельного разбора, поэтому задача тестирования не закрыта.
