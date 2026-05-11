# TradeFlow Deployment Guide

## Webhook Integration (MT4/MT5)

To sync trades from your MetaTrader terminal, use the following endpoint:
`{{APP_URL}}/api/webhook/trade?userId={{YOUR_EMAIL_OR_UID}}&secret={{WEBHOOK_SECRET}}`

### Security Configuration
1.  **WEBHOOK_SECRET**: This is a private key you define to prevent unauthorized trade injections.
2.  **Setup**:
    *   Go to the **Settings** menu in AI Studio.
    *   Add a new secret named `WEBHOOK_SECRET`.
    *   Set its value to a strong, random string.
    *   Use this same string in your MT4/MT5 webhook script.

## Environment Variables
*   `GEMINI_API_KEY`: (Auto-injected) Required for AI Insights.
*   `APP_URL`: (Auto-injected) The base URL of your deployed app.
*   `WEBHOOK_SECRET`: (Manual) Your custom security key for broker sync.
