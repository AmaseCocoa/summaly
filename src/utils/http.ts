import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { Agent, fetch } from 'undici';
import debug from 'debug';
import { robotsManager } from './robots.js';
import type { GeneralScrapingOptions } from '@/general.js';
import { StatusError } from '@/utils/status-error.js';
import { detectEncoding, toUtf8 } from '@/utils/encoding.js';

const log = debug('summaly:http');

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

export type FetchOptions = {
	url: string;
	method: 'GET' | 'POST' | 'HEAD';
	body?: string;
	headers: Record<string, string | undefined>;
	typeFilter?: RegExp;
	followRedirects?: boolean;
	responseTimeout?: number;
	operationTimeout?: number;
	contentLengthLimit?: number;
	contentLengthRequired?: boolean;
	ignoreErrorStatus?: number[];
	checkRobots?: boolean;
};

const repo = JSON.parse(readFileSync(`${_dirname}/../../package.json`, 'utf8'));

export const DEFAULT_RESPONSE_TIMEOUT = 20 * 1000;
export const DEFAULT_OPERATION_TIMEOUT = 60 * 1000;
export const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
export const DEFAULT_BOT_UA = `SummalyBot/${repo.version} (https://github.com/AmaseCocoa/summaly/blob/master/README.md)`;

export function getFetchOptions(url: string, opts?: GeneralScrapingOptions): Omit<FetchOptions, 'method'> {
	const headers: Record<string, string> = {
		'accept': 'text/html,application/xhtml+xml',
		'user-agent': opts?.userAgent ?? DEFAULT_BOT_UA,
	};

	if (opts?.lang) {
		headers['accept-language'] = opts.lang;
	}
	if (opts?.cookie) {
		headers['Cookie'] = opts.cookie;
	}

	return {
		url,
		headers,
		typeFilter: /^(text\/html|application\/xhtml\+xml)/,
		followRedirects: opts?.followRedirects,
		responseTimeout: opts?.responseTimeout,
		operationTimeout: opts?.operationTimeout,
		contentLengthLimit: opts?.contentLengthLimit,
		contentLengthRequired: opts?.contentLengthRequired,
		checkRobots: opts?.checkRobots || true,
	};
}

export async function scpaping(
	url: string,
	opts?: GeneralScrapingOptions,
) {
	const args = getFetchOptions(url, opts);

	const response = await sendRequest({
		...args,
		method: 'GET',
	});

	const rawBuffer = await response.arrayBuffer();
	const rawBody = Buffer.from(rawBuffer);
	const encoding = detectEncoding(rawBody);
	const body = toUtf8(rawBody, encoding);
	const $ = cheerio.load(body);

	return {
		body,
		$,
		response,
	};
}

type GetOptions = Pick<FetchOptions, 'checkRobots' | 'ignoreErrorStatus'> & GeneralScrapingOptions;

export async function get(url: string, opts?: GetOptions) {
	const args = getFetchOptions(url, opts);
	const res = await sendRequest({
		...args,
		method: 'GET',
		headers: {
			...args.headers,
			'accept': '*/*',
		},
		checkRobots: opts?.checkRobots,
		ignoreErrorStatus: opts?.ignoreErrorStatus,
	});

	return res.text();
}

export async function head(url: string, opts?: GeneralScrapingOptions) {
	const args = getFetchOptions(url, opts);
	return await sendRequest({
		...args,
		method: 'HEAD',
		headers: {
			...args.headers,
			'accept': 'text/html,application/xhtml+xml',
		},
	});
}

export async function sendRequest(args: FetchOptions) {
	if (args.checkRobots !== false) {
		const userAgent = 'SummalyBot'; // (args.headers as Record<string, string>)['user-agent'] ?? DEFAULT_BOT_UA
		log(`Checking robots.txt for ${args.url} with User-agent: ${userAgent}`);
		const allowed = await robotsManager.isAllowed(args.url, userAgent);
		log(`Robots.txt check result for ${args.url}: ${allowed ? 'Allowed' : 'Disallowed'}`);
		if (!allowed) {
			throw new StatusError('Forbidden by robots.txt', 403, 'Forbidden');
		}
	}

	const operationTimeout = args.operationTimeout ?? DEFAULT_OPERATION_TIMEOUT;

	const controller = new AbortController();

	const timeout = setTimeout(() => controller.abort(), operationTimeout);

	const allowPrivateIp = process.env.SUMMALY_ALLOW_PRIVATE_IP === 'true';

	const agent = new Agent({

		connect: {

			rejectUnauthorized: allowPrivateIp,

		},

	});

	const res = await fetch(args.url, {

		method: args.method,

		headers: args.headers as Record<string, string>,

		body: args.body,

		redirect: args.followRedirects ? 'follow' : 'manual',

		signal: controller.signal,

		dispatcher: agent,

	}).catch(e => {
		if (e.name === 'AbortError') {
			throw new StatusError('Operation timed out', 408, 'Request Timeout');
		}

		throw e;
	}).finally(() => {
		clearTimeout(timeout);
	});

	if (!res.ok && !args.ignoreErrorStatus?.includes(res.status)) {
		throw new StatusError(`${res.status} ${res.statusText}`, res.status, res.statusText);
	}

	// Check html

	const contentType = res.headers.get('content-type');

	if (args.typeFilter && !contentType?.match(args.typeFilter)) {
		throw new Error(`Rejected by type filter ${contentType}`);
	}

	const contentLength = res.headers.get('content-length');

	const maxSize = args.contentLengthLimit ?? DEFAULT_MAX_RESPONSE_SIZE;

	if (contentLength) {
		const size = Number(contentLength);

		if (size > maxSize) {
			throw new Error(`maxSize exceeded (${size} > ${maxSize}) on response`);
		}
	} else {
		if (args.contentLengthRequired) {
			throw new Error('content-length required');
		}
	}

	const body = await res.arrayBuffer();

	if (body.byteLength > maxSize) {
		throw new Error(`maxSize exceeded (${body.byteLength} > ${maxSize}) on response`);
	}

	const newRes = new Response(body, {

		status: res.status,

		statusText: res.statusText,

		headers: res.headers,

	});

	Object.defineProperty(newRes, 'rawBody', {

		value: Buffer.from(body),

		enumerable: true,

	});

	return newRes;
}
