"""User-facing browser acceptance. Run only in an environment allowing the local test server.
Requires Python Playwright. This test does not change production projects or call LLM APIs.
"""
import asyncio, json, os, uuid
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE=os.environ.get('MAPS_TEST_URL','http://127.0.0.1:4317')
OUT=Path(__file__).resolve().parents[1]/'artifacts'
async def main():
    OUT.mkdir(exist_ok=True)
    results=[]
    async with async_playwright() as p:
        kwargs={'headless':True}
        if os.environ.get('MAPS_CHROMIUM_PATH'): kwargs['executable_path']=os.environ['MAPS_CHROMIUM_PATH']
        browser=await p.chromium.launch(**kwargs)
        page=await browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        page_errors=[]
        page.on('pageerror',lambda error: page_errors.append(str(error)))
        project='ui-'+uuid.uuid4().hex[:12]
        try:
            await page.goto(BASE+'/?project='+project,wait_until='networkidle')
            await page.wait_for_function('window.mapsDemo?.feature?.current')
            async def action(name): await page.locator('#feature [data-map-action="'+name+'"]').first.click()
            nav=page.get_by_role('navigation',name='Разделы проекта')
            await expect(nav.get_by_role('link',name='Доска задач',exact=True)).to_be_visible()
            geometry=await page.evaluate('({viewport:window.mapsDemo.feature.board.viewport,width:document.body.scrollWidth,inner:innerWidth,stage:document.querySelector(".wb-stage").getBoundingClientRect().toJSON()})')
            assert geometry['width']<=geometry['inner']+1
            assert geometry['stage']['width']>1300 and geometry['stage']['height']>500
            await nav.get_by_role('link',name='Доска задач',exact=True).click()
            await expect(page.locator('#host-view h1')).to_have_text('Доска задач')
            await nav.get_by_role('link',name='Карты',exact=True).click()
            assert await page.evaluate('window.mapsDemo.feature.board.viewport')==geometry['viewport']
            results.append('host navigation and viewport restoration')
            await action('help')
            help_dialog=page.get_by_role('dialog',name='Как работать с картами')
            await expect(help_dialog).to_be_visible()
            await page.keyboard.press('Escape');await expect(help_dialog).to_be_hidden()
            assert await page.evaluate('document.activeElement.dataset.mapAction')=='help'
            results.append('help dialog and focus restoration')
            await action('templates')
            library=page.get_by_role('dialog',name='С чего начнём?')
            assert await library.locator('.map-template-card').count()==16
            await library.get_by_label('Поиск шаблонов').fill('архитектур')
            assert await library.locator('.map-template-card').count()>0
            await page.keyboard.press('Escape');await expect(library).to_be_hidden()
            results.append('plain-language template search and purpose')
            await action('start')
            await expect(page.locator('.map-state')).to_contain_text('В работе')
            await action('workflow')
            await page.get_by_role('dialog',name='Добавить сценарий действий?').get_by_role('button',name='Добавить сценарий',exact=True).click()
            await expect(page.locator('.map-subbar [data-map-action=workflow]')).to_have_attribute('aria-pressed','true')
            await action('validate')
            await expect(page.locator('.map-panel-head h2')).to_have_text('Структура проверена')
            results.append('valid separate workflow document')
            await action('run')
            run_dialog=page.get_by_role('dialog',name='Тест и запуск сценария')
            await run_dialog.get_by_label('Входные заметки — одна на строку').fill('Проверить сценарий\nПодготовить решение\nПроверить сценарий')
            await run_dialog.get_by_role('button',name='Начать',exact=True).click()
            await expect(page.locator('.map-panel-head h2')).to_have_text('Нужно подтверждение')
            await page.locator('.map-approval-form').get_by_role('button',name='Подтвердить и продолжить').click()
            await expect(page.locator('.map-panel-head h2')).to_have_text('Готово')
            assert await page.evaluate('(async()=> (await mapsDemo.repository.list("tasks",mapsDemo.project.id)).length)()')==0
            results.append('test run stops for approval and produces no effects')
            await action('run')
            run_dialog=page.get_by_role('dialog',name='Тест и запуск сценария')
            await run_dialog.locator('iq-select[name=mode]').get_by_role('combobox').click()
            await run_dialog.get_by_role('option',name='Исполнить — записать подтверждённый результат',exact=True).click()
            await run_dialog.get_by_label('Входные заметки — одна на строку').fill('Действие из UI')
            await run_dialog.get_by_role('button',name='Начать',exact=True).click()
            await expect(page.locator('.map-panel-head h2')).to_have_text('Нужно подтверждение')
            await page.locator('.map-approval-form').get_by_role('button',name='Подтвердить и продолжить').click()
            await expect(page.locator('.map-panel-head h2')).to_have_text('Готово')
            assert await page.evaluate('(async()=> (await mapsDemo.repository.list("tasks",mapsDemo.project.id)).length)()')==1
            results.append('execution creates exactly one reviewed reference task')
            await action('canvas')
            await action('more')
            await page.get_by_role('dialog',name='Действия с картой').get_by_role('button',name='Сохранить как шаблон').click()
            template_dialog=page.get_by_role('dialog',name='Сохранить свой шаблон')
            await template_dialog.get_by_label('Название шаблона').fill('Подготовить обсуждение — UI')
            await template_dialog.get_by_label('Для чего он нужен').fill('Собрать мысли перед встречей')
            await template_dialog.get_by_label('Когда использовать').fill('Перед встречей команды')
            await template_dialog.get_by_role('button',name='Сохранить шаблон',exact=True).click()
            await expect(template_dialog).to_be_hidden()
            assert await page.evaluate('(async()=> (await mapsDemo.repository.list("templates",mapsDemo.project.id)).length)()')>=1
            results.append('custom template persisted')
            old_id=await page.evaluate('mapsDemo.feature.current.id')
            await action('finish')
            finish=page.get_by_role('dialog',name='Завершить сессию')
            await finish.get_by_label('Итоги и следующие шаги').fill('Результат проверен. Следующий шаг согласован.')
            await finish.get_by_role('button',name='Сохранить итоги и завершить').click()
            await expect(page.locator('.map-state')).to_contain_text('В архиве')
            assert await page.evaluate('mapsDemo.feature.board.readOnly') is True
            await action('continue')
            continuation=page.get_by_role('dialog',name='Продолжить отдельной картой')
            await continuation.get_by_role('button',name='Создать продолжение').click()
            await expect(continuation).to_be_hidden()
            assert await page.evaluate('mapsDemo.feature.current.id')!=old_id
            assert await page.evaluate('mapsDemo.feature.current.sourceMapId')==old_id
            results.append('archive immutable and linked continuation')
            await page.screenshot(path=str(OUT/'desktop-light.png'))
            await page.locator('#theme').click();await page.screenshot(path=str(OUT/'desktop-dark.png'))
            await page.set_viewport_size({'width':390,'height':844})
            assert await page.evaluate('document.body.scrollWidth<=innerWidth+1')
            await expect(nav).to_be_visible()
            await page.screenshot(path=str(OUT/'mobile-dark.png'))
            results.append('light/dark and narrow viewport geometry')
            assert not page_errors,page_errors
            (OUT/'ui-report.json').write_text(json.dumps({'status':'PASS','projectId':project,'cases':results,'pageErrors':page_errors},ensure_ascii=False,indent=2))
        except Exception as error:
            (OUT/'ui-report.json').write_text(json.dumps({'status':'FAILED_OR_BLOCKED','projectId':project,'completedCases':results,'error':str(error),'pageErrors':page_errors},ensure_ascii=False,indent=2))
            raise
        finally: await browser.close()
asyncio.run(main())
