# DRAFT LIST TITLE / ORDER FIX AUDIT

## 変更対象
- app/flow/drafts/page.tsx

## 修正内容
1. 下書き一覧の表示タイトルを Vision 優先から商品名優先へ変更
   - 優先順：ecTitle → productName → title → caption_final → vision → （商品名未入力）
   - 既存データ互換のため、Vision は最後の保険としてのみ残しました。

2. 下書き一覧の表示順を変更できるように修正
   - 各下書きに ↑ / ↓ ボタンを追加
   - 押下後、Firestore の drafts/{draftId}.displayOrder に保存
   - displayOrder が存在する場合は displayOrder 優先、未設定の既存下書きは従来通り updatedAt desc

3. 表示形式切替を追加
   - カード
   - リスト
   - コンパクト
   - localStorage に表示形式を保存

## 構造保全
- 削除ファイルなし
- API削除なし
- lib削除なし
- 商品画像作成 / 下書き編集 / 透過 / 合成処理には未変更
- 変更は下書き一覧画面のUIと表示順保存のみ

## buildについて
- sandbox内では npm install が ffmpeg-static の GitHub取得失敗で完了できず、build未実行。
- 既存環境で node_modules がある場合は通常の npm run dev / npm run build で確認してください。
