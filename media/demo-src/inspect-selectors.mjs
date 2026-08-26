// Dump candidate selectors from the running Casework UI, so the ui/*.json steps are written
// against what is actually in the DOM rather than against a guess.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5273'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

async function dump(label, url) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  const found = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('button, a, input, h2, h3, .thesis, .figure, .waiting, .apparatus, .gate, .facing, .draft, .segments, .totals, table')) {
      const rect = el.getBoundingClientRect()
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: el.className && typeof el.className === 'string' ? el.className : '',
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
        y: Math.round(rect.top + window.scrollY),
        h: Math.round(rect.height),
      })
    }
    return { items: out, pageHeight: document.documentElement.scrollHeight }
  })
  console.log(`\n===== ${label}  (${url})  page height ${found.pageHeight} =====`)
  for (const i of found.items) {
    console.log(`${String(i.y).padStart(5)} h${String(i.h).padStart(4)}  ${i.tag}${i.cls ? '.' + i.cls.split(' ').join('.') : ''}  ${JSON.stringify(i.text)}`)
  }
}

await dump('QUEUE', `${BASE}/`)
await dump('CASE CW-0005', `${BASE}/#/cases/83d87fefd630`)

await browser.close()
