import * as amazon from './amazon.js';
import * as bluesky from './bluesky.js';
import * as wikipedia from './wikipedia.js';
import * as branchIoDeeplinks from './branchio-deeplinks.js';
import * as skeb from './skeb.js';
import { SummalyPlugin } from '@/iplugin.js';

export const plugins: SummalyPlugin[] = [
	amazon,
	bluesky,
	wikipedia,
	branchIoDeeplinks,
	skeb,
];
