# SELL CHECK 精度修正・監査メモ

## 修正対象

- `lib/types/sellCheck.ts`
- `lib/sellCheck/scoring.ts`
- `app/flow/sell-check/page.tsx`

## 実施した修正

1. 説明文品質ロジック修正
   - OpenAI側の `descriptionQualityScore` が極端に低い場合でも、ブランド・型番・素材・年代・商品種別・サイズ情報から構造補正するように変更。
   - 例：Jon Herbert / Upside Down Shoe / 1991年 / ポリストーン樹脂 / 置物 などが入っている説明文を 3/100 のまま扱わない。

2. 回転率予測修正
   - `売れ行きは遅め` と `回転学習：早い / 1〜14日` が同時表示される矛盾を解消。
   - 最終売れ行き判定が slow / collector_wait の場合、回転学習表示も安全側へ統一。

3. 総合点内訳表示
   - 価格・状態・画像・説明文・類似価格・市場価値・在庫圧補正・補正前スコア・最終スコアを `scoreBreakdown` として返却。
   - SELL CHECK画面に「総合点内訳」セクションを追加。

4. 一致度詳細表示
   - 類似判定の最大一致重み、平均一致重み、強一致件数、ブランド/型番/商品種別/素材/年代の情報件数を表示。
   - 類似件数が多くても強一致が少ない場合は、別商品混入の注意を出す。

5. 理論DB重複除去の補助
   - 理由配列は従来通り `pushUnique` で重複排除。
   - 一致度詳細・総合点内訳を別枠化し、理由欄だけに判断根拠が過密集中しないように整理。

## 既存機能監査

- ファイル削除なし。
- SELL CHECKの既存API・画面構造は維持。
- 既存の profit / acquisition / priceDistortion / rotationLearning / marketStructure は削除せず、補助情報を追加。
- `draft outcome.sellCheck` に保存される診断結果の互換性を壊さないよう、追加フィールド形式で拡張。

## 実行確認

- `npx tsc --noEmit --pretty false` 成功。
- `npm run build` は Next.js の page data collection でコンテナ時間切れ。TypeScript とコンパイル工程は通過済み。
