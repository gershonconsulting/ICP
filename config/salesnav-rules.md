# Sales Navigator link rules (ICP → direct search links)

Rule set for turning an ICP analysis into direct LinkedIn Sales Navigator search links.
Mirrors Olivier's GPT USA logic (2026-10-07). Shared with gershonconsulting/sales (config/salesnav-rules.md).

## Core principle
Reuse verified LinkedIn filter IDs. Never invent them.

## Verified IDs (only these are trusted)
| Filter | id | text |
|---|---|---|
| SENIORITY_LEVEL | 120 | Senior |
| SENIORITY_LEVEL | 310 | CXO |
| REGION | 102221843 | North America |
| RELATIONSHIP | S | 2nd degree connections |
| SENIORITY_LEVEL | 320 | Owner / Partner (verified 2026-10-28) |
| SENIORITY_LEVEL | 300 | Vice President (verified 2026-10-28) |
| SENIORITY_LEVEL | 220 | Director (verified 2026-10-28) |
| REGION | 103644278 | United States (verified 2026-10-28) |
| CURRENT_TITLE | (no id) | free text, e.g. `(text:Director%20of%20Genomics,selectionType:INCLUDED)` (verified 2026-10-28) |

Verified = opened in Sales Navigator and the chip rendered with the right label.
No verified IDs yet for: industries, company headcount, function, company type, activity filters.

## Lessons from the 2026-10-28 live test
- Long keyword phrases are read as AND of every word: "spatial biology core facility director" + Senior/CXO + 2nd degree = 3 results. Put titles in CURRENT_TITLE and industry terms in keywords joined with OR.
- "Senior" (120) is an individual-contributor level; buyers are Owner/Partner, CXO, VP, Director.
- 8 OR keywords on a persona search = 59K loose matches; 3-4 lead industry terms = ~1K on-target.
- 2nd degree is offered as a second link per row, not forced: it cut good segments to near zero.
To add one: take a working Sales Navigator URL that contains the filter, record its id/text here with the date.

## Base structure (must be ONE line in any generated link)
https://www.linkedin.com/sales/search/people?query=(recentSearchParam:(doLogHistory:true),filters:List((type:SENIORITY_LEVEL,values:List((id:120,text:Senior,selectionType:INCLUDED),(id:310,text:CXO,selectionType:INCLUDED))),(type:REGION,values:List((id:102221843,text:North%20America,selectionType:INCLUDED))),(type:RELATIONSHIP,values:List((id:S,text:2nd%20degree%20connections,selectionType:INCLUDED)))))&viewAllFilters=true

Extra filters go inside the same `filters:List(...)`:
`(type:FILTER_NAME,values:List((id:VALUE,text:TEXT,selectionType:INCLUDED)))`
Exclusions use `selectionType:EXCLUDED`, only when that filter's representation is verified.

## Rules
1. Start from the ICP: geography, seniority, titles, industries, company size, functions, company type, relationship, engagement signals.
2. Map: geography → REGION · seniority → SENIORITY_LEVEL · role → TITLE · industry → INDUSTRY · size → COMPANY_HEADCOUNT · department → FUNCTION · company traits → COMPANY_TYPE · warm intros → RELATIONSHIP · intent → activity filters. Use a filter only when its structure and IDs are verified.
3. A working URL from Olivier is the source of truth: parse it, keep its IDs and syntax, change only the ICP-specific criteria.
4. Strip sessionId, tracking tokens, temporary IDs and any session parameters from reusable links.
5. Never guess IDs. Build the strongest valid link and list the filters to apply manually.
6. One search per persona (CEO/Founder, COO/Operations, VP/Director, Procurement, Technology, CFO/Finance), not one overloaded search.
7. Include buyers; exclude competitors, recruiters, consultants, students, irrelevant industries, when the representation is known.
8. URL-encode text values (e.g. `Chief%20Executive%20Officer`) while keeping the nested `( ) : ,` syntax intact.
9. Never break a link across lines; LinkedIn drops the filters.

## Output for every request
- ICP → filter mapping
- Persona-specific direct links (raw URL + clickable)
- Fallback standard LinkedIn searches
- Filters still to apply manually
