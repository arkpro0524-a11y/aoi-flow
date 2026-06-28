# AOI FLOW Cutout Engine V3 Final

AOI FLOWの既存Next.js 16 / TypeScript / Tailwind CSS / Firebase構成を維持しつつ、切り抜き処理をFastAPI + DockerのAOI Cutout Engine V3へ刷新した完成版です。

## 互換性

- 既存UI、既存ページ、既存ドラフト、既存Firestore、既存アップロード、既存画像生成、Caption Studioを維持します。
- 既存の `POST /api/cutout` は通常どおりPNGを返します。
- JSON要求時のみ `{ provider, engine, quality, elapsed, image }` を返します。

```bash
curl -H "Accept: application/json" -F file=@sample.png http://localhost:3000/api/cutout
```

## Provider

`.env.local` の `CUTOUT_PROVIDER` で切り替えます。

- `docker`: AOI Cutout Engine V3のみ使用
- `photoroom`: Photoroom APIのみ使用
- `auto`: Docker実行後、品質スコアが95未満ならPhotoroomへ切替

本番ではlocal fallbackを使いません。DockerとPhotoroomの両方が失敗した場合、低品質画像を成功扱いせずエラーにします。

## Docker

Docker Desktop for Macを起動した状態で実機確認してください。`docker compose config` だけではモデル同梱、Health、実画像切り抜きの確認にはなりません。

旧rembg Dockerが起動していると `http://localhost:8080/health` が `{ "ok": true, "engine": "rembg-updated" }` を返します。その状態ではV3ではありません。必ず旧コンテナを停止してからV3だけを起動します。

```bash
docker compose down --remove-orphans
docker rm -f aoi-flow-cutout-api aoi-flow-cutout-rembg cutout-api-rembg rembg-updated 2>/dev/null || true
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

`8080` を使っている旧コンテナが残っていないことを確認してから起動します。

```bash
docker compose up --build
```

標準では切り抜き用の `cutout-engine-v3` だけが起動します。既存の動画焼き込み用 `burn-api` も同時に起動したい場合だけ、次を使います。

```bash
docker compose --profile video up --build
```

別ターミナルでHealthを確認します。

```bash
curl http://localhost:8080/health
```

期待レスポンス:

```json
{
  "ready": true,
  "provider": "docker",
  "engine": "BiRefNet",
  "version": "v3"
}
```

`ok:true` や `engine:"rembg-updated"` が返る場合は旧Dockerが残っています。上の停止手順を再実行してください。Next.js側もV3 Healthの `ready:true` / `provider:"docker"` / `version:"v3"` が揃わない限りReady扱いしません。

## AI Engine

標準エンジンは高品質切り抜き用の `BiRefNet` です。品質を犠牲にしたFast Matte版は採用していません。

現在:

1. BiRefNet

拡張候補:

1. RMBG
2. rembg(isnet)
3. SAM2 / GroundingDINO / SegAnything

`cutout-engine-v3/main.py` の `CutoutEngine` 抽象を実装することで、RMBG / rembg(isnet) / SAM2 / GroundingDINO / SegAnythingへ交換できます。

## Docker高速化の理由

旧構成で `pip install` が長時間化した原因は、BiRefNetに必要なPyTorch系に加えて、同じイメージへ `rembg` / `onnxruntime` / `opencv-python-headless` / `kornia` まで入れていたことです。

- `torch` / `torchvision`: BiRefNet推論に必須。最も重いが品質維持のため削除しません。
- `transformers`: BiRefNetをHugging Face形式で読み込むために必須。
- `timm`: BiRefNetのbackbone実装で必要。
- `kornia`: BiRefNetのHugging Face modeling fileが要求する画像処理/テンソル演算依存。
- `einops`: BiRefNetのHugging Face modeling fileが要求するテンソル変形依存。
- `safetensors`: モデル重みの安全な読み込みに必要。
- `numpy`: マスク後処理と品質判定に必要。
- `pillow`: 画像読み込み、EXIF回転、リサイズ、アルファ合成、PNG出力に必要。
- `fastapi`: `/health` と `/cutout` のHTTP APIに必要。
- `uvicorn`: FastAPIを起動するASGIサーバー。`uvicorn[standard]` は追加依存が増えるため使いません。
- `python-multipart`: `POST /cutout` のmultipart画像アップロードに必要。
- `huggingface-hub`: Docker build時にBiRefNetモデルをイメージへ同梱するために必要。

削除した依存:

- `rembg`: BiRefNet標準構成では不要。ONNX系依存を増やすため削除。
- `onnxruntime`: BiRefNet標準構成では不要。
- `opencv-python-headless`: alpha refinementをPillow + numpyへ置換したため不要。

## Model Policy

Docker起動時にGitHubからモデルを取得しません。BiRefNetモデルはDocker build時に `/models/birefnet` へ取得し、起動後はReady状態で使える構成です。

## Quality

品質は100点満点で判定します。

- 輪郭
- 欠損
- 穴
- 透明
- ノイズ
- エッジ
- 前景割合
- 被写体認識

PNG互換レスポンスでは `X-Cutout-Quality` と `X-Cutout-Meta` ヘッダーに情報を載せます。

## Firestore / SaaS

認証ヘッダーがある場合、Firestoreへ利用状況を保存します。

- `users/{uid}/usage/{month}`
- `month`
- `count`
- `limit`
- `cutoutUsage`

`CUTOUT_USAGE_ENFORCE_AUTH=true` の場合は未ログイン利用を停止します。月間上限を超えた場合は `402` を返すため、追加課金導線へ接続できます。

## 管理画面

`/flow/cutout-admin` で以下を表示します。

- Provider
- Engine
- Quality
- Elapsed
- Usage
- Month

## .env.local

`.env.sample` をコピーして設定します。本番ではFirebaseとPhotoroomの実値を必ず設定してください。

```bash
cp .env.sample .env.local
```

主要設定:

```bash
CUTOUT_PROVIDER=auto
CUTOUT_DOCKER_URL=http://localhost:8080/cutout
CUTOUT_DOCKER_HEALTH_URL=http://localhost:8080/health
CUTOUT_AUTO_QUALITY_THRESHOLD=95
CUTOUT_MIN_ACCEPT_QUALITY=35
PHOTOROOM_API_KEY=
```

Firebaseの公開設定が未設定でも開発時とNext.js build時は安全なプレースホルダーで回避します。本番ブラウザ実行時に未設定の場合は明確なエラーで停止します。

## Verification

```bash
npm run typecheck
npm run build
docker compose up --build
curl http://localhost:8080/health
```

## 実画像Cutoutテスト

Docker Healthが `ready:true` になった後、実画像で `/cutout` とNext.js側 `/api/cutout` の両方を確認します。

Docker Engine直叩き:

```bash
curl -o /tmp/aoi-cutout-docker.png \
  -F file=@/absolute/path/to/sample.png \
  http://localhost:8080/cutout
