# SELL CHECK Load failed 修正監査

## 原因

1. `/api/sell-check/outcomes` が `where(uid).orderBy(createdAt)` の複合インデックス必須クエリになっており、Firestore index 未作成環境で 500 になっていた。
2. 下書き画像を売れる診断へ送る際、Safari/CORS/Storage設定によりブラウザ側 `fetch(imageUrl)` が `Load failed` になると、診断APIへ到達する前に止まっていた。

## 修正

- `app/api/sell-check/outcomes/route.ts`
  - `orderBy(createdAt)` を削除。
  - `where(uid)` のみで取得し、アプリ側で `createdAt` 降順ソート、100件制限。
  - 既存Firestoreコレクション・保存形式は変更なし。

- `app/api/sell-check/analyze/route.ts`
  - 画像Fileがない場合、`imageUrl` をサーバー側で取得して診断できるフォールバックを追加。
  - 既存の手動アップロード・画像File診断は維持。

- `app/flow/sell-check/page.tsx`
  - 下書き画像のブラウザ側取得に失敗しても診断を止めず、`imageUrl` をAPIへ渡す。

## 構造保全

- 既存API削除なし
- 既存lib削除なし
- SELL CHECK削除なし
- 下書き一覧削除なし
- 画像生成・背景生成・SNS生成・商品説明生成削除なし
- Firestore既存データ構造変更なし
