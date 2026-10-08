/**
 * Renders the synthetic sample documents the demo uploads (public/samples/*.png).
 * Everything here is fictional and every image is watermarked as a synthetic sample.
 * Run with `npm run samples:render` after changing a template.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.join(process.cwd(), "public", "samples");

const base = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 900px; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1d2433; background: #fff; }
  .page { position: relative; padding: 48px 56px; min-height: 1100px; overflow: hidden; background: #fdfdfb; }
  .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .watermark span { transform: rotate(-28deg); font-size: 64px; font-weight: 800; letter-spacing: 0.08em; color: rgba(200, 55, 45, 0.13); white-space: nowrap; }
  .foot { position: absolute; left: 56px; right: 56px; bottom: 28px; font-size: 12px; color: #8a93a3; border-top: 1px solid #e2e7ef; padding-top: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 16px; }
  td { padding: 9px 0; border-bottom: 1px solid #e6e9ef; vertical-align: top; }
  td.k { width: 230px; color: #5b6474; }
`;

function bill(holder: string): string {
  return `<html><head><style>${base}
    .brand { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 4px solid #0f766e; padding-bottom: 16px; margin-bottom: 28px; }
    .brand h1 { font-size: 30px; color: #0f766e; letter-spacing: -0.02em; }
    .brand small { display: block; font-size: 13px; color: #5b6474; margin-top: 4px; }
    .title { font-size: 20px; font-weight: 700; margin-bottom: 18px; }
    .amount { margin-top: 28px; display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; background: #eef7f5; border-radius: 10px; font-size: 18px; }
    .amount b { font-size: 26px; }
  </style></head><body><div class="page">
    <div class="brand"><div><h1>Sahyadri Power</h1><small>Fictional electricity utility · Navo demo</small></div><div style="text-align:right;font-size:14px;color:#5b6474">Electricity bill<br/>Bill no. SP-0000-48213</div></div>
    <div class="title">Electricity bill · September 2026</div>
    <table>
      <tr><td class="k">Consumer name</td><td><b>${holder}</b></td></tr>
      <tr><td class="k">Supply address</td><td>14 Sea Breeze Apartments, Andheri West, Mumbai 400058</td></tr>
      <tr><td class="k">Consumer number</td><td>0000 1234 5678</td></tr>
      <tr><td class="k">Bill date</td><td>02 Sep 2026</td></tr>
      <tr><td class="k">Billing period</td><td>01 Aug 2026 to 31 Aug 2026</td></tr>
      <tr><td class="k">Units consumed</td><td>212 kWh</td></tr>
      <tr><td class="k">Due date</td><td>20 Sep 2026</td></tr>
    </table>
    <div class="amount"><span>Amount payable</span><b>₹1,842.00</b></div>
    <div class="watermark"><span>SYNTHETIC SAMPLE · NOT A REAL DOCUMENT</span></div>
    <div class="foot">Synthetic sample created for the Navo onboarding prototype. Sahyadri Power is fictional.</div>
  </div></body></html>`;
}

const relievingLetter = `<html><head><style>${base}
  .head { display: flex; justify-content: space-between; font-size: 14px; color: #5b6474; margin-bottom: 36px; }
  .head b { color: #1d2433; font-size: 22px; letter-spacing: -0.01em; }
  p { font-size: 18px; line-height: 1.75; margin-bottom: 18px; font-family: Georgia, "Times New Roman", serif; }
  .lwd { font-size: 19px; margin: 26px 0; font-family: Georgia, "Times New Roman", serif; }
  .smudge { position: relative; display: inline-block; }
  .blot { position: absolute; left: -3px; top: -3px; width: 17px; height: 27px; background: radial-gradient(circle at 45% 50%, #20232b 0 55%, rgba(32,35,43,0.85) 62%, rgba(32,35,43,0) 72%); border-radius: 46% 54% 40% 60% / 52% 44% 56% 48%; transform: rotate(14deg); }
  .sign { margin-top: 56px; font-size: 16px; line-height: 1.6; }
</style></head><body><div class="page">
  <div class="head"><div><b>Northwind Freight Pvt. Ltd.</b><br/>Fictional employer · Navo demo</div><div style="text-align:right">Ref NF/HR/2026/0417<br/>Page 2 of 2</div></div>
  <p>During his tenure, Anand Mehta was responsible for the shipment tracking product and worked closely with our operations teams in Mumbai and Pune.</p>
  <p>He has handed over all company assets and has no dues outstanding. We confirm that he has been relieved of his duties.</p>
  <div class="lwd">Employee name: <b>Anand Mehta</b></div>
  <div class="lwd">Last working day: <b>1<span class="smudge">6<span class="blot"></span></span> Oct 2026</b></div>
  <p>We wish him every success in his future endeavours.</p>
  <div class="sign">For Northwind Freight Pvt. Ltd.<br/><b>Human Resources</b></div>
  <div class="watermark"><span>SYNTHETIC SAMPLE · NOT A REAL DOCUMENT</span></div>
  <div class="foot">Synthetic sample created for the Navo onboarding prototype. Northwind Freight is fictional.</div>
</div></body></html>`;

const SAMPLES: Record<string, string> = {
  "electricity-bill.png": bill("Anand Mehta"),
  "electricity-bill-other-name.png": bill("Kavya Mehta"),
  "relieving-letter.png": relievingLetter,
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1 });
  for (const [file, html] of Object.entries(SAMPLES)) {
    await page.setContent(html, { waitUntil: "load" });
    await page.locator(".page").screenshot({ path: path.join(OUT, file) });
    console.warn(`rendered ${file}`);
  }
  await browser.close();
}

void main();
