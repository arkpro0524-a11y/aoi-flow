# SELL CHECK 回転予測・画像評価・市場評価 修正監査

## 修正対象
- app/api/sell-check/analyze/route.ts
- app/api/sell-check/image-analyze/route.ts
- lib/types/sellCheck.ts
- lib/sellCheck/scoring.ts
- app/flow/sell-check/page.tsx

## 修正内容
- 売値別の回転予測を追加
  - 早売り / 安全売り / 標準売り / 攻め売り
  - 売値ごとの売却日数目安
  - 売値ごとの実利益
  - 市場信頼度
- 未知ブランドをブランド力1として扱いすぎる問題を補正
  - 作家名・メーカー名・シリーズ名・作品名などがある場合、未知＝価値なしにしない
- 画像評価3/100のような異常低値を補正
  - 画像ありで全項目が異常低値の場合、中立〜やや良好の基準値へ補正
  - 総合点だけが異常に低い場合、明るさ・構図・背景・傷リスクの合成点へ補正
- 売れる診断UIに「売値別・回転予測」を表示

## 既存機能破壊監査
- 既存API削除なし
- 既存lib削除なし
- SELL CHECK削除なし
- PRODUCT SELECTOR削除なし
- marketFusion削除なし
- theoryDB削除なし
- marketStructure削除なし
- 画像生成削除なし
- 背景生成削除なし
- 商品説明生成削除なし
- SNS生成削除なし
- 学習データ管理削除なし

## build
- sandbox内では node_modules がないため `npm run build` は `next: not found` で未実行。
- 変更は既存構造を維持した最小差分。
