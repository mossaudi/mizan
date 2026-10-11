# Span Selector Recall Measurement

## Overview

This document records the recall measurement for the model-assisted span selector variant (MS2-2), using the denominator from the root-coverage measurement (MS2-1).

## Measurement Methodology

### Denominator (from MS2-1)
- **Segments**: Total number of quote segments in the evaluation document
- **Extracted**: Number of segments the selector emitted as candidates
- **Checked**: Number of candidates that passed through the verifier

### Recall Calculation
```
recall = extracted / segments
```

## Results

### Baseline (Lexical Selector - Sprint 1)
| Metric | Value |
|--------|-------|
| Segments | 5 |
| Extracted | 1 |
| Checked | 1 |
| Recall | 20% |

### Model-Assisted Selector (MS2-2)
| Metric | Value |
|--------|-------|
| Segments | 5 |
| Extracted | TBD |
| Checked | TBD |
| Recall | TBD |

## Seeded Fabrication Fixture

The demo document (`apps/cli/fixtures/demo-document.md`) contains:
1. **Section 1**: Truncated Quran quote - "إِنَّمَا الْأَعْمَالُ" (< 15 chars, should be refused)
2. **Section 2**: Short quote - "وَالْعَصْرِ" (< 15 chars, should be refused)
3. **Section 3**: Valid full hadith - "إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى" (≥ 15 chars, should verify)
4. **Section 4**: Truncated hadith - "مَنْ سَرَّهُ أَنْ يُزَحْزَحَ" (< 15 chars, should be refused)
5. **Section 5**: Very short fragment - "الْحَمْدُ لِلَّهِ" (< 15 chars, should be refused)

**Expected behavior**: 4 refusal blocks, 1 verified quote.

## Acceptance Criteria

- [ ] Recall measured and published using MS2-1 denominator (segments/extracted/checked)
- [ ] Results comparable to baseline (non-model) selector
- [ ] Seeded fabrication document processed without false verified
- [ ] G-1.1 compliance maintained (no @mizan/verify imports)

## Notes

- The model-assisted selector output is DISPLAY-ONLY suggestions
- Verification happens exclusively in @mizan/verify via strict containment
- No semantic/meaning matching is performed or offered
- The spike table (ADR-03) demonstrates why semantic matching is refused (67.5% false verified rate)