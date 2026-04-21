---
name: us-metrics
description: 68 US economic indicators from FRED, EIA, Treasury, BLS, Census APIs with trend analysis and cross-metric correlation. Updates Substrate dataset, produces economic overviews. USE WHEN GDP, inflation, unemployment, economic metrics, gas prices, how is the economy, update data, refresh data, get current state, economic overview, FRED, fetch FRED series, generate analysis, update substrate metrics, US metrics, economic trends.
---

## Customization

**Before executing, check for user customizations at:**
`$HOLOCRON_MEMORY_DIR/Holocron/USER/SKILLCUSTOMIZATIONS/USMetrics/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or resources found there. These override default behavior. If the directory does not exist, proceed with skill defaults.


## 🚨 MANDATORY: Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

```bash
bash ~/.pi/agent/scripts/voice.sh "Running the WORKFLOWNAME workflow in the USMetrics skill to ACTION"
```

Output text notification:
```
Running the **WorkflowName** workflow in the **USMetrics** skill to ACTION...
```

# US Metrics - Economic & Social Indicator Analysis

**Purpose:** Analyze U.S. economic and social metrics using the Substrate US-Common-Metrics dataset.

## Data Source

All metrics sourced from:
- **Location:** Configure your data directory path (e.g., `${HOLOCRON_MEMORY_DIR}/data/US-Common-Metrics/`)
- **Master Document:** `US-Common-Metrics.md` (68 metrics across 10 categories)
- **Underlying APIs:** FRED, EIA, Treasury FiscalData, BLS, Census, CDC, EPA

## Workflow Routing

| Workflow | Description | Use When |
|----------|-------------|----------|
| **UpdateData** | Fetch live data from APIs and update Substrate dataset | "Update metrics", "refresh data", "pull latest" |
| **GetCurrentState** | Comprehensive economic overview with multi-timeframe trend analysis | "How is the economy?", "economic overview", "US metrics analysis" |

## Workflows

### UpdateData

**Full documentation:** `Workflows/UpdateData.md`

```bash
bun ~/.pi/agent/skills/us-metrics/Tools/UpdateSubstrateMetrics.ts
```

### GetCurrentState

**Full documentation:** `Workflows/GetCurrentState.md`

Produces a comprehensive overview analyzing 10-year, 5-year, 2-year, and 1-year trends for all major metrics, cross-category interplay, pattern detection, and research recommendations.

## Metric Categories

1. Economic Output & Growth — GDP, industrial production, retail sales
2. Inflation & Prices — CPI, PCE, gas prices, oil prices
3. Employment & Labor — Unemployment, payrolls, jobless claims
4. Housing — Home prices, mortgage rates, housing starts
5. Consumer & Personal Finance — Sentiment, saving rate, credit
6. Financial Markets — Interest rates, Treasury yields, volatility
7. Trade & International — Trade balance, USD index
8. Government & Fiscal — Federal debt, budget deficit, spending
9. Demographics & Social — Population, inequality, poverty
10. Health & Crisis — Deaths of despair, air quality, life expectancy

## API Keys Required

- `FRED_API_KEY` — Federal Reserve Economic Data
- `EIA_API_KEY` — Energy Information Administration

## Tools

| Tool | Purpose |
|------|---------|
| `Tools/UpdateSubstrateMetrics.ts` | Fetch all metrics, update Substrate files |
| `Tools/FetchFredSeries.ts` | Fetch historical data from FRED API |
| `tools/GenerateAnalysis.ts` | Generate analysis report from Substrate data |
