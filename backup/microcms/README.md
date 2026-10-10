# microCMS バックアップ

microCMS の公開済みコンテンツを Git で管理するためのバックアップです。`src/` と `public/` の外に置かれるため、サイトのビルド成果物には含まれません。

```text
backup/microcms/
├── blogs/       # 記事ごとの Markdown
├── raw/blogs/   # microCMS API から取得した変換前の JSON
├── categories.json
├── tags.json
└── manifest.json
```

Markdown は読みやすくレビューしやすい形式、`raw/blogs/` の JSON は復元時の情報を保つための原本です。画像は URL をメタデータとして保存し、画像ファイル自体はダウンロードしません。

## 手動バックアップ

リポジトリのルートで実行します。`.env` に設定済みの `MICROCMS_SERVICE_DOMAIN` と `MICROCMS_API_KEY` を使用します。

```sh
npm run microcms:backup
git diff -- backup/microcms
```

取得対象は公開済みの記事・カテゴリー・タグです。API を `limit=100` と `offset` で繰り返し呼び出し、全件を取得します。削除済みの記事に対応する過去のバックアップファイルは自動削除しないため、履歴として残ります。

## GitHub Actions による自動バックアップ

GitHub Actions で日次実行すると、ローカルでの手動実行は不要です。リポジトリの Secrets に次を登録します。

- `MICROCMS_SERVICE_DOMAIN`
- `MICROCMS_API_KEY`

`.github/workflows/microcms-backup.yml` に、次のワークフローを追加します。`contents: write` はバックアップ差分をコミットするために必要です。

```yaml
name: Backup microCMS

on:
  schedule:
    - cron: '17 18 * * *' # 毎日 03:17 JST
  workflow_dispatch:

permissions:
  contents: write

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run microcms:backup
        env:
          MICROCMS_SERVICE_DOMAIN: ${{ secrets.MICROCMS_SERVICE_DOMAIN }}
          MICROCMS_API_KEY: ${{ secrets.MICROCMS_API_KEY }}
      - run: |
          git add backup/microcms
          git diff --cached --quiet || (
            git config user.name 'github-actions[bot]'
            git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
            git commit -m 'Backup microCMS content'
            git push
          )
```

定期実行がコミットすると Cloudflare の Git 連携ビルドも動きます。バックアップだけで本番ビルドを動かしたくない場合は、バックアップ専用リポジトリまたは専用ブランチを使います。
