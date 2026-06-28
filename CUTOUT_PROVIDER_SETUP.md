# AOI FLOW 切り抜きエンジン設定

## 目的

AOI FLOW の `/api/cutout` は、無料Dockerと有料APIを切り替えられる構成にしました。
現状の実店舗・委託運用では Docker を使い、品質が必要な時点で Photoroom API へ切り替えられます。
SaaS化時も同じ入口 `/api/cutout` を維持したまま、プラン別の枚数制限や課金へ拡張できます。

## .env.local 例

### 1. 本番高精度：Photoroomのみ

```env
CUTOUT_PROVIDER=photoroom
PHOTOROOM_API_KEY=取得したAPIキー
```

### 2. 自動：Photoroom → 自前高精度AI → 既存Docker

```env
CUTOUT_PROVIDER=auto
PHOTOROOM_API_KEY=取得したAPIキー
CUTOUT_API_URL=http://localhost:8080/cutout
```

### 3. 現状維持：既存Dockerのみ

```env
CUTOUT_PROVIDER=docker
CUTOUT_API_URL=http://localhost:8080/cutout
```

### 4. 開発用：ローカル色判定も許可

```env
CUTOUT_PROVIDER=auto
CUTOUT_ALLOW_LOCAL_FALLBACK=true
```

## Provider一覧

- `auto`：Photoroom → AI_CUTOUT_API_URL/CUTOUT_PROVIDER_URL → Docker の順で試す
- `photoroom`：Photoroom APIのみ使う
- `high-precision`：AI_CUTOUT_API_URL または CUTOUT_PROVIDER_URL のみ使う
- `docker`：CUTOUT_API_URL または http://localhost:8080/cutout のみ使う
- `local`：Next.js内の色判定切り抜きのみ使う

## レスポンスヘッダー

切り抜き後のPNGには、確認用ヘッダーを付けています。

- `X-Cutout-Engine`：採用されたエンジン
- `X-Cutout-Verified`：採用された処理名
- `X-Cutout-Quality-Score`：簡易品質スコア
- `X-Cutout-Attempts`：試行履歴

## 重要

ローカル色判定は、商品内の緑・白・ベージュ・影を削る危険があります。
そのため、本番ではデフォルトで無効にしました。
