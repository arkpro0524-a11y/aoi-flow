# AOI FLOW remove lower duplicate previews final audit

## 対応内容
- ProductPlacementEditor.tsx の下部重複プレビューを削除。
- 下部は操作パネルだけに整理。
- 上部 EDIT PREVIEW を唯一の確認画面として扱う前提に変更。

## 残した機能
- 背景選択
- AI背景/テンプレ背景の切替
- 座標固定ボタン
- 商品サイズ/位置調整
- 影調整
- 合成保存
- 文字焼き込み保存

## 削除/非表示にした表示
- 下部の編集プレビュー表示
- 下部の保存済み完成画像プレビュー表示
- 下部の通常合成画像プレビュー表示
- 下部の文字焼き込み保存画像プレビュー表示

## 構造
- API変更なし
- Firestore変更なし
- データ構造変更なし
- UI表示整理のみ

## 構文確認
- TypeScript parser で JSX 構文エラーが出ないことを確認。
- ローカル環境には node_modules がないため Next build は未実行。
