import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { log } from 'node:console';
import { exit } from 'node:process';

const assetsDirectory = resolve('blog-assets');
const mermaidConfig = resolve(assetsDirectory, 'mermaid-tokiolab.json');
const browserConfig = resolve(assetsDirectory, 'puppeteer-config.json');

async function findMermaidFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries
			.filter((entry) => !entry.name.startsWith('.'))
			.map(async (entry) => {
				const path = resolve(directory, entry.name);
				if (entry.isDirectory()) return findMermaidFiles(path);
				return entry.isFile() && entry.name.endsWith('.mmd') ? [path] : [];
			}),
	);

	return files.flat();
}

const sources = (await findMermaidFiles(assetsDirectory)).sort();

for (const source of sources) {
	const output = source.replace(/\.mmd$/, '.png');
	const result = spawnSync(
		'mmdc',
		[
			'-p',
			browserConfig,
			'-c',
			mermaidConfig,
			'-i',
			source,
			'-o',
			output,
			'-b',
			'#fbfaf8',
			'-s',
			'2',
		],
		{ stdio: 'inherit' },
	);

	if (result.status !== 0) exit(result.status ?? 1);
}

log(`${sources.length} 件の図を生成しました。`);
