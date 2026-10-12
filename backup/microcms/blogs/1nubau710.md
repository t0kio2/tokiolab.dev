---
id: '1nubau710'
title: 'SSL/TLS入門 | mTLSを実装して理解する - Nginxで試すmTLS'
excerpt: 'OpenSSLでのルートCA・証明書作成から、NginxとNode.jsを使ったDocker環境でのmTLS（相互TLS）実装までを徹底解説。TLSハンドシェイクの裏側や証明書の仕組みを実際に手を動かして理解できます。'
publishedAt: '2026-10-11T11:42:23.766Z'
updatedAt: '2026-10-12T01:30:15.553Z'
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
      'id': 'o0dhisrrb',
      'createdAt': '2026-09-27T14:33:25.456Z',
      'updatedAt': '2026-09-27T14:33:25.456Z',
      'publishedAt': '2026-09-27T14:33:25.456Z',
      'revisedAt': '2026-09-27T14:33:25.456Z',
      'name': 'セキュリティ',
    },
    {
      'id': 'mc253_-gdrv7',
      'createdAt': '2026-10-11T11:41:03.647Z',
      'updatedAt': '2026-10-11T11:41:03.647Z',
      'publishedAt': '2026-10-11T11:41:03.647Z',
      'revisedAt': '2026-10-11T11:41:03.647Z',
      'name': 'SSL/TLS',
    },
  ]
eyecatch: null
---

# はじめに

今回は、mTLS (Mutual TLS)通信を独自に実装してみようと思います。

過去の記事で、

