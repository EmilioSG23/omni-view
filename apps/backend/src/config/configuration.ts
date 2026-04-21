export default () => ({
	port: parseInt(process.env.PORT ?? "3000", 10),
	database: {
		path: process.env.DB_PATH ?? "omniview.db",
	},
	rateLimit: {
		windowMs: 60 * 1000,
		max: 50,
	},
});
