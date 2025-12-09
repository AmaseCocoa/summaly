import debug from 'debug';
import * as cheerio from 'cheerio';
import { getFetchOptions, sendRequest } from '@/utils/http.js';
import summary from '@/summary.js';
import { parseGeneral, type GeneralScrapingOptions } from '@/general.js';

const log = debug('summaly:plugins:skeb');

export function test(url: URL): boolean {
	if (!url.hostname) return false;
	return url.hostname === 'skeb.jp' ||
				 url.hostname === 'ske.be';
}

async function findCookie(htmlContent: string) {
	const $ = cheerio.load(htmlContent);

	let cookie = null;

	for (const element of $('script').get()) {
		const scriptContent = $(element).text();

		if (scriptContent) {
			const cookieMatch = scriptContent.match(/document\.cookie\s*=\s*"([^"]*)"/);

			if (cookieMatch && cookieMatch[1]) {
				cookie = cookieMatch[1];
				break;
			}
		}
	}

	return cookie;
}

function sleep(retryAfterHeader: string) {
	let delaySeconds;

	const parsedSeconds = parseInt(retryAfterHeader, 10);

	if (!isNaN(parsedSeconds)) {
		delaySeconds = parsedSeconds;
	} else {
		return
	}

	const delayMs = delaySeconds * 1000;
	return new Promise(resolve => setTimeout(resolve, delayMs));
}

export async function summarize(url: URL, opts?: GeneralScrapingOptions): Promise<summary | null> {
	const args = getFetchOptions(url.href, opts);

	const res = await sendRequest({
		...args,
		method: 'GET',
		ignoreErrorStatus: [429],
	});

	let body;

	const retryAfterHeader = res.headers.get('Retry-After');

	if (res.status === 429 && retryAfterHeader) {
		const cookie = await findCookie(await res.text()) ?? undefined;
		const nextArgs = getFetchOptions(url.href, { cookie: cookie, ...opts });
		
		await sleep(retryAfterHeader);
		
		const response = await sendRequest({
			...nextArgs,
			method: 'GET',
		});
		body = await response.text();
	} else {
		body = await res.text();
	}

	const $ = cheerio.load(body);

	return await parseGeneral(url, {
		body,
		$,
		response: res,
	});
}
