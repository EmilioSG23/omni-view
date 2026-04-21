import { isEnv } from "@/common/utils/env";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleAsyncOptions } from "@nestjs/typeorm";

export const databaseConfig: TypeOrmModuleAsyncOptions = {
	inject: [ConfigService],
	useFactory: (config: ConfigService) => {
		if (isEnv("production")) {
			return {
				type: "postgres",
				url: config.get<string>("DATABASE_URL"),
				autoLoadEntities: true,
				synchronize: false,
				ssl: {
					rejectUnauthorized: false,
				},
			};
		}

		return {
			type: "better-sqlite3",
			database: config.get<string>("DB_PATH", "omniview.db"),
			autoLoadEntities: true,
			synchronize: true,
		};
	},
};
