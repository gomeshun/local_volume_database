AGENTS.mdは、コーディングエージェント用のドキュメントです。

## Python 開発ルール
- 新規開発した Python コードでは、関数・メソッドに NumPy スタイルの docstring を書くこと。
- Python 実行やテストは `uv` で構築した環境下で行うこと。例: `uv sync` で環境を用意し、`uv run python ...` または `uv run pytest ...` を使う。

## kinematics データ取得方針
- `data_kinematics/` の文献データ取得では VizieR だけで探索を終えないこと。未登録の文献については、NASA ADS の data/supplement リンク（利用できる場合）、出版社ページの machine-readable table / MRT、DOI や Crossref の supplement relation、arXiv ancillary files、MAST/KOA/Dataverse/Zenodo などの公開アーカイブも確認する。
- 公開された machine-readable な個別星 kinematics（速度、proper motion、metallicity、membership など）が見つかった場合は、可能な限り `KinematicSource` の direct provider として登録し、raw cache は `data_kinematics/raw/` 配下、正規化済み CSV は `data_kinematics/processed/` 配下に置く。
- `web/` へは raw provider payload や `original_row_json` を配布しない。公開用には生成済み・整形済みの kinematics 出力だけを使う。

## web/ 開発作業ログまとめ（2026-02-04時点）

### 目的 / 何を作っているか
- `web/` は Next.js（App Router）で作られたフロントエンド「LVDB Explorer」。
- リポジトリ直下の `data/*.csv`（LVDBのテーブル）を読み込み、データセット一覧とテーブル閲覧を提供。
- 天球可視化として CDS の Aladin Lite v3 を組み込み、テーブル選択とビューア上のクリック選択を同期。

### 実行・開発コマンド（確認できた範囲）
- `web/` で `npm run dev`（`predev` により `npm run prepare:data` が先に走る）
- `npm run build`（`prebuild` により `npm run prepare:data` が先に走る）
- `npm run prepare:data` は以下を実行:
	- `node scripts/generate-datasets.mjs`
	- `node scripts/generate-simbad.mjs`
- SIMBAD 生成の再実行オプション:
	- `npm run prepare:data:force`（`FORCE_SIMBAD=1`）
	- `npm run prepare:data:retry-bad`（`RETRY_BAD=1`）

### データ生成（ビルド時生成物とキャッシュ）
- `web/scripts/generate-datasets.mjs`
	- `../data/*.csv` を走査し、除外（例: `j_factor.csv`, `pm_overview.csv`）を除いてデータセット定義を生成。
	- 出力: `web/src/generated/datasets.ts`
	- データ中の参照文字列から bibcode を抽出し、VizieR の ASU-TSV エンドポイントでカタログ一覧を取得。
	- 取得結果はインクリメンタルにキャッシュし、毎回のビルドでの過剰アクセスを避ける。
	- 出力: `web/src/generated/vizier_catalogs.json`, `web/src/generated/vizier_catalogs.ts`
- `web/scripts/generate-simbad.mjs`
	- `../data/*.csv` の `name`/`key` などから行ID（rowId）を作り、SIMBAD `sim-id` を VOTable で照会。
	- 既存キャッシュを読み、同一 rowId の過去結果を別テーブル間で再利用して問い合わせ数を削減。
	- `--force` / `--retry-bad`（または環境変数）で再取得の範囲を制御。
	- 出力: `web/src/generated/simbad_mappings.json`, `web/src/generated/simbad_mappings.ts`

### UI/機能の要点（実装からの抜粋）
- ルーティング
	- `web/src/app/page.tsx`: データセット一覧（Card グリッド）
	- `web/src/app/datasets/[slug]/page.tsx`: 静的生成（`dynamicParams=false` + `generateStaticParams`）
	- `web/src/app/datasets/[slug]/DatasetClient.tsx`: テーブルと Aladin Lite を横並び表示し、選択状態を同期
	- `web/src/app/about/page.tsx`: フォークであることの明示、リンク/クレジット/ライセンス
- `DatasetTable`（`web/src/components/DatasetTable.tsx`）
	- TanStack Table によるソート/フィルタ/ページング、列表示の切替。
	- 列IDに基づく単位表示（例: `ra (deg)` など）。
	- `ref`/`ref_*` 列は bibcode を抽出して ADS（`ui.adsabs.harvard.edu`）へリンク。
	- `name` 列は `simbad_mappings` を参照し、確度が高い場合のみ SIMBAD へリンク（不一致は警告表示）。
	- 「Add children」ボタンで SIMBAD の children クエリ（VOTable）URL を組み立て、Aladin 側へイベント送信。
- `AladinLiteViewer`（`web/src/components/AladinLiteViewer.tsx`）
	- Aladin Lite v3 を `next/script` で読み込み、`A.init`（WASM初期化）を待ってからビューア生成。
	- 独自カタログ `LVDB` を作成し、`sources`（RA/Dec）を投入。
	- オブジェクトクリックを `rowId` に変換してテーブル選択をトグル。
	- Fullscreen を `AL:fullscreen.toggled` で検知し、`body.aladin-fullscreen` を付け替え + グローバルイベント通知。
	- `aladin-add-catalog` イベントを受けて `catalogFromURL` で外部カタログを追加し、成功/失敗イベントを返す。
- Fullscreen 時のUI調整
	- `web/src/app/globals.css`: `body.aladin-fullscreen header { display: none }` でヘッダ重なりを回避。

### VizieR 取得方式（静的exportとの整合）
- `web/src/app/api/vizier/catalogs/route.ts` は 501 を返す形で無効化。
	- `output: export`（静的エクスポート）との衝突回避のため、クライアントから VizieR を直接叩く方針。

### 外部リンク設定（フォーク向け）
- `web/src/app/siteConfig.ts` で `NEXT_PUBLIC_FORK_*` を参照して About/フッタ等のリンクを出し分け。

### コミット履歴（web/ 関連、直近）
※ `git log -- web` から抽出。
- `171e9c5` feat: add onClick handler to catalog options in AladinLiteViewer and DatasetTable components
- `23af5a2` feat: add catalog management in AladinLiteViewer and DatasetTable components
- `089f702` feat: implement fullscreen handling in AladinLiteViewer and DatasetTable components
- `cd7bb3f` feat: enhance SIMBAD data generation with manual dispatch inputs for force and retry options
- `7f0b2df` feat: add SIMBAD links
- `f5df8b3` fetch vizier data and cache
- `c37c264` feat: implement VizieR catalog fetching in DatasetTable component
- `1ec27a5` feat: increase max-width of layout components for improved responsiveness
- `ed2c5a5` feat: add utility function for class name merging in Tailwind CSS
- `7bac6f9` feat: add baseUrl configuration to TypeScript settings
- `eade894` feat: add reference column handling with bibcode extraction and hyperlinking
- `1dab2a4` feat: add unit formatting for dataset columns and enhance column labels
- `1def2be` Refactor code structure for improved readability and maintainability
- `3e179a4` Refactor layout and components for improved UI and functionality
- `3d2cb99` feat: enhance styling for links and navigation elements across the application
- `5c7c2e8` feat: enhance web UI with About page, site configuration, and improved dataset interaction
- `c535444` feat: add TypeScript declaration for global A variable on Window object
- `d2808df` feat: initialize Next.js application with basic structure and styling