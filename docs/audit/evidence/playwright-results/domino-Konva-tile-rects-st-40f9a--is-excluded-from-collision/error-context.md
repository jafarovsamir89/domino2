# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domino.spec.mjs >> Konva tile rects stay in viewport coordinates and source rect is excluded from collision
- Location: e2e/domino.spec.mjs:1075:1

# Error details

```
Error: expect(received).toBeCloseTo(expected, precision)

Expected: 157.6015625
Received: 176.3

Expected precision:    1
Expected difference: < 0.05
Received difference:   18.69843750000001
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - text: ▾
  - generic [ref=e2]:
    - generic [ref=e3]:
      - button "Pause" [ref=e4] [cursor=pointer]
      - generic [ref=e6]:
        - generic [ref=e7]:
          - generic [ref=e8]: "Samir:"
          - generic [ref=e9]: "0"
          - generic [ref=e10]: "0"
        - generic [ref=e11]:
          - generic [ref=e12]: "AI:"
          - generic [ref=e13]: "0"
          - generic [ref=e14]: "0"
    - generic "AI" [ref=e16]
    - generic:
      - generic: "14"
    - generic [ref=e27]: AI 1 makes the opening move
    - generic [ref=e28]:
      - button "DRAW" [disabled]
      - button "PASS" [disabled]
  - status
  - generic:
    - generic:
      - generic: Friends
    - generic:
      - generic: No recipient available
    - generic:
      - generic:
        - generic: У вас нет полученных подарков. Вы можете купить подарок за монеты.
        - button: Купить подарок
```

# Test source

```ts
  1047 |       rawY: raw.y,
  1048 |       adjustedX: adjusted.x,
  1049 |       adjustedY: adjusted.y,
  1050 |       centerX,
  1051 |       centerY,
  1052 |       anchorCenterX,
  1053 |       anchorCenterY,
  1054 |       buttonCenterX,
  1055 |       buttonCenterY,
  1056 |       btnRect: btnRect ? {
  1057 |         left: btnRect.left,
  1058 |         top: btnRect.top,
  1059 |         right: btnRect.right,
  1060 |         bottom: btnRect.bottom
  1061 |       } : null
  1062 |     };
  1063 |   });
  1064 | 
  1065 |   expect(result.rawX).toBeCloseTo(result.centerX, 1);
  1066 |   expect(result.rawY).toBeLessThan(result.centerY);
  1067 |   expect(result.adjustedX).toBeCloseTo(result.rawX, 1);
  1068 |   expect(result.buttonCenterX).toBeCloseTo(result.anchorCenterX, 1);
  1069 |   expect(result.buttonCenterY).toBeCloseTo(result.anchorCenterY, 1);
  1070 |   expect(result.btnRect).not.toBeNull();
  1071 |   expect(pageErrors).toEqual([]);
  1072 |   expect(consoleErrors).toEqual([]);
  1073 | });
  1074 | 
  1075 | test("Konva tile rects stay in viewport coordinates and source rect is excluded from collision", async ({ page }) => {
  1076 |   const pageErrors = [];
  1077 |   const consoleErrors = [];
  1078 |   page.on("pageerror", (error) => pageErrors.push(error.message));
  1079 |   page.on("console", (msg) => {
  1080 |     if (msg.type() === "error") consoleErrors.push(msg.text());
  1081 |   });
  1082 | 
  1083 |   await setupSoloSmoke(page, { konvaEnabled: true });
  1084 |   await page.goto("/index.html");
  1085 |   await startSoloGame(page);
  1086 | 
  1087 |   const result = await page.evaluate(() => {
  1088 |     const game = window.game;
  1089 |     const renderer = game?.renderer;
  1090 |     const board = game?.board;
  1091 |     if (!renderer || !board) throw new Error("missing_game_state");
  1092 | 
  1093 |     board.placeFirst({
  1094 |       a: 6,
  1095 |       b: 6,
  1096 |       id: "viewport-rect-tile",
  1097 |       isDouble: true,
  1098 |       hasValue(value) {
  1099 |         return this.a === value || this.b === value;
  1100 |       },
  1101 |       otherSide(value) {
  1102 |         return this.a === value ? this.b : this.a;
  1103 |       }
  1104 |     });
  1105 |     renderer.renderBoard(board);
  1106 | 
  1107 |     const konva = renderer._konvaBoardRenderer;
  1108 |     const buttonSize = renderer.getArrowButtonSize();
  1109 |     const tileRects = konva.getBoardTileRects();
  1110 |     const tileRect = tileRects[0];
  1111 |     const tileEl = document.querySelector(`#board .board-layout [data-tile-id="${tileRect.tileId}"]`);
  1112 |     const tileElRect = tileEl?.getBoundingClientRect?.() || null;
  1113 |     const sourceRect = {
  1114 |       left: tileRect.left,
  1115 |       top: tileRect.top,
  1116 |       right: tileRect.right,
  1117 |       bottom: tileRect.bottom,
  1118 |       width: tileRect.width,
  1119 |       height: tileRect.height,
  1120 |       centerX: tileRect.centerX,
  1121 |       centerY: tileRect.centerY
  1122 |     };
  1123 |     const raw = {
  1124 |       x: sourceRect.centerX,
  1125 |       y: sourceRect.centerY,
  1126 |       rect: sourceRect
  1127 |     };
  1128 |     const adjusted = renderer.adjustArrowPointForCollision(raw, buttonSize, tileRects, "top");
  1129 | 
  1130 |     return {
  1131 |       tileRect,
  1132 |       tileElRect: tileElRect ? {
  1133 |         left: tileElRect.left,
  1134 |         top: tileElRect.top,
  1135 |         right: tileElRect.right,
  1136 |         bottom: tileElRect.bottom,
  1137 |         width: tileElRect.width,
  1138 |         height: tileElRect.height
  1139 |       } : null,
  1140 |       raw,
  1141 |       adjusted
  1142 |     };
  1143 |   });
  1144 | 
  1145 |   expect(result.tileRect).not.toBeNull();
  1146 |   expect(result.tileElRect).not.toBeNull();