1.  [ハンドシェイクの仕組み](https://tokiolab.dev/blog/1fqono1b9_64/)
2.  [証明書の仕組み](https://tokiolab.dev/blog/o0194v13ov9u/)
3.  [mTLSの仕組み](https://tokiolab.dev/blog/9687h79a4/)

の仕組みを紹介してきました。

概念的な理解にとどまっていたので、実際にローカルPC上に実装することで手触り感を確かめてみたいと思います。

以下のツールが入っていることが前提になります。

- Docker ([https://www.docker.com/ja-jp/get-started/](https://www.docker.com/ja-jp/get-started/))
- OpenSSL ([https://openssl-library.org/source/](https://openssl-library.org/source/))

# 今回実装するmTLSの全体像

![](https://images.microcms-assets.io/assets/b59f44f0535340da844943fcc675cbb6/26879d579c03473a9cc375a909b986a0/mtls-docker-compose.png)

全体像です。

- サーバ側
  - **Nginx**: TLS終端の役割。mTLSを処理する。
  - **Node.js**: サーバアプリ。HTTPサーバとして動作する。
- クライアント側
  - アプリは立てず、シンプルにcurlでクライアント証明書を含めてサーバにアクセスする。

以上のものを作っていきます。Dockerが入っていればどの環境でも作れるはずです。

最終的に、以下構造になるものを作ります。

## ディレクトリ構造

```
mtls-demo
├── backend # HTTPサーバ
│   ├── Dockerfile
│   └── server.js
├── certs # 証明書
│   ├── ca # ルート証明書(認証局)
│   │   ├── ca.crt
│   │   ├── ca.key
│   │   └── ca.srl
│   ├── client # クライアント証明書
│   │   ├── client.crt
│   │   ├── client.csr
│   │   ├── client.ext
│   │   └── client.key
│   └── server # サーバ証明書
│       ├── server.crt
│       ├── server.csr
│       ├── server.ext
│       └── server.key
├── compose.yaml
└── nginx # リバースプロキ(TLS終端)
    └── nginx.conf
```

#### Dockerファイル

`compose.yaml`は、Docker Composeの設定ファイルです。NginxとNode.jsのコンテナを定義します。

`nginx/nginx.conf`では、サーバ証明書と秘密鍵、クライアント証明書を検証するためのCA証明書を指定します。

#### backend/

`backend/` には、認証成功後にJSONを返すシンプルなHTTPサーバを実装します。

#### certs

`certs/`は証明書を管理するディレクトリで、役割毎に３つに分けています。

- `ca/` : 証明書を発行する自作CAの秘密鍵と自己証明書
- `server/` : Nginxが使用するサーバ証明書と秘密鍵
- `client/` : curlが使用するクライアント証明書と秘密鍵

`.csr`はサーバ証明書の元となるファイル(証明書署名要求)、`.ext`は証明書に付与する拡張情報の設定ファイルです。

`ca.srl`はOpenSSLが証明書発行時に使用する**シリアル番号管理ファイル**です。

#### .srl (シリアル番号ファイル)とは

サーバ証明書に含まれる**シリアル番号**を生成するためのファイルで、証明書発行毎に数値が更新されていきます。

証明書にはシリアル番号という項目があり、証明書毎に異なった値(唯一の値)になっています。1枚ずつ証明書を識別するためのIDの役割です。

もし証明書の秘密鍵が漏洩したなどすると、その証明書を証明書を失効する必要があります。その際は、対象のシリアル番号を証明書失効リスト(**CRL: Certificate Revocation List**)に登録して無効化します。

ここからは実際に実装してみようと思います。

# 実装

事前に`mtls-demo`ディレクトリを作成してください。

```
mkdir mtls-demo
cd mtls-demo
```

まずは証明書を作成します。

## 1\. 各証明書の作成

役割毎のディレクトリを作成します。

```
mkdir -p certs/{ca,server,client}
```

これより以下、証明書作成のOpenSSLコマンドをプロジェクトルートで実行していきます。

### CAの作成

#### ① CAの秘密鍵を生成

```
openssl genpkey -algorithm RSA \
  -out certs/ca/ca.key \
  -pkeyopt rsa_keygen_bits:3072
```

- `openssl genpkey` : 秘密鍵生成コマンド。以前からある `opensslgenrsa` よりも新しい。
- `-algorithm RSA`：RSAアルゴリズムを指定
- `-pkeyopt rsa_keygen_bits:3072` : RSA鍵の長さ(bit数)を指定。3072は一般的な2048より安全性が高く、NIST(アメリカ国立標準技術研究所)ガイドラインでも推奨されている。

#### ② CAの自己署名ルート証明書を作成

```
openssl req -x509 -new \
  -key certs/ca/ca.key \
  -sha256 \
  -days 365 \
  -out certs/ca/ca.crt \
  -subj "/CN=Demo Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"
```

- `openssl req -x509 -new`: ルート証明書の作成コマンド
- `-key certs/ca/ca.key`: 署名に使う秘密鍵。証明書に含ませる公開鍵も導出する。
- `-sha256` : 署名アルゴリズム
- `-days 365` : 有効期間
- `-out certs/ca/ca.crt`: ルート証明書出力ファイルパス
- `-subj "/CN=Demo Root CA"` : 証明書の**所有者(サブジェクト)**。認証局名を「Demo Root CA」とします。
- `-addext "basicConstraints=critical,CA:TRUE"` : この証明書が、サーバ証明書のような末端ではなく、他の証明書を発行する権限を持っていることを定義する拡張設定(`CA:TRUE`)。
- `-addext "keyUsage=critical,keyCertSign,cRLSign"` : keyCertSign (他の証明書に署名する権限)、cRlSign (失効リストに署名する権限)を許可する拡張設定。

これで以下のファイルが作成されます。

```
certs/ca/
├── ca.key
└── ca.crt
```

ルート証明書の内容は以下のような情報が含まれます。

```text
Subject (証明書の所有者)
    CN=Demo Root CA

Validity
    Not Before：発行日時
    Not After：発行日時から365日後

Subject Public Key Info
    ca.key に対応するRSA公開鍵（3072bit）

X.509 v3 Extensions
    Basic Constraints
        CA:TRUE (ルート認証局です)
    Key Usage
        Certificate Sign (他の証明書に署名します)
        CRL Sign (失効リストに登録できます)

Signature
    CA自身の秘密鍵（ca.key）で生成した署名
```

### サーバ証明書の作成

#### ① サーバ秘密鍵を生成

```
openssl genpkey -algorithm RSA \
  -out certs/server/server.key \
  -pkeyopt rsa_keygen_bits:2048
```

#### ② CSRを生成

「localhostに対する証明書を作成したい」という要求書を作ります。

```
openssl req -new \
  -key certs/server/server.key \
  -out certs/server/server.csr \
  -subj "/CN=localhost"
```

#### ③ 証明書の拡張設定を作成

server.extというファイルを作成し、設定内容を書き込むコマンドです。

```
cat > certs/server/server.ext <<'EOF'
basicConstraints=critical,CA:FALSE # 「認証局ではないよ」という設定
keyUsage=critical,digitalSignature,keyEncipherment # 署名の検証とハンドシェイクに使用するという設定
extendedKeyUsage=serverAuth # 「サーバ認証に使用する」という設定
subjectAltName=DNS:localhost #
EOF
```

- `basicConstraints=critical,CA:FALSE` :「認証局ではないよ」という設定
- `keyUsage=critical,digitalSignature,keyEncipherment` : 署名の検証とハンドシェイクに使用するという設定
- `extendedKeyUsage=serverAuth` : 「サーバ認証に使用する」という設定
- `subjectAltName=DNS:localhost` : SAN (Subject Alternative Name / サブジェクト別名)の設定で、「この証明書が有効なドメインはlocalhostですよ」としている。

#### ④ サーバ証明書を発行 (CAの秘密鍵で署名)

```
openssl x509 -req \
  -in certs/server/server.csr \
  -CA certs/ca/ca.crt \
  -CAkey certs/ca/ca.key \
  -CAserial certs/ca/ca.srl \
  -CAcreateserial \
  -out certs/server/server.crt \
  -days 365 \
  -sha256 \
  -extfile certs/server/server.ext
```

これで以下ファイルが作成されます。

```
certs/server/
├── server.key
├── server.csr
├── server.ext
└── server.crt
```

### クライアント証明書の作成

#### ① クライアント秘密鍵を生成

```
openssl genpkey -algorithm RSA \
  -out certs/client/client.key \
  -pkeyopt rsa_keygen_bits:2048
```

#### ② CSRを生成

```
openssl req -new \
  -key certs/client/client.key \
  -out certs/client/client.csr \
  -subj "/CN=demo-client"
```

#### ③ 証明書の拡張設定を作成

```
cat > certs/client/client.ext <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF
```

- `extendedKeyUsage=clientAuth` : この証明書をクライアント認証に使うという設定

#### ④ CAの秘密鍵で署名してクライアント証明書を発行

```
openssl x509 -req \
  -in certs/client/client.csr \
  -CA certs/ca/ca.crt \
  -CAkey certs/ca/ca.key \
  -CAserial certs/ca/ca.srl \
  -CAcreateserial \
  -out certs/client/client.crt \
  -days 365 \
  -sha256 \
  -extfile certs/client/client.ext
```

これで以下ファイルが作成されます。

```
certs/client/
├── client.key
├── client.csr
├── client.ext
└── client.crt
```

以上で必要なファイルが揃いました。

```
mtls-demo/
└── certs/
    ├── ca/
    │   ├── ca.key
    │   ├── ca.crt
    │   └── ca.srl
    ├── server/
    │   ├── server.key
    │   ├── server.csr
    │   ├── server.ext
    │   └── server.crt
    └── client/
        ├── client.key
        ├── client.csr
        ├── client.ext
        └── client.crt
```

### 証明書を検証する

ここまでで、サーバ証明書・クライアント証明書が発行できたのでOpenSSLで検証してみましょう。

```
# サーバ証明書検証
openssl verify \
  -CAfile certs/ca/ca.crt \
  -purpose sslserver \
  certs/server/server.crt

# クライアント証明書検証
openssl verify \
  -CAfile certs/ca/ca.crt \
  -purpose sslclient \
  certs/client/client.crt
```

両方とも以下のように表示されれば成功です。

```
certs/server/server.crt: OK
certs/client/client.crt: OK
```

## 2\. サーバ実装

#### ① Nginx設定

```nginx
events {}

http {
    server {
        listen 443 ssl;
        server_name localhost;

        # Nginxが提示するサーバ証明書
        ssl_certificate /etc/nginx/certs/server/server.crt;
        # ハンドシェイク内容に署名する秘密鍵
        ssl_certificate_key /etc/nginx/certs/server/server.key;

        # TLS1.3
        ssl_protocols TLSv1.3;

        # クライアント証明書の検証に使うCA
        ssl_client_certificate /etc/nginx/certs/ca/ca.crt;

        # クライアント証明書を必須にする
        ssl_verify_client on;
         # 許容する証明書チェーンの深さ
        ssl_verify_depth 1;

        location / {
            proxy_pass http://backend:3000;

            proxy_set_header Host $host;

            # 検証済みクライアントの情報
            proxy_set_header X-Client-Verify $ssl_client_verify;
            proxy_set_header X-Client-DN $ssl_client_s_dn;
        }
    }
}
```

#### ② Node.js実装

```javascript
const http = require('node:http');

const server = http.createServer((req, res) => {
	res.writeHead(200, {
		'Content-Type': 'application/json',
	});

	res.end(
		JSON.stringify({
			message: 'mTLS authentication successful',
			clientVerified: req.headers['x-client-verify'],
			clientIdentity: req.headers['x-client-dn'],
		}),
	);
});

server.listen(3000, '0.0.0.0', () => {
	console.log('Backend listening on port 3000');
});
```

#### ③ Dockerfile作成

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY server.js .

CMD ["node", "server.js"]
```

#### ④ Docker Compose作成

```dockerfile
services:
  nginx:
    image: nginx:1.26-alpine
    ports:
      - "8443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs/ca/ca.crt:/etc/nginx/certs/ca/ca.crt:ro
      - ./certs/server/server.crt:/etc/nginx/certs/server/server.crt:ro
      - ./certs/server/server.key:/etc/nginx/certs/server/server.key:ro
    depends_on:
      - backend

  backend:
    build: ./backend
    expose:
      - "3000"
```

#### ⑤ Docker起動

```
# Nginx設定が間違ってないか確認
docker compose run --rm --no-deps nginx nginx -t

# 問題なければ起動
docker compose up --build -d
```

## 3\. クライアントから呼び出す

**クライアント証明書なし**

```
curl -i \
  --cacert certs/ca/ca.crt \
  https://localhost:8443
```

次のようなエラーになります。

```
HTTP/1.1 400 Bad Request

No required SSL certificate was sent
```

**クライアント証明書あり**

```
curl -i \
  --cacert certs/ca/ca.crt \
  --cert certs/client/client.crt \
  --key certs/client/client.key \
  https://localhost:8443
```

認証成功すれば次のような結果が返ってきます。

```
{
  "message": "mTLS authentication successful",
  "clientVerified": "SUCCESS",
  "clientIdentity": "CN=demo-client"
}
```

以上でmTLSの実装ができました。

# TLSハンドシェイクを観察する

\-vオプションをつけるとログが見られます。

```
curl -v \
  --cacert certs/ca/ca.crt \
  --cert certs/client/client.crt \
  --key certs/client/client.key \
  https://localhost:8443
```

以下のようなログが出力されます。

```
* (304) (OUT), TLS handshake, Client hello (1): # 1. クライアントから接続開始
*  CAfile: certs/ca/ca.crt
*  CApath: none
* (304) (IN), TLS handshake, Server hello (2): # 2. サーバから応答
* (304) (IN), TLS handshake, Unknown (8): # (暗号パラメータのやり取り)
* (304) (IN), TLS handshake, Request CERT (13): # 3. サーバがクライアント証明書要求
* (304) (IN), TLS handshake, Certificate (11): # 4. サーバが証明書を送る
* (304) (IN), TLS handshake, CERT verify (15): # 5. サーバが署名を送る
* (304) (IN), TLS handshake, Finished (20): 6. # サーバ証明書検証OK
* (304) (OUT), TLS handshake, Certificate (11): # クライアントが証明書を送る
* (304) (OUT), TLS handshake, CERT verify (15): # クライアントが署名を送る
* (304) (OUT), TLS handshake, Finished (20): # クライアント証明書検証OK
* SSL connection using TLSv1.3 / AEAD-CHACHA20-POLY1305-SHA256 / [blank] / UNDEF
```

実際にサーバ証明書、クライアント証明書のハンドシェイクが行われていることが確認できました。

# おわりに

今回は、自作のルートCA作成からサーバー証明書・クライアント証明書の発行、NginxとNode.jsを組み合わせたDocker環境でのmTLSの実装を行いました。

普段何気なく使っている「HTTPS」や「証明書エラー」という挙動が、裏側でどのようにして起こるのかが実際に手を動かすことで解像度が上がりました。

マイクロサービスや、セキュアなAPI構築の参考になればと思います。
