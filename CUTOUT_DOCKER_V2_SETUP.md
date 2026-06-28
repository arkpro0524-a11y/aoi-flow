# AOI FLOW Cutout Docker v2 セットアップ

## 目的

現在のDocker切り抜きは `rembg/u2net` 系が中心で、商品画像・苔・木・細かい小物・白物に弱いです。
この修正版では、Docker切り抜きを次の2系統に増やしています。

1. `cutout-rembg`  
   - 軽量・通常用
   - 標準モデルを `isnet-general-use` に変更
   - ポート `8080`

2. `cutout-birefnet`  
   - 高品質検証用
   - BiRefNet系モデル
   - ポート `8081`
   - MacBook Airでは重い可能性があります

---

## 1. 既存Dockerを止める

```bash
# 既存のcutout-apiを止めます。消さずに停止だけです。
docker stop cutout-api-cutout-1
```

既存名が違う場合は以下で確認してください。

```bash
docker ps
```

---

## 2. 通常用Dockerを起動する

AOI FLOWのプロジェクト直下で実行します。

```bash
docker compose -f docker-compose.cutout.yml up --build cutout-rembg
```

別ターミナルで確認します。

```bash
curl http://localhost:8080/health
```

`ok: true` が返れば成功です。

---

## 3. `.env.local` の設定

通常Dockerを使う場合:

```env
CUTOUT_PROVIDER=docker
CUTOUT_API_URL=http://localhost:8080/cutout
CUTOUT_ALLOW_LOCAL_FALLBACK=false
```

高品質BiRefNetを試す場合:

```env
CUTOUT_PROVIDER=docker
CUTOUT_API_URL=http://localhost:8081/cutout
CUTOUT_ALLOW_LOCAL_FALLBACK=false
```

Photoroomを使う場合:

```env
CUTOUT_PROVIDER=photoroom
PHOTOROOM_API_KEY=ここにAPIキー
CUTOUT_ALLOW_LOCAL_FALLBACK=false
```

---

## 4. 高品質BiRefNetを起動する

```bash
docker compose -f docker-compose.cutout.yml --profile quality up --build cutout-birefnet
```

確認:

```bash
curl http://localhost:8081/health
```

注意:

- 初回はHugging Faceからモデル取得が走ります。
- MacBook Airでは処理が遅くなる可能性があります。
- 実店舗の重要商品・委託制作の高品質画像で試す位置づけです。

---

## 5. 運用方針

現時点のおすすめ:

```text
通常・無料運用:
CUTOUT_PROVIDER=docker
CUTOUT_API_URL=http://localhost:8080/cutout

高品質検証:
CUTOUT_PROVIDER=docker
CUTOUT_API_URL=http://localhost:8081/cutout

本番で品質最優先:
CUTOUT_PROVIDER=photoroom
PHOTOROOM_API_KEY=...
```

SaaS化後は、Photoroomの契約形態を「月額」か「1枚ごと」かで比較し、安い方を採用します。
ユーザーごとの枚数制限・超過課金はFirestoreで管理する方針です。

---

## 6. 今回追加されたファイル

```text
cutout-api-rembg/
  Dockerfile
  main.py
  requirements.txt

cutout-api-birefnet/
  Dockerfile
  main.py
  requirements.txt

docker-compose.cutout.yml
CUTOUT_DOCKER_V2_SETUP.md
```

既存のNext.js画面・ドラフト機能・画像保存機能は壊さない方針で、`/api/cutout` の呼び出し先だけを切り替えられる構成です。
