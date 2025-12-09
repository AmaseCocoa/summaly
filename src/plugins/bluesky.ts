import * as cheerio from 'cheerio';
import type Summary from '@/summary.js';
import { sendRequest, getFetchOptions } from '@/utils/http.js';
import { parseGeneral, type GeneralScrapingOptions } from '@/general.js';

export function test(url: URL): boolean {
	return url.hostname === 'bsky.app';
}

export async function summarize(url: URL, opts?: GeneralScrapingOptions): Promise<Summary | null> {
	const args = getFetchOptions(url.href, opts);

	// HEADで取ると404が返るためGETのみで取得
	const res = await sendRequest({
		...args,
		method: 'GET',
	});
	const body = await res.text();
	const $ = cheerio.load(body);

	return await parseGeneral(url, {
		body,
		$,
		response: res,
	});
}
