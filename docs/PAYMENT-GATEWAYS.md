# Automatic payment gateway options (Egypt) — for the owner's decision

Status: NOT integrated. The app shows automatic payment as unavailable (`GET /api/v1/payment-methods` → `automatic.available=false`). Manual transfer with proof and admin review remains. Nothing here was paid for or signed up for.

Collected from the providers' own pages and one 2026 comparison article; **rates must be confirmed with each provider in writing** (wallet and InstaPay fees are not published).

| Provider | Published card fee | Wallets / InstaPay | Setup / monthly | Settlement |
|---|---|---|---|---|
| Kashier | 2.75% + 3 EGP per successful transaction (+14% VAT on the fee); refunded/failed not charged | not published, "quoted by sales" | none for online acceptance | scheduled to an Egyptian bank (no fixed duration published; one article says 3 working days) |
| Paymob | 2.75% + 3 EGP (standard), enterprise on request | not published; one article says it has the broadest wallet coverage | "no monthly or subscription fees" | weekly (standard plan) |
| Fawry | quoted per merchant (no confirmed public rate) | reference-number (cash) payments available | not published | per agreement |
| Fawaterak | 2.75% per transaction (article) | wallets supported (article) | not published | per agreement |
| Geidea | quoted per merchant | Meeza mentioned | not published | per agreement |

Onboarding generally asks for a commercial register, tax card and bank account details plus a compliance review (one article; confirm whether an individual can open an account).

What the integration needs (same for any provider): hosted checkout so card/wallet/OTP details never touch SAQR; a server-verified webhook or status API; idempotent crediting (stars are added once per paid order); no crediting on browser return or on a receipt image alone.

Sources: https://www.kashier.io/pricing · https://www.paymob.com/en/pricing · https://www.kerolosxgad.com/writing/payment-gateways-egypt-comparison
