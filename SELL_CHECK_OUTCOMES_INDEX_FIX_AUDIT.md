# SELL CHECK 実務ログ Firestore index 回避修正 監査

## 発生していた問題

`/api/sell-check/outcomes` の GET で、Firestore の以下クエリが複合インデックスを要求して 500 になっていました。

- `where("uid", "==", uid)`
- `orderBy("createdAt", "desc")`
- `limit(100)`

このため、売れる診断周辺で実務ログ取得が失敗し、「診断できない／画面がエラーになる」原因になっていました。

## 修正対象ファイル

- `app/api/sell-check/outcomes/route.ts`

## 修正内容

- Firestore クエリから `orderBy("createdAt", "desc")` と `limit(100)` を外しました。
- `uid` のみで取得し、アプリ側で `createdAt` 降順ソートと 100 件制限を行うようにしました。
- 既存コレクション名 `sellCheckOutcomeLogs` は変更していません。
- POST 保存処理は変更していません。
- 既存 SELL CHECK 診断ロジックは変更していません。

## 既存機能破壊監査

- 既存API削除：なし
- 既存lib削除：なし
- SELL CHECK削除：なし
- PRODUCT SELECTOR削除：なし
- marketFusion削除：なし
- theoryDB削除：なし
- marketStructure削除：なし
- 画像生成削除：なし
- 背景生成削除：なし
- SNS生成削除：なし
- 商品説明生成削除：なし
- 下書き一覧削除：なし
- 投稿済み削除：なし
- 学習データ管理削除：なし

## 注意

この修正は Firestore index 未作成環境でも即動かすための安全修正です。
データ件数が大きくなった後に高速化したい場合は、Firebase Console の複合インデックスを作成してからサーバー側 orderBy に戻す選択肢があります。
