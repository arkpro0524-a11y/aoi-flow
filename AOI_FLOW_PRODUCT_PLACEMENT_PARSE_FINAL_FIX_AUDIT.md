# AOI FLOW ProductPlacementEditor Parse Final Fix Audit

## 修正対象
- app/flow/drafts/new/components/ProductPlacementEditor.tsx

## 修正内容
- `BackgroundAssetList` の三項演算子 JSX が閉じ切れていなかったため、`Unterminated regexp literal` として解釈されていた箇所を修正。
- 具体的には `emptyText` 側の `</div>` の後に、三項演算子を閉じる `)}` を追加。

## 維持したもの
- 座標固定ボタン
- 合成タブの統一済み調整バー
- 上部 EDIT PREVIEW 集約
- 下部重複プレビュー削除方針
- 画像アップロード / 背景生成 / 合成 / 動画 / SELL CHECK
- API / Firestore 構造

## 確認
- `npx tsc --noEmit --jsx preserve --target ES2020 --moduleResolution node --module ESNext app/flow/drafts/new/components/ProductPlacementEditor.tsx` を実行。
- React 型とエイリアス解決の依存不足エラーは出るが、少なくとも今回の JSX 構文エラーは解消済み。
