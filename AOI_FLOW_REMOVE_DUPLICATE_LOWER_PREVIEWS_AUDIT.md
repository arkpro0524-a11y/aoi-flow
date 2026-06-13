# AOI FLOW Remove Duplicate Lower Previews Audit

## 目的
上部 EDIT PREVIEW に各タブの確認画面を集約したため、下部操作枠に残っていた重複プレビューを非表示化。

## 変更対象
- app/flow/drafts/new/components/ImageTabPanel.tsx
- app/flow/drafts/new/components/BaseImagePanel.tsx
- app/flow/drafts/new/components/BackgroundPanel.tsx
- app/flow/drafts/new/components/ProductPlacementEditor.tsx

## 変更内容
- 素材タブ：下部の元画像固定プレビューを非表示。アップロード・透過・手修正・文字焼き込み操作は維持。
- 背景タブ：下部の背景生成プレビューを非表示。テンプレ背景生成・AI背景生成・同期・選択操作は維持。
- 合成タブ：下部の編集プレビュー/保存済み完成画像プレビューを非表示。背景選択・位置・サイズ・影・合成保存操作は維持。
- 上部 EDIT PREVIEW は維持。

## 削除していない機能
- 画像アップロード
- 透過
- 手修正UI
- 文字焼き込み
- テンプレ背景生成
- AI背景生成
- 背景選択
- 合成
- 影調整
- 動画タブ
- SELL CHECK
- Firestore/API

## 注意
この環境では依存関係が無いためビルド確認は未実行。
