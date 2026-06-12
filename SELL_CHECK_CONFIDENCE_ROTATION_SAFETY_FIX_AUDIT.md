# SELL CHECK confidence / rotation safety fix audit

## Purpose

This patch fixes the remaining overconfidence after the precision full fix.

## Fixed points

1. Similar-data confidence no longer becomes `high` from count alone.
   - When sold similar data is numerous but strong matches are missing, confidence is capped to `medium` or `low`.
   - This prevents the dangerous state: `類似データ信頼度：high` while `強一致件数：0`.

2. Rotation learning no longer says the market is fast just because sold data exists.
   - Fast rotation now requires both enough sold data and strong similarity evidence.
   - When strong matches are weak, rotation is downgraded to normal/slow and the reason says it was corrected safely.

## Files changed

- `lib/sellCheck/scoring.ts`
- `lib/sellCheck/rotationLearning.ts`

## Existing feature preservation

No routes, pages, components, API endpoints, Firebase integration, draft flows, image flows, or SELL CHECK result objects were removed.
Only scoring confidence and rotation wording/logic were tightened.

## Expected UI change

Before:

- `類似データ信頼度：high`
- `強一致件数：0`
- `売却済みデータが一定数あり、回転しやすい市場として扱います`

After:

- Confidence is reduced to safe side when strong matches are missing.
- Rotation reasons explain strong-match shortage instead of claiming fast rotation from count alone.