```

Next.js API互換PNG:

```bash
npm run dev
curl -D /tmp/aoi-cutout-headers.txt \
  -o /tmp/aoi-cutout-next.png \
  -F file=@/absolute/path/to/sample.png \
  http://localhost:3000/api/cutout
```

JSONメタ確認:

```bash
curl -s \
  -H "Accept: application/json" \
  -F file=@/absolute/path/to/sample.png \
  http://localhost:3000/api/cutout | jq '{provider, engine, quality, elapsed}'
```

Provider切替:

```bash
CUTOUT_PROVIDER=docker npm run dev
CUTOUT_PROVIDER=photoroom npm run dev
CUTOUT_PROVIDER=auto npm run dev
```

確認項目:

- PNGに透明背景がある
- `X-Cutout-Provider` が期待どおり
- `X-Cutout-Engine` が `BiRefNet` / `Photoroom` のいずれか
- `X-Cutout-Quality` が低品質時に成功扱いされない
- `auto` で95未満のときPhotoroomへ切り替わる

## Docker build時間の計測

Mac実機で以下を実行し、`real` の値を確認します。

```bash
/usr/bin/time -p docker compose build --no-cache cutout-engine-v3
docker compose up -d cutout-engine-v3
curl http://localhost:8080/health
```

このCodex実行環境ではDocker socketが `operation not permitted` で拒否されるため、Docker buildの完走実測はMac実機で行ってください。DockerfileはBuildKitのpip cacheとHugging Face cacheを使うため、2回目以降の再ビルドは大幅に短縮されます。品質維持のため `torch` / `transformers` / `timm` は残しています。

切り抜き品質テスト対象:

- 白商品
- 黒商品
- 家具
- ガラス
- ぬいぐるみ
- フィギュア
- 植物
- 透明商品
