# AOI FLOW 合成タブ操作復元・上部プレビュー切替 修正監査

## 修正内容
- 下部の大きな重複プレビューは復活させず、操作パネル中心の構成を維持。
- 合成タブに以下の操作ボタンを復元。
  - ①背景
  - 座標固定
  - ②商品
  - ③影
  - ④合成
  - 合成前プレビュー
  - 合成後プレビュー
- 合成前/合成後の切替を上部 EDIT PREVIEW と連動。
- 座標固定後に商品・影へ進む既存フローを維持。
- 商品/背景/影のスライダー調整は維持。
- API / Firestore / 保存構造は変更なし。

## 変更ファイル
- app/flow/drafts/new/page.tsx
- app/flow/drafts/new/components/ImageTabPanel.tsx
- app/flow/drafts/new/components/BackgroundPanel.tsx
- app/flow/drafts/new/components/ProductPlacementEditor.tsx

## 構文確認
TypeScript parser により以下のTSX構文エラーがないことを確認。
- page.tsx
- ImageTabPanel.tsx
- BackgroundPanel.tsx
- ProductPlacementEditor.tsx

## 既存機能
- 画像アップロード：削除なし
- 背景選択：削除なし
- テンプレ背景：削除なし
- AI背景：削除なし
- 座標固定：復元
- 商品調整：維持
- 影調整：維持
- 合成保存：維持
- 文字焼き込み保存：維持
