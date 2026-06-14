# AOI FLOW 画像切り抜き精度改善 監査メモ

## 対象
- `app/api/cutout/route.ts`

## 実施内容

### 1. 高精度AI切り抜きAPI接続口を追加
- `AI_CUTOUT_API_URL`
- `CUTOUT_PROVIDER_URL`

上記のどちらかが設定されている場合、最優先で外部の高精度AI切り抜きAPIへ投げる構造に変更。
BRIA / BiRefNet / RMBG / SAM 系の自前APIを接続可能。

### 2. 既存cutoutサーバーは維持
- `CUTOUT_API_URL`
- 未設定時の `http://localhost:8080/cutout`

既存仕様は削除せず、AI接続口の次に試行する。

### 3. ローカル救済処理を強化
従来の端背景平均 + 緑背景除去から、以下に変更。

- 端の背景色を平均ではなく優勢色クラスタで推定
- 白/薄灰/黒/緑/低彩度グレー/薄ベージュ背景に対応
- 端とつながった背景だけを透過し、商品内部の同系色破壊を抑制
- 緑背景は分断領域も追加除去
- 境界を半透明マットで軽く補正

### 4. JSON入力バグ修正
既存フロントの一部が `/api/cutout` に `application/json` で `imageUrl` を送っていたが、旧APIは `formData()` 前提だった。
今回、JSON入力にも対応。

## 監査結果

### 型チェック
- `npx tsc --noEmit` 成功

### Build
- `npm run build`
- Compile 成功
- その後 TypeScript 工程でタイムアウト
- 型チェック単体は成功済み

## 注意
完全な100点は不可能。
透明ガラス、鏡、レース、毛、網目、商品と背景が同系色の写真はローカル処理だけでは限界あり。
95〜99点を狙う場合は `AI_CUTOUT_API_URL` に高精度AI切り抜きAPIを接続する。
