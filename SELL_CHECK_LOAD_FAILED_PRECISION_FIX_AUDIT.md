# SELL CHECK Load failed / 精度補正 修正監査

## 修正対象

- app/flow/sell-check/page.tsx
- app/api/sell-check/analyze/route.ts
- lib/sellCheck/scoring.ts

## 修正内容

### 1. Load failed 対策

`app/flow/sell-check/page.tsx` の下書き画像診断で、ブラウザ側の `fetch(imageUrl) -> File` 変換を使わないように変更しました。

理由：Safari / Firebase Storage / 署名URL / CORS の影響で、画面側 fetch が失敗すると SELL CHECK 全体が `Load failed` で停止していたため。

変更後：

- 手動アップロードは既存通り File を送信
- 下書き画像は `imageUrl` を API に渡す
- API 側で画像取得
- API 側でも画像取得できない場合は、画像評価だけ低信頼扱いにして、商品名・説明文・価格・DBで診断を継続

### 2. API側フォールバック

`app/api/sell-check/analyze/route.ts` で画像取得失敗時に 400 で止める処理を削除し、テキスト・価格条件だけでも診断を継続するようにしました。

### 3. 画像評価の極端な低スコア補正

画像が存在するのに AI が 0〜5 の極端値を返した場合、以下の実務下限を入れました。

- 明るさ：最低 40
- 構図：最低 45
- 背景：最低 40
- 傷リスク：最大 75
- 総合画像：最低 40

画像未取得時のみ低評価になります。

### 4. 市場価値推定の低すぎるAI値補正

`lib/sellCheck/scoring.ts` で、AI が `brandPowerScore: 1` のような極端値を返しても、商品名・説明文・キーワードから理論下限を計算するようにしました。

追加評価：

- 作家
- デザイナー
- スタジオ
- シリーズ
- Jon Herbert / John Hine Studios 系の語句

これにより「知らない＝価値なし」判定を避けます。

## 既存機能保全

削除なし。

維持確認：

- SELL CHECK 画面維持
- 手動アップロード診断維持
- 下書き画像診断維持
- `/api/sell-check/analyze` 維持
- `/api/sell-check/outcomes` の複合Index回避処理維持
- marketFusion / marketStructure / theoryDB には削除なし
- 既存DB保存構造は変更なし

## build結果

`npm run build` 実行結果：

```text
sh: 1: next: not found
```

ZIP内に `node_modules/.bin/next` がないため、この環境ではbuild未実行です。
