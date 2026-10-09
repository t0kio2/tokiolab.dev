# ブログ用の図

このディレクトリは、CMS にアップロードする図のソースと PNG の保管場所です。サイトからは配信しません。

- `*.mmd`: Mermaid の編集用ソース
- `*.png`: CMS に貼り付ける生成済み画像

## 図を更新する

1. 対応する `.mmd` を編集する
2. リポジトリのルートで次を実行する

```sh
npm run diagrams:build
```

`blog-assets/` 以下にあるすべての `.mmd` を、同じ場所・同じ名前の `.png` に生成します。たとえば `diagrams/mTLS.mmd` は `diagrams/mTLS.png` になります。配色や余白は `mermaid-tokiolab.json` で調整します。
