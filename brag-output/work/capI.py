import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'codes.txt')
await page.wait_for_timeout(800)
await page.evaluate("async p => { if (state.hidden !== null) showHiddenPane(); const t = await goToOrOpen(p); if (paneOf(t) !== panes[1]) await moveToPane(t, panes[1], 0); const t2 = allTabs().find(x => x.doc.path && x.doc.path.endsWith('in-list.lpm')); await activate(panes[1], t2); focusPane(panes[1]); }", d + 'in-list.lpm')
await page.evaluate("async () => { const c = allTabs().find(x => x.doc.path && x.doc.path.endsWith('codes.txt')); if (paneOf(c) !== panes[0]) await moveToPane(c, panes[0], 0); await activate(panes[0], c); const t2 = allTabs().find(x => x.doc.path && x.doc.path.endsWith('in-list.lpm')); await activate(panes[1], t2); focusPane(panes[1]); }")
await page.wait_for_timeout(1500)
await snap(page, s, 'capI/000.png')
await page.evaluate("runAction('macro.runThis')")
await page.wait_for_timeout(1500)
await snap(page, s, 'capI/001.png')
return await page.evaluate("panes.map(p => p.active && docName(p.active.doc))")
