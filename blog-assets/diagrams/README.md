# ブログ用の図

このディレクトリは、CMS にアップロードする図のソースと PNG の保管場所です。`blog-assets/` はブログ用素材の保管場所であり、サイトからは配信しません。

- `*.mmd`: Mermaid の編集用ソース
- `*.png`: CMS に貼り付ける生成済み画像

## 図を更新する

1. 対応する `.mmd` を編集する
2. リポジトリのルートで次を実行する

```sh
npm run diagrams:build
```

`test.mmd` から `test.png` を生成します。配色や余白は `mermaid-tokiolab.json` で調整します。
