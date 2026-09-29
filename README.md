# TOKIOLAB

microCMS の公開済み記事をビルド時に取得して、Astro の静的ページとして公開するブログです。

## microCMS の設定

1. microCMS でリスト形式の API を作成し、記事のエンドポイントを `blogs` にします。
2. フィールドは `title`（テキスト）、`content`（リッチエディタ）、`category`（コンテンツ参照・任意）、`eyecatch`（画像・任意）を作成します。
3. `.env.example` を `.env` にコピーして、サービス ID と読み取り用 API キーを設定します。`.env` は Git に登録しません。

```sh
cp .env.example .env
npm run build
```

認証情報がない状態では、開発・デザイン確認用のモック記事が表示されます。認証情報を設定すると microCMS の公開記事に自動的に切り替わります。API の作成手順は [docs/microcms-api.md](docs/microcms-api.md) を参照してください。

## Cloudflare Workers への SSG デプロイ

`wrangler.jsonc` は、生成した `dist` を Cloudflare Workers の静的アセットとして配信する設定です。初回だけ Cloudflare にログインしてデプロイします。

```sh
npx wrangler login
npm run build
npx wrangler deploy
```

Workers Builds で Git リポジトリを接続する場合は、ビルドコマンドを `npm run build`、デプロイコマンドを `npx wrangler deploy` にします。ビルド環境変数に `MICROCMS_SERVICE_DOMAIN` と `MICROCMS_API_KEY` を登録してください。キーは `PUBLIC_` で始めないでください。再デプロイ時に microCMS の最新公開記事が静的 HTML として生成されます。

## Google Analytics 4

`PUBLIC_GA_MEASUREMENT_ID` に GA4 の測定 ID（`G-` で始まる値）を設定すると、すべてのページの `<head>` に Google タグを出力します。未設定の場合はタグを出力しないため、ローカル開発環境では計測されません。測定 ID はブラウザに配信される値なので、Cloudflare Workers Builds のビルド環境変数にも同じ値を設定してください。GA4 の「管理」→「データ ストリーム」から対象 Web ストリームを開くと確認できます。

ローカル開発は `npm run dev`、本番ビルドの確認は `npm run build` です。
