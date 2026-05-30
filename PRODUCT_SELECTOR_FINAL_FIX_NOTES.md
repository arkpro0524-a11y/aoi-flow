# AOI FLOW 修正メモ

このZIPは、必要な作業以外の既存機能を削除しない方針で作成しています。

## 実施内容

1. ProductPlacementEditor修正
- 前景画像の読み込みに失敗しても画面全体を落とさないようにしました。
- URL切れ、削除済み画像、CORS失敗時は console.warn のみにして編集を継続します。

2. PRODUCT SELECTORテンプレ残骸削除
- 「観測テンプレート」カードを画面から削除しました。
- 初期入力値は空のままです。
- 入力前は結果欄に空状態の説明だけを表示します。

3. PRODUCT SELECTOR文化観測OS化
- 既存のAI理論層、JSON固定出力、文脈・視覚・空気・市場兆候分析を保持しています。
- 価格判断ではなく、文化・空気・時代感の観測に寄せています。

4. SELL CHECK連携
- PRODUCT SELECTOR結果からSELL CHECKへ進む導線を保持しています。
- 価格・回転・仕入れ上限判断はSELL CHECK側に分離しています。

5. PRODUCT SELECTOR AI強化
- 専用AIプロンプト、JSON固定出力、観測ログ保存APIを保持しています。

## 既存機能削除監査

- 削除ファイル: 0件
- 追加ファイル: 1件（このメモ）
- 主な変更ファイル:
  - app/flow/drafts/new/components/ProductPlacementEditor.tsx
  - app/flow/product-selector/page.tsx
