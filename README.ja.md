# TypMark VS Code拡張

VS CodeでTypMarkを扱うための拡張機能です。
シンタックスハイライト、保存時の診断、TypMark CLIによるプレビューに対応します。

## TypMark CLI
この拡張は TypMark CLI を利用します。
CLI を直接使えばバッチ処理やCIにも対応できます。

- リポジトリ: https://github.com/miko-misa/typmark
- Releases: https://github.com/miko-misa/typmark/releases


## クイックスタート
1. GitHub Releasesから最新のVSIXをダウンロードします。
2. VS CodeにVSIXをインストールします。
   詳しくは「インストール」を参照してください。
3. VS Codeのウィンドウを再読み込みします。
4. `.tmd` を開いて `TypMark: Show Preview` を実行します。

## インストール
### VS Codeの画面から
1. 拡張機能ビューを開きます。
2. VSIXからインストールを選びます。
3. ダウンロードしたVSIXを指定します。
4. VS Codeのウィンドウを再読み込みします。

### VS Code CLI
```
code --install-extension path/to/vscode-typmark-<version>.vsix
```
その後にVS Codeのウィンドウを再読み込みしてください。

## アップデート
新しいVSIXを上書きでインストールします。
VS Codeが既存の拡張を置き換えます。
インストール後にVS Codeのウィンドウを再読み込みします。

## CLIの設定
この拡張は `typmark-cli` を利用します。
`typmark.cliPath` が空なら拡張がCLIを自動で取得して管理します。
手動でCLIを用意する場合は以下のどちらかを使います。

- `typmark-cli` をPATHに置く
- `typmark.cliPath` にフルパスを設定する

## 使い方
- `.tmd` を開くとTypMarkが有効になります。
- 診断は保存時に実行されます。
- `TypMark: Show Preview` でプレビューを開きます。
- `TypMark: Select Preview Theme` でAuto、Light、Darkを選べます。

## 設定
- `typmark.cliPath` でCLIの場所を指定
- `typmark.autoUpdate` でCLIの自動更新を制御
- `typmark.checkExtensionUpdates` でVSIX更新の通知を制御
- `typmark.previewTheme` でプレビューのテーマを指定

## リリース
この拡張はGitHub Releasesで配布しています。

## English
英語版は `README.md` を参照してください。
