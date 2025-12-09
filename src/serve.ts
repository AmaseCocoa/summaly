import { serve } from '@hono/node-server';
import CreateApp from '@/index.js';

const app = CreateApp();

serve({
	fetch: app.fetch,
	port: 3001,
}, (info) => {
	console.log(`Server is running on http://localhost:${info.port}`);
});
