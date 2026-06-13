# AOI FLOW hideMainPreview Prop Build Fix Audit

## 修正理由
Vercel build で BackgroundPanel.tsx から ProductPlacementEditor へ渡している `hideMainPreview` が Props 型に存在せず TypeScript エラーになっていた。

## 修正内容
- `app/flow/drafts/new/components/ProductPlacementEditor.tsx`
  - `Props` に `hideMainPreview?: boolean` を追加
  - 既存の座標固定・背景/商品/影/合成・合成前/合成後切替は削除していない

## 影響範囲
- UI型定義のみ
- API / Firestore 変更なし
- 既存機能削除なし

## 確認
この環境では node_modules が無いため `npm run build` は `next: not found` で未実行。
