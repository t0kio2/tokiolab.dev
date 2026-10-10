---
id: 'u_w5h1xp2g'
title: 'AWS LambdaにTypeScriptアプリ (Node.js) をデプロイする'
excerpt: 'テストViteやNext.jsのスターターキットに頼らず、AWS Lambda向けのサーバーサイドTypeScriptプロジェクトを手組みで構築。tsconfigの『module: Preserve』の役割やesbuildで1ファイルにバンドルする理由をわかりやすく解説します。'
publishedAt: '2026-09-29T09:52:18.814Z'
updatedAt: '2026-10-04T14:06:51.828Z'
category:
  {
    'id': 'tolne89kt',
    'createdAt': '2026-09-27T05:45:21.291Z',
    'updatedAt': '2026-09-27T05:45:21.291Z',
    'publishedAt': '2026-09-27T05:45:21.291Z',
    'revisedAt': '2026-09-27T05:45:21.291Z',
    'name': 'テクノロジー',
  }
tags:
  [
    {
      'id': 'biz07kikd7_s',
      'createdAt': '2026-09-29T07:57:09.864Z',
      'updatedAt': '2026-09-29T07:57:09.864Z',
      'publishedAt': '2026-09-29T07:57:09.864Z',
      'revisedAt': '2026-09-29T07:57:09.864Z',
      'name': 'TypeScript',
    },
    {
      'id': 'sem8ioufsgrf',
      'createdAt': '2026-09-29T07:57:20.066Z',
      'updatedAt': '2026-09-29T07:57:20.066Z',
      'publishedAt': '2026-09-29T07:57:20.066Z',
      'revisedAt': '2026-09-29T07:57:20.066Z',
      'name': 'AWS',
    },
  ]
eyecatch: null
---

# はじめに

AWS Lambdaに、とある処理をするアプリを作ろうという話があり、その処理をTypeScriptで書くことになりました。

私は普段、TypeScriptはフロントエンドを書く言語として使っていましたが、今回初めてサーバで動くアプリをTypeScriptで書くことになりました。フロントエンドを書く際は、ViteやNext.jsのスターターキット(`npm create vite@latest` や `npx create-next-app`)を使うのであまり設定ファイルを意識することがありませんでしたが、サーバアプリを書く際はどうしたらいいのだろう？となりました。

今回は、手組みでLambdaにデプロイするサーバサイドTypeScriptプロジェクトを作る手順をまとめます。

# ゴール

まずはじめに、最終的に目指す形を最初に整理します。

1.  Lambda設定

    - ランタイム: nodejs20.x
    - ハンドラ : index.handler
      - Lambdaはリクエストが来る度に `handler(event, context)` を呼ぶ。`event`には、API GatewayやSQSといったLambdaを呼ぶリソースから届いたjsonがそのまま入っている。

2.  Lambdaに何を渡すのか : `dist/index.mjs` を1つ作り、zip化してLambdaにデプロイする
    - handlerという名前の関数をexportしていること
    - 必要なライブラリを全て`index.mjs`に含むこと

#### mjsとは？

「このファイルはESモジュールです」とNode.jsに伝えるための拡張子。

Node.jsには、以下２種類のモジュールの書き方があります。

| 方式                         | 書き方                     | 拡張子 |
| ---------------------------- | -------------------------- | ------ |
| ESモジュール (ESM, 今の標準) | import / export            | .mjs   |
| CommonJS (CJS, 旧来の書き方) | require() / module.exports | .cjs   |

拡張子が.jsである場合は、Node.jsは近くのpackage.jsonの"type"で判断します。"module"ならESM, 書いてなければCommonJSになります。

今回は標準のESMを採用します。

#### なぜindex.mjsにまとめるのか？

index.mjsにまとめる工程を**バンドル**と呼びます。バンドルする理由は以下です。

1.  サイズの圧縮 : Lambdaにアップできるzipは50MBまでなのでサイズを小さくしたい
2.  起動が早くなる : Lambdaは起動する度にコードを読み込みます。バンドルしない場合、全てのファイルを1つずつ読み込む必要がありますが、バンドルされていると読み込みが早くなります。

