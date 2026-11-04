# WhatsApp message templates: ready to submit

- **For:** Rx Fingertip, Meta WhatsApp Cloud API
- **Where to submit:** WhatsApp Manager → Account tools → **Message templates → Create template**
- **Category:** **Utility** for all of them (transaction updates, not marketing)
- **Languages:** English (`en`) and Telugu (`te`). Submit each language as a separate version of the same template name.

Meta's rules these follow:
- Variables are `{{1}}`, `{{2}}`, … in order. Meta requires a sample value for each.
- No promotional words (offer, discount, free) in Utility templates.
- Don't start or end the body with a variable.
- No medical advice or patient health details in any template. Medicine names appear only in messages to the person who ordered.

Each template matches a flow that already works in the live app (tested 4 Nov 2026).

---

## 1. `order_update`: distributor responded to a chemist's order
**Trigger:** the distributor confirms the order, marks short supply, or rejects it.

**en:**
> Order update from {{1}}: your order placed on {{2}} is now {{3}}. Open Rx Fingertip to see item quantities.

**te:**
> {{1}} నుండి ఆర్డర్ సమాచారం: {{2}} న మీరు పంపిన ఆర్డర్ ఇప్పుడు {{3}}. వస్తువుల పరిమాణాలు చూడటానికి Rx Fingertip తెరవండి.

**Samples:** `{{1}}` Sri Vasudeva Medical Agencies · `{{2}}` 4 Nov 2026 · `{{3}}` confirmed with short supply

**Button:** Visit website → `https://rx-fingertip.lovable.app/orders`

---

## 2. `bill_ready`: distributor attached the invoice
**en:**
> Bill {{1}} for your order is ready. Total ₹{{2}}. You can view and download the invoice in Rx Fingertip.

**te:**
> మీ ఆర్డర్‌కు బిల్ {{1}} సిద్ధంగా ఉంది. మొత్తం ₹{{2}}. ఇన్వాయిస్‌ను Rx Fingertip లో చూసి డౌన్‌లోడ్ చేయవచ్చు.

**Samples:** `{{1}}` INV-2041 · `{{2}}` 313.60

**Button:** Visit website → `https://rx-fingertip.lovable.app/orders`

---

## 3. `payment_recorded`: payment entered in the party ledger
**en:**
> Payment of ₹{{1}} by {{2}} was recorded on {{3}}. Balance due now: ₹{{4}}.

**te:**
> ₹{{1}} చెల్లింపు ({{2}}) {{3}} న నమోదైంది. ఇప్పుడు మిగిలిన బాకీ: ₹{{4}}.

**Samples:** `{{1}}` 100.00 · `{{2}}` UPI · `{{3}}` 4 Nov 2026 · `{{4}}` 213.60

---

## 4. `preorder_ready`: the chemist marked a patient's pre-order ready
Sent only to a patient who joined the shop with consent.

**en:**
> Your medicine list sent to {{1}} is ready for pickup. Message from the shop: {{2}}. Please bring your prescription if needed.

**te:**
> {{1}} కు మీరు పంపిన మందుల జాబితా తీసుకెళ్లడానికి సిద్ధంగా ఉంది. షాప్ సందేశం: {{2}}. అవసరమైతే మీ ప్రిస్క్రిప్షన్ తీసుకురండి.

**Samples:** `{{1}}` Mega Pharmacy · `{{2}}` collect after 6 pm

---

## 5. `return_decision`: distributor accepted or rejected a stock return
**en:**
> Your return of {{1}} was {{2}} by {{3}}. Credit: ₹{{4}}.

**te:**
> మీరు తిరిగి పంపిన {{1}} పై {{3}} నిర్ణయం: {{2}}. క్రెడిట్: ₹{{4}}.

**Samples:** `{{1}}` 1 strip · `{{2}}` accepted · `{{3}}` Sri Vasudeva Medical Agencies · `{{4}}` 22.40

---

## 6. `stock_expiry_alert`: daily or weekly shop alert, sent to the shop owner only
**en:**
> Stock check for {{1}}: {{2}} items expire within 90 days and {{3}} items are below the reorder level. Open Rx Fingertip to see the list.

**te:**
> {{1}} స్టాక్ తనిఖీ: {{2}} వస్తువులు 90 రోజుల్లో గడువు ముగుస్తాయి, {{3}} వస్తువులు రీఆర్డర్ స్థాయి కంటే తక్కువగా ఉన్నాయి. జాబితా చూడటానికి Rx Fingertip తెరవండి.

**Samples:** `{{1}}` Shop 33 · `{{2}}` 14 · `{{3}}` 6

**Button:** Visit website → `https://rx-fingertip.lovable.app/stock-records`

---

## After approval
- **Sending:** the Supabase function sends with `type: "template"`, `template.name`, `language.code` (`en` or `te`) and `components[0].parameters` in variable order.
- **Free-form replies:** these are allowed only within 24 hours of the customer's last message. Outside that window, a template is required.
- **Delivery status:** sent, delivered, read and failed are already stored in `whatsapp_status` and copied to the Google Sheet (Delivery tab).
- **Opt-in:** patients must agree before receiving WhatsApp messages. The shop-join consent covers sharing name and phone with the shop, but **not** WhatsApp messaging, so a separate opt-in tick box is still needed. This is a Lovable task.
