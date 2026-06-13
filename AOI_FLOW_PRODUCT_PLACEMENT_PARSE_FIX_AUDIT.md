# AOI FLOW ProductPlacementEditor parse fix audit

## 修正内容
- `app/flow/drafts/new/components/ProductPlacementEditor.tsx` の JSX 三項演算子の閉じ `)}` が欠落していたため追加。
- エラー箇所: `LibraryBackgroundSection` の empty 表示分岐。
- 下部プレビュー削除・合成スライダー統一・座標固定ボタン維持の実装方針は変更なし。

## 影響範囲
- UI構造変更なし
- API変更なし
- Firestore変更なし
- 既存機能削除なし

## 備考
- この環境では node_modules が無いためビルド確認は未実行。
- 修正対象は構文エラーの解消のみ。