> 1147 |   expect(result.tileRect.left).toBeCloseTo(result.tileElRect.left, 1);
       |                                ^ Error: expect(received).toBeCloseTo(expected, precision)
  1148 |   expect(result.tileRect.top).toBeCloseTo(result.tileElRect.top, 1);
  1149 |   expect(result.tileRect.centerX).toBeCloseTo(result.tileElRect.left + result.tileElRect.width / 2, 1);
  1150 |   expect(result.tileRect.centerY).toBeCloseTo(result.tileElRect.top + result.tileElRect.height / 2, 1);
  1151 |   expect(result.adjusted.x).toBeCloseTo(result.raw.x, 1);
  1152 |   expect(result.adjusted.y).toBeCloseTo(result.raw.y, 1);
  1153 |   await page.screenshot({ path: `${KONVA_SCREENSHOT_DIR}/arrow-source-rect-excluded.png` });
  1154 |   expect(pageErrors).toEqual([]);
  1155 |   expect(consoleErrors).toEqual([]);
  1156 | });
  1157 | 
  1158 | test("Konva arrow axes stay locked and emergency fallback only shifts when normal candidates fail", async ({ page }) => {
  1159 |   const pageErrors = [];
  1160 |   const consoleErrors = [];
  1161 |   page.on("pageerror", (error) => pageErrors.push(error.message));
  1162 |   page.on("console", (msg) => {
  1163 |     if (msg.type() === "error") consoleErrors.push(msg.text());
  1164 |   });
  1165 | 
  1166 |   await setupSoloSmoke(page, { konvaEnabled: true });
  1167 |   await page.goto("/index.html");
  1168 |   await startSoloGame(page);
  1169 | 
  1170 |   const result = await page.evaluate(() => {
  1171 |     const game = window.game;
  1172 |     const renderer = game?.renderer;
  1173 |     const board = game?.board;
  1174 |     if (!renderer || !board) throw new Error("missing_game_state");
  1175 | 
  1176 |     const BoardCtor = board.constructor;
  1177 |     const makeTile = (a, b, id) => ({
  1178 |       a,
  1179 |       b,
  1180 |       id,
  1181 |       isDouble: a === b,
  1182 |       hasValue(value) {
  1183 |         return this.a === value || this.b === value;
  1184 |       },
  1185 |       otherSide(value) {
  1186 |         return this.a === value ? this.b : this.a;
  1187 |       }
  1188 |     });
  1189 | 
  1190 |     const soloBoard = new BoardCtor();
  1191 |     soloBoard.placeFirst(makeTile(6, 6, "arrow-axis-tile"));
  1192 |     renderer.renderBoard(soloBoard);
  1193 |     const openEnd = soloBoard.openEnds[0];
  1194 |     const konva = renderer._konvaBoardRenderer;
  1195 |     const nodeRect = konva.getNodeRect(openEnd.nodeId);
  1196 |     const centerX = nodeRect.left + nodeRect.width / 2;
  1197 |     const centerY = nodeRect.top + nodeRect.height / 2;
  1198 |     const buttonSize = renderer.getArrowButtonSize();
  1199 |     const tileRects = renderer.collectBoardTileRects();
  1200 | 
  1201 |     const runSide = (side, obstacleRects = []) => {
  1202 |       openEnd.side = side;
  1203 |       openEnd.growthDir = side;
  1204 |       const raw = konva.getOpenEndChoicePoint(openEnd, { buttonSize });
  1205 |       const adjusted = renderer.adjustArrowPointForCollision(raw, buttonSize, obstacleRects.length ? obstacleRects : tileRects, side);
  1206 |       return {
  1207 |         side,
  1208 |         raw,
  1209 |         adjusted,
  1210 |         centerX,
  1211 |         centerY,
  1212 |         buttonSize
  1213 |       };
  1214 |     };
  1215 | 
  1216 |     const top = runSide("top");
  1217 |     const bottom = runSide("bottom");
  1218 |     const left = runSide("left");
  1219 |     const right = runSide("right");
  1220 | 
  1221 |     const fakePoint = {
  1222 |       x: 250,
  1223 |       y: 400,
  1224 |       rect: {
  1225 |         left: 232,
  1226 |         top: 382,
  1227 |         right: 268,
  1228 |         bottom: 418,
  1229 |         width: 36,
  1230 |         height: 36
  1231 |       }
  1232 |     };
  1233 |     const topShifted = renderer.adjustArrowPointForCollision(fakePoint, buttonSize, [{
  1234 |       left: 230,
  1235 |       right: 270,
  1236 |       top: 390,
  1237 |       bottom: 430,
  1238 |       width: 40,
  1239 |       height: 40
  1240 |     }], "top");
  1241 |     const topEmergency = renderer.adjustArrowPointForCollision(fakePoint, buttonSize, [{
  1242 |       left: 230,
  1243 |       right: 250,
  1244 |       top: 330,
  1245 |       bottom: 430,
  1246 |       width: 20,
  1247 |       height: 100
```