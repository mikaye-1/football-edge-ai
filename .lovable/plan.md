# Daily Top 20 page and workbook update

## Changes
- Replace the old pick display/export fields with the reviewed prediction fields, including distinct probability, confidence, data quality, reliability, rationale, risk, and settlement status.
- Load the saved generation metadata for the selected date and present calibration bands and per-market historical results on the page and a second `Model Info` workbook sheet.
- Handle older saved picks and missing run metadata without breaking the page; preserve the existing generation and date-selection flow.
- Add focused coverage for the workbook columns and model information sections, then verify the affected tests and preview diagnostics.

## Technical details
- Keep the existing `daily_top20` and `daily_top20_runs` data sources; no database or prediction-engine changes.
- Use a small shared export helper so the page and workbook use consistent values and column order.
