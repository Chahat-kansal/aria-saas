// COST-LEDGER-1 — a fixed, deliberately-simple AUD->USD conversion rate (NOT a live FX rate) used
// wherever an AUD-denominated cost needs to be compared against USD-denominated costs (the
// convention the whole cost-ledger/cost-model system uses, per CLAUDE.md's cents-in-USD pattern
// for AI pricing). Single source of truth so it can be updated in one place if it drifts materially.
export const USD_PER_AUD = 0.66
