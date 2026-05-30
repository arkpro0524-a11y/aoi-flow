# AOI FLOW / PRODUCT SELECTOR + SELL CHECK 最終再構成メモ

## 実装内容

- `/flow/product-selector` を新設
- `lib/productSelector/scoring.ts` を新設
- ナビゲーションに「商品選定」を追加
- 下書き編集画面の古い「推奨価格帯」表示を、価格戦略表示へ変更
- SELL CHECKの既存価格ロジック・中央値・価格歪み・類似判定は削除しない

## 役割分担

- PRODUCT SELECTOR：どの商品ジャンルに時間と資金を使うべきか判断
- SELL CHECK：個別商品の価格・回転・利益・仕入れ上限を判断
- AOI FLOW：画像・動画・キャプションで商品文脈を増幅

## 重要方針

非売品・限定・配布品を一律で低評価しない。
中央値は観測データ上の中心価格として残す。
価格は「即売」「普通回転」「高値待ち」「市場推定」に分けて表示する。
