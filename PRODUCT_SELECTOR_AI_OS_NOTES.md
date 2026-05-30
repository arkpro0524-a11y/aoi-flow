# PRODUCT SELECTOR AI OS 修正メモ

## 実装内容

PRODUCT SELECTOR を「ルール採点だけ」から、以下の構造へ拡張しました。

1. 観測素材を入力
2. PRODUCT SELECTOR専用理論プロンプトでAI抽出
3. JSON固定出力
4. アプリ側の固定スコアOSで正規化
5. Firestoreへ観測ログ保存
6. 個別価格判断はSELL CHECKへ接続

## 追加ファイル

- `lib/productSelector/scoring.ts`
- `lib/productSelector/aiTheory.ts`
- `app/api/product-selector/analyze/route.ts`
- `app/flow/product-selector/page.tsx`

## 変更ファイル

- `components/FlowShell.tsx`
  - ナビに「商品選定」を追加

## 重要方針

- PRODUCT SELECTORは自動購入AIではありません。
- PRODUCT SELECTORは転売BOTではありません。
- PRODUCT SELECTORは価格診断機能ではありません。
- PRODUCT SELECTORは文化・空気・時代感の観測OSです。
- 価格・利益・仕入れ上限はSELL CHECKで判断します。

## 既存機能

必要な作業以外の既存機能は削除していません。
