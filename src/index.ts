/**
 * summaly
 * https://github.com/misskey-dev/summaly
 */

import { Hono } from 'hono';
import { SummalyResult } from '@/summary.js';
import { SummalyPlugin as _SummalyPlugin } from '@/iplugin.js';
import { general, type GeneralScrapingOptions } from '@/general.js';
import {
	head,
} from '@/utils/http.js';
import { plugins as builtinPlugins } from '@/plugins/index.js';

export type SummalyPlugin = _SummalyPlugin;

export type SummalyOptions = {
	/**
	 * Accept-Language for the request
	 */
	lang?: string | null;

	/**
	 * Whether follow redirects
	 */
	followRedirects?: boolean;

	/**
	 * Custom Plugins
	 */
	plugins?: SummalyPlugin[];

	/**
	 * User-Agent for the request
	 */
	userAgent?: string;

	/**
	 * Response timeout.
	 * Set timeouts for each phase, such as host name resolution and socket communication.
	 */
	responseTimeout?: number;

	/**
	 * Operation timeout.
	 * Set the timeout from the start to the end of the request.
	 */
	operationTimeout?: number;

	/**
	 * Maximum content length.
	 * If set to true, an error will occur if the content-length value returned from the other server is larger than this parameter (or if the received body size exceeds this parameter).
	 */
	contentLengthLimit?: number;

	/**
	 * Content length required.
	 * If set to true, it will be an error if the other server does not return content-length.
	 */
	contentLengthRequired?: boolean;
};

export const summalyDefaultOptions = {
	lang: null,
	followRedirects: true,
	plugins: [],
} as SummalyOptions;

/**
 * Summarize an web page
 */
export const summaly = async (
	url: string,
	options?: SummalyOptions,
): Promise<SummalyResult> => {
	const opts = Object.assign(summalyDefaultOptions, options);

	const plugins = builtinPlugins.concat(opts.plugins || []);

	let actualUrl = url;
	if (opts.followRedirects) {
		// .catch(() => url)にすればいいけど、jestにtrace-redirectを食わせるのが面倒なのでtry-catch
		try {
			const res = await head(url, {
				lang: opts.lang,
				userAgent: opts.userAgent,
				responseTimeout: opts.responseTimeout,
				operationTimeout: opts.operationTimeout,
			});
			actualUrl = res.url;
		} catch {
			actualUrl = url;
		}
	}

	const _url = new URL(actualUrl);

	// Find matching plugin
	const match = plugins.filter((plugin) => plugin.test(_url))[0];

	// Get summary
	const scrapingOptions: GeneralScrapingOptions = {
		lang: opts.lang,
		userAgent: opts.userAgent,
		responseTimeout: opts.responseTimeout,
		followRedirects: opts.followRedirects,
		operationTimeout: opts.operationTimeout,
		contentLengthLimit: opts.contentLengthLimit,
		contentLengthRequired: opts.contentLengthRequired,
	};

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	const summary = await (match ? match.summarize : general)(
		_url,
		scrapingOptions,
	);

	if (summary == null) {
		throw new Error('failed summarize');
	}

	return Object.assign(summary, {
		url: actualUrl,
	});
};

// eslint-disable-next-line import/no-default-export
export default function (options?: SummalyOptions): Hono {
	const app = new Hono();

	app.get('/', async (c) => {
		const url = c.req.query('url') as string | null;
		if (url == null) {
			return c.json({ error: 'url is required' }, { status: 400 });
		}

		try {
			const summary = await summaly(url, {
				lang: c.req.query('lang'),
				followRedirects: false,
				...options,
			});

			return c.json(summary);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return c.json({ error: msg }, { status: 500 });
		}
	});

	return app;
}