import robotsParser, { type Robot } from 'robots-parser';
import { get } from '@/utils/http.js';

class RobotsManager {
	private cache = new Map<string, Robot | null>();
	private fetching = new Map<string, Promise<Robot | null>>();

	public async isAllowed(url: string, userAgent: string): Promise<boolean> {
		const urlObj = new URL(url);
		const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

		let robots: Robot | null;

		if (this.cache.has(robotsUrl)) {
			robots = this.cache.get(robotsUrl) ?? null;
		} else if (this.fetching.has(robotsUrl)) {
			robots = await this.fetching.get(robotsUrl) ?? null;
		} else {
			const fetchPromise = this.fetchAndParse(robotsUrl);
			this.fetching.set(robotsUrl, fetchPromise);
			robots = await fetchPromise;
			this.cache.set(robotsUrl, robots);
			this.fetching.delete(robotsUrl);
		}

		if (!robots) {
			return true;
		}

		return robots.isAllowed(url, userAgent) ?? true;
	}

	private async fetchAndParse(robotsUrl: string): Promise<Robot | null> {
		try {
			const robotsTxt = await get(robotsUrl, { checkRobots: false });
			return robotsParser(robotsUrl, robotsTxt);
		} catch (_) {
			return null;
		}
	}
}

export const robotsManager = new RobotsManager();
