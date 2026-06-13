# AOI FLOW Layout Preview Tabs Fix Audit

## 実施内容
- 商品画像作成画面の上部に編集プレビュー画面を追加。
- 文章作成枠は既存のまま維持。
- 操作エリアを「素材」「背景」「合成」「動画」の4タブに分離。
- 素材タブに画像アップロード・元画像編集・文字焼き込み導線を集約。
- 背景タブにテンプレ背景・AI背景・使用シーン/ストーリー生成を集約。
- 合成タブは商品/背景合成を単体で開けるように変更。
- 動画タブは既存の商品動画/ブランドCM構造を維持。

## 変更ファイル
- app/flow/drafts/new/page.tsx
- app/flow/drafts/new/components/ImageTabPanel.tsx
- app/flow/drafts/new/components/BackgroundPanel.tsx

## 既存機能維持
- API変更なし。
- Firestore構造変更なし。
- 画像アップロード、背景生成、AI背景、合成、動画、売れる診断の既存導線は削除なし。

## 注意
- この修正はUIレイアウト再編であり、生成ロジックや保存ロジックには触れていません。
