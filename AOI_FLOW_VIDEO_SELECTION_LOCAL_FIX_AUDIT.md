# AOI FLOW video selection/local render fix audit

## 修正対象
- app/flow/drafts/new/components/ProductVideoPanel.tsx
- components/video/NonAiVideoActions.tsx

## 修正内容
- 「動画素材の状態」ブロックを削除し、下部に重複する大きな動画/画像プレビューが出ないように修正。
- アップロード画像選択リストは、行クリックで追加/解除できる複数選択方式に修正。
- 「ファイルを選択」ボタンは商品画像生成側から削除。画像追加は既存の通常アップロード導線に統一。
- Local Render は localhost では選択可能に修正。
- 商品画像生成は、上のアップロード画像リストで選んだ画像だけを使う方針に統一。

## 既存機能の扱い
- 商品撮影動画から作るモードの動画ファイル選択は維持。
- 広告動画生成、文字焼き込み、保存/投稿待ち/投稿済み操作は維持。
- 生成画像・背景画像をアップロード画像リストに混ぜない方針は維持。

## 監査
- tsc実行は、node_modules が展開されていない環境のため React/Next/Firebase 型が解決できず失敗。
- 今回の修正による構文確認は対象箇所を目視確認。
