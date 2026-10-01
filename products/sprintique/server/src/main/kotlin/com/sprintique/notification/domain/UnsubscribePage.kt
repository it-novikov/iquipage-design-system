package com.sprintique.notification.domain

/**
 * The small page behind a letter's «Отключить письма» link. Opening it changes nothing (mail scanners open links):
 * it asks once, and the button posts back to the same address, as the one-click request of RFC 8058 does. No script,
 * no external resources; the IQUIPAGE colours in light and dark.
 */
object UnsubscribePage {
    fun confirm(action: String, settings: String): String = page(
        "Отключить письма Sprintique?",
        "Уведомления перестанут приходить на почту. Колокольчик в Sprintique и Telegram, если он подключён, " +
            "продолжат работать.",
        """<form method="post" action="${escape(action)}">""" +
            """<input type="hidden" name="List-Unsubscribe" value="One-Click">""" +
            """<button type="submit">Отключить письма</button></form>""" +
            """<p class="aside"><a href="${escape(settings)}">Настроить уведомления</a></p>""",
    )

    fun done(settings: String): String = page(
        "Письма отключены",
        "Уведомления больше не будут приходить на почту. Включить их снова можно в настройках Sprintique.",
        """<p class="aside"><a href="${escape(settings)}">Открыть настройки уведомлений</a></p>""",
    )

    fun expired(settings: String): String = page(
        "Ссылка устарела",
        "Отключить письма можно в Sprintique: Настройки, раздел «Уведомления».",
        """<p class="aside"><a href="${escape(settings)}">Открыть настройки уведомлений</a></p>""",
    )

    fun invalid(settings: String): String = page(
        "Ссылка недействительна",
        "Возможно, адрес скопирован не полностью. Отключить письма можно в Sprintique: Настройки, " +
            "раздел «Уведомления».",
        """<p class="aside"><a href="${escape(settings)}">Открыть настройки уведомлений</a></p>""",
    )

    private fun page(title: String, text: String, actions: String): String = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">
<title>${escape(title)} · Sprintique</title>
<style>
:root{color-scheme:light dark;--bed:#F5F5F7;--card:#FFFFFF;--ink:#1D1D1F;--muted:#62646B;--line:#E6E7EA;--accent:#2453CC;--on:#FFFFFF}
@media (prefers-color-scheme:dark){:root{--bed:#0D0D0F;--card:#161618;--ink:#F5F5F7;--muted:#B1B1B9;--line:#343438;--accent:#A9C1FF;--on:#151518}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bed);color:var(--ink);font:16px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
main{box-sizing:border-box;width:min(480px,calc(100% - 32px));padding:32px;background:var(--card);border:1px solid var(--line);border-radius:16px}
.mark{margin:0 0 20px;font-weight:700;font-size:15px;color:var(--ink)}
h1{margin:0;font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-.015em}
p{margin:12px 0 0;color:var(--muted)}
form{margin:24px 0 0}
button{font:inherit;font-weight:600;font-size:15px;padding:10px 18px;border:0;border-radius:9px;background:var(--ink);color:var(--on);cursor:pointer}
button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.aside{margin-top:20px;font-size:14px}
a{color:var(--accent);text-decoration:none}
</style></head>
<body><main><p class="mark">Sprintique</p><h1>${escape(title)}</h1><p>${escape(text)}</p>$actions</main></body></html>
"""

    private fun escape(value: String): String =
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
}
