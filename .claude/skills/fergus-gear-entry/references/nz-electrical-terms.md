# NZ electrical shorthand → pricebook search terms

Sparkies say things fast and loose. This maps common Linc/NZ spoken shorthand to search
terms that actually land in the Fergus pricebook. Use it to translate step-1 phrases into
step-3 `searchText`. Prefer supplier `"Ideal"` unless noted; try `"Voltex"` for lighting.

When a term is vague, search the general term, then use the confidence rules in SKILL.md —
offer a pick-list rather than guessing amperage/model/colour.

## Accessories (GPOs, switches, plates)
> **Critical term note:** the Ideal pricebook calls every socket outlet a **"socket"**, never a
> "powerpoint". Searching `powerpoint` / `double powerpoint` / `weatherproof powerpoint` returns
> **zero hits**. Always translate a spoken "powerpoint / power point / GPO" to **`socket`** before
> searching. (Verified against the live pricebook.)

| Said | Search term(s) | Notes |
|------|----------------|-------|
| GPO / power point / socket / plug | `single socket` | never "powerpoint" — 0 hits |
| double GPO / double power point | `double socket` | the everyday double socket; "double powerpoint" = 0 hits |
| weatherproof GPO / WP powerpoint / outdoor point | `weatherproof socket` | NOT "weatherproof powerpoint" (0 hits). Then single/double, 10A/15A, colour |
| USB point / USB socket | `socket USB` | |
| light switch / one-gang / two-gang | `switch 1 gang` / `switch 2 gang` | "gang" = number of switches on the plate |
| dimmer | `dimmer` | LED-compatible matters — confirm |
| blank plate | `blank plate` | |
| isolator / isolation switch | `isolator` | e.g. for heat pumps, HWC |

## Cable (all per-metre — quantity = metres)
| Said | Search term | Notes |
|------|-------------|-------|
| 1.5 TPS | `1.5 TPS` | 2c+E circular; lighting circuits |
| 2.5 TPS | `2.5 TPS` | 2c+E circular; power circuits |
| 4mm / 6mm TPS | `4 TPS` / `6 TPS` | larger loads, HWC, ovens |
| 3-core + earth | `3c TPS` / `3 core earth` | 3-way switching, some appliances |
| figure-8 / speaker | `figure 8` | |
| Cat6 / data | `Cat6` | |
| earth wire | `earth cable` / `6491X green` | |
TPS = Tough Plastic Sheathed. Always a per-metre SKU — never quantity 1 for a length.

## Lighting (try Ideal AND Voltex)
| Said | Search term | Notes |
|------|-------------|-------|
| downlight / LED downlight | `LED downlight` | many models — confirm wattage/model (Nova, Slick, Lumascan…) |
| batten / oyster / ceiling light | `batten` / `oyster` | |
| LED strip | `LED strip` | |
| flood / security light | `floodlight` | |
| exterior / bulkhead | `bulkhead` | |
| downlight with sensor | `downlight PIR` | PIR = motion sensor |
| transformer / driver | `LED driver` | |

## Protection / switchboard
| Said | Search term | Notes |
|------|-------------|-------|
| RCBO | `RCBO` | combined RCD + breaker, per-pole/amp — confirm rating |
| RCD | `RCD` | |
| breaker / MCB | `MCB` / `circuit breaker` | confirm amp rating |
| main switch | `main switch` | |
| busbar / neutral bar | `busbar` / `neutral link` | |
| enclosure / board / DB | `distribution board` / `enclosure` | DB = distribution board |
| surge / SPD | `surge` | |

## Fixings / consumables / sundries
| Said | Search term | Notes |
|------|-------------|-------|
| conduit | `conduit` | confirm size (20mm/25mm) and type (PVC/corrugated) |
| ducting / trunking | `trunking` | |
| junction box / jbox | `junction box` | |
| saddle / clip | `saddle` | |
| cable ties / zip ties | `cable tie` | |
| gland | `cable gland` | |
| WAGO / connector | `connector` / `WAGO` | |
| screws / plugs | consider the flat sundries line instead | small loose bits often go to sundries |

## Appliances / HVAC (often fixed-price, not formula — see brain rates_and_rules)
| Said | Search term | Notes |
|------|-------------|-------|
| rangehood / extractor | `rangehood` | |
| heat pump | `heat pump` | pros/cons grid per unit — usually a quote, not gear entry |
| element | `element` | HWC / oven elements |
| PIR sensor | `PIR sensor` | |

## Charges that aren't stock
Mileage, Certificate of Compliance / ESC, and the sundries line are entered as job lines too,
but they're **flat charges from the brain**, not pricebook items:
mileage $30, sundries $20, CoC $20 (all ex GST — see `rates_and_rules.flat_charges_ex_gst`).
If someone dictates "and mileage" / "cert", add these as manual lines at those figures rather
than searching the pricebook.
