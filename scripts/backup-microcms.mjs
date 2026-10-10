import { error as logError, log } from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exit } from 'node:process';
import { format, resolveConfig } from 'prettier';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const backupDirectory = resolve('backup/microcms');
const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
const apiKey = process.env.MICROCMS_API_KEY;
const prettierOptions = await resolveConfig(resolve('package.json'));

if (!serviceDomain || !apiKey) {
	logError('MICROCMS_SERVICE_DOMAIN と MICROCMS_API_KEY を設定してください。');
	exit(1);
}

const turndown = new TurndownService({
	bulletListMarker: '-',
	codeBlockStyle: 'fenced',
	headingStyle: 'atx',
});
turndown.use(gfm);

async function getAllContents(endpoint, searchParams = {}) {
	const contents = [];
	const limit = 100;
	let offset = 0;

	while (true) {
		const params = new URLSearchParams({
			limit: String(limit),
			offset: String(offset),
			...searchParams,
		});
		const response = await fetch(
			`https://${serviceDomain}.microcms.io/api/v1/${endpoint}?${params}`,
			{ headers: { 'X-MICROCMS-API-KEY': apiKey } },
		);

		if (!response.ok) {
			throw new Error(`${endpoint} の取得に失敗しました (${response.status})`);
		}

		const page = await response.json();
		contents.push(...page.contents);
		offset += page.contents.length;

		if (offset >= page.totalCount || page.contents.length === 0)
			return contents;
	}
}

async function writeIfChanged(path, content) {
	let previousContent;
	try {
		previousContent = await readFile(path, 'utf8');
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}

	if (previousContent === content) return false;
	await mkdir(resolve(path, '..'), { recursive: true });
	await writeFile(path, content);
	return true;
}

function frontmatter(post) {
	const metadata = {
		id: post.id,
		title: post.title,
		excerpt: post.excerpt || null,
		publishedAt: post.publishedAt,
		updatedAt: post.updatedAt,
		category: post.category || null,
		tags: post.tags || [],
		eyecatch: post.eyecatch || null,
	};

	return Object.entries(metadata)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join('\n');
}

function normalizeTableCells(html) {
	return html.replace(
		/<(th|td)([^>]*)>\s*<p>([\s\S]*?)<\/p>\s*<\/\1>/gi,
		'<$1$2>$3</$1>',
	);
}

async function toMarkdown(post) {
	const content = turndown
		.turndown(normalizeTableCells(post.content))
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return format(`---\n${frontmatter(post)}\n---\n\n${content}\n`, {
		...prettierOptions,
		parser: 'markdown',
	});
}

async function backupPosts(posts) {
	let changedCount = 0;

	for (const post of posts) {
		const markdownPath = resolve(backupDirectory, 'blogs', `${post.id}.md`);
		const rawPath = resolve(backupDirectory, 'raw', 'blogs', `${post.id}.json`);

		if (await writeIfChanged(markdownPath, await toMarkdown(post))) {
			changedCount += 1;
		}
		if (
			await writeIfChanged(rawPath, `${JSON.stringify(post, null, '\t')}\n`)
		) {
			changedCount += 1;
		}
	}

	return changedCount;
}

async function main() {
	const [posts, categories, tags] = await Promise.all([
		getAllContents('blogs', { depth: '1', orders: '-publishedAt' }),
		getAllContents('categories', { orders: 'name' }),
		getAllContents('tags', { orders: 'name' }),
	]);

	let changedCount = await backupPosts(posts);
	const dataFiles = [
		['categories.json', categories],
		['tags.json', tags],
		[
			'manifest.json',
			{
				schemaVersion: 1,
				postIds: posts.map((post) => post.id),
			},
		],
	];

	for (const [filename, data] of dataFiles) {
		if (
			await writeIfChanged(
				resolve(backupDirectory, filename),
				`${JSON.stringify(data, null, '\t')}\n`,
			)
		) {
			changedCount += 1;
		}
	}

	log(
		`${posts.length} 件の記事、${categories.length} 件のカテゴリー、${tags.length} 件のタグを取得しました。${changedCount} ファイルを更新しました。`,
	);
}

main().catch((error) => {
	logError(error);
	exit(1);
});