以上が目指すゴールです。TypeScriptで書いた各モジュールをESM形式で扱い、1つのファイル(index.mjs)にバンドルできるようにプロジェクトを作っていきます。

# プロジェクト作成

まずは、プロジェクトのディレクトリを作り初期化します。

## 1\. プロジェクト初期化

```
mkdir ts-lambda-app
cd ts-lambda-app
npm init -y
```

npm init -yすると、package.jsonが作成されます

```json
{
	"name": "ts-lambda-app",
	"version": "1.0.0",
	"description": "",
	"main": "index.js",
	"scripts": {
		"test": "echo \"Error: no test specified\" && exit 1"
	},
	"keywords": [],
	"author": "",
	"license": "ISC",
	"type": "commonjs"
}
```

## 2\. package.jsonをESMにする

mainとtypeを変更します。 "type": "commonjs" を "module" に変えるとimport / export で書けるようになります。

```
"main": "dist/index.mjs",
"type": "module"
```

## 3\. 必要なパッケージを入れる

最低限必要なツールを入れます。

```
npm i -D typescript esbuild tsx vitest @types/node @types/aws-lambda
```

- typescript : TypeScriptコンパイラ/型チェックツール
- esbuild : バンドラー。index.mjsを作るツール
- tsx : 開発用ローカル実行ツール。Node.jsはtsファイルを読みないのでjsに変換する必要があるが、それを即座に行なってくれるツール
- vitest : テストフレームワーク
- @types/node : Node.jsの型定義 (process.env, path, fsなど)
- @types/aws-lambda : AWS Lambdaの型定義 (event, contextなど)

### 4\. tsconfig.jsonを作る

tsconfig.jsonを作成し以下の内容を記述する。

```json
{
	"compilerOptions": {
		"target": "ES2022", // どの世代のJSにするか
		"module": "Preserve", // import/export の記述をそのまま残す（Preserve）
		"strict": true, // 型チェックを厳格化
		"esModuleInterop": true, // 古い形式(CommonJS)で作られたライブラリもESMで読めるように互換性を保つ
		"skipLibCheck": true, // node_modules内ライブラリの型定義ファイルチェックをスキップ
		"noEmit": true, // tscコマンドで型チェックする際、JSファイルを出力しない
		"types": ["node"] // プロジェクト全体で読み込む型定義を@types/nodeに限定
	},
	"include": ["src", "test"] // 型チェックの対象フォルダ
}
```

tsconfig.jsonは、TSプロジェクトのコンパイル方法を定義する設定ファイルです。

- `"module": "Preserve"` : TSコンパイラ(tsc)に対して、import/export構文の変換をせずそのまま維持します、という設定。このようにしておくと、以下の挙動になる。

```
import { foo } from "./foo";
export const bar = foo + 1;
```

という記述を、そのままの記法でJSに変換します。

## 5\. ビルドスクリプトを用意

package.jsonにscriptsを書く

```
"scripts": {
  "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/index.mjs",
  "typecheck": "tsc",
  "test": "vitest run",
  "local": "tsx -e \"import('./src/index.ts').then(m => m.handler({ hello: 'world' }))\""
}
```

以上で、コードを書く準備ができました。

## 6\. handlerを書き、動かしてみる

src/index.ts を作成し、簡単な処理を書いてみます。

```
import type { Context } from "aws-lambda";

export async function handler(event: unknown, context?: Context) {
  console.log(JSON.stringify({ event, requestId: context?.awsRequestId }));
  return { ok: true };
}
```

そして、以下を実行します。

```
npm run local # handlerがローカルで動くか
npm run typecheck # 型チェック
npm run build # dist/index.mjsができる
```

# Lambdaにデプロイ

buildしてdist/index.mjsができたら、zipしてLambdaにアップロードし、ハンドラをindex.handlerに設定します。

これでひとまずLambdaで実行するサーバサイトTypeScriptプロジェクトができました！

# おわりに

プロジェクトを手組みで作る方法をまとめました。

tsconfig.jsonの役割や、モジュールの種類、バンドラーの有無の違いなどが整理できました。

次回は、tsconfig.jsonの細かな内容についてまとめようと思います。
