import logger from "@/common/custom-logger.service";

beforeAll(() => {
	jest.spyOn(logger, "log").mockImplementation(() => {});
	jest.spyOn(logger, "info").mockImplementation(() => {});
	jest.spyOn(logger, "warn").mockImplementation(() => {});
	jest.spyOn(logger, "error").mockImplementation(() => {});
	jest.spyOn(logger, "debug").mockImplementation(() => {});
	jest.spyOn(logger, "verbose").mockImplementation(() => {});
});

afterAll(() => {
	(logger.log as unknown as jest.Mock)?.mockRestore?.();
	(logger.info as unknown as jest.Mock)?.mockRestore?.();
	(logger.warn as unknown as jest.Mock)?.mockRestore?.();
	(logger.error as unknown as jest.Mock)?.mockRestore?.();
	(logger.debug as unknown as jest.Mock)?.mockRestore?.();
	(logger.verbose as unknown as jest.Mock)?.mockRestore?.();
});
