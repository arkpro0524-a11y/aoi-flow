# AOI FLOW 復元監査

## 修正対象
- app/flow/drafts/new/components/ProductPlacementEditor.tsx

## 復元内容
- ④合成画像の調整内に、常時見える手修正UIを復元
- ①背景 / 座標固定 / ②商品 / ③影 の操作ボタンを編集プレビュー直前に配置
- 背景調整スライダーを復元
- 商品サイズ・左右・上下スライダーを復元
- 影の濃さ・ぼかし・広がり・左右・上下スライダーを復元
- 既存の合成処理・保存処理・背景選択・完成画像表示は削除なし

## 構造保全
- 既存API削除なし
- 既存lib削除なし
- 既存下書き機能削除なし
- 既存ProductPlacementEditor内の既存UIは残存
- 追加したのは編集操作パネルの表示復元のみ

## build
- このsandboxにはnode_modules/nextが無いため build は未実行
