import {test, expect} from './fixtures.mjs';

for (const bundle of ['root', 'www']) for (const count of [20, 28]) {
    test(`${bundle}: ${count} tiles zoom, pan and reset preserve canvas and move coordinates`, async ({page}) => {
        await page.setViewportSize({width: 390, height: 740});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.goto(`/docs/remediation/fixtures/board-review.html?bundle=${bundle}`);
        await expect(page.getByRole('button', {name: 'Увеличить стол', exact: true})).toBeVisible();
        await page.locator('#count').selectOption(String(count));
        const original = await page.evaluate(() => {
            const k = reviewRenderer;
            window.beforeBoard = JSON.stringify(k.lastBoard);
            return {scale: k.lastLayout.scale, count: k.lastBoard.nodes.length};
        });
        expect(original.count).toBe(count);
        for (let i=0; i<4; i++) await page.getByRole('button', {name: 'Увеличить стол', exact: true}).click();
        await expect(page.getByRole('button', {name: 'Показать весь стол', exact: true})).toHaveText('200%');
        await expect(page.getByRole('button', {name: 'Увеличить стол', exact: true})).toBeDisabled();
        expect(await page.evaluate(() => reviewRenderer.lastLayout.scale)).toBeCloseTo(original.scale * 2, 5);
        const host = await page.locator('#review-board').boundingBox();
        await page.mouse.move(host.x+host.width/2, host.y+host.height/2);
        await page.mouse.down(); await page.mouse.move(host.x+host.width/2+100, host.y+host.height/2+30, {steps:4}); await page.mouse.up();
        expect(await page.evaluate(() => reviewRenderer.viewPan.x)).toBeGreaterThan(0);
        const alignment = await page.evaluate(() => {
            const k=reviewRenderer, host=k.rootEl.getBoundingClientRect();
            return [...k.tileGroupsById].map(([id,entry]) => {
                const actual=entry.tile.getClientRect({relativeTo:k.stage,skipShadow:true,skipStroke:true}), reported=k.getTileRect(id);
                const local=k.screenRectToLocalPoint(k.lastLayout,{left:reported.left-host.left,top:reported.top-host.top,width:reported.width,height:reported.height});
                return {dx:Math.abs(actual.x+host.left-reported.left),dy:Math.abs(actual.y+host.top-reported.top),inverseX:Math.abs(local.x-entry.group.x()),inverseY:Math.abs(local.y-entry.group.y())};
            });
        });
        for (const row of alignment) for (const error of Object.values(row)) expect(error).toBeLessThan(1);
        // Fit restores all28 tiles and their actual playable choice controls.
        await page.getByRole('button', {name:'Показать весь стол', exact:true}).click();
        expect(await page.evaluate(() => reviewRenderer.viewZoom)).toBe(1);
        expect(await page.evaluate(() => reviewRenderer.viewPan)).toEqual({x:0,y:0});
        expect(await page.evaluate(() => JSON.stringify(reviewRenderer.lastBoard))).toBe(await page.evaluate(() => beforeBoard));
        await page.evaluate(() => { window.chosen=[]; reviewRenderer.syncPlayableOpenEndHighlights(reviewRenderer.lastBoard.openEnds,[0],null,index=>chosen.push(index)); });
        await page.locator('.konva-open-end-highlight').click();
        expect(await page.evaluate(() => chosen)).toEqual([0]);
        await page.getByRole('button', {name:'Увеличить стол',exact:true}).click();
        await page.locator('.konva-board-root').focus(); await page.keyboard.press('Escape');
        expect(await page.evaluate(() => reviewRenderer.viewZoom)).toBe(1);
        await page.setViewportSize({width:740,height:390});
        await expect.poll(() => page.evaluate(() => reviewRenderer.stage.width())).toBe(390);
        expect(await page.evaluate(() => reviewRenderer.layer.getCanvas().getPixelRatio())).toBeLessThanOrEqual(2);
        await page.getByRole('button', {name:'Увеличить стол',exact:true}).click();
        await page.evaluate(() => {
            const board=reviewRenderer.lastBoard;
            board.nodes.length=0; board.openEnds.length=0;
            reviewRenderer.render(board,{force:true});
        });
        expect(await page.evaluate(() => reviewRenderer.viewZoom)).toBe(1);
    });
}
