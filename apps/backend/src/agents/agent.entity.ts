import {
	Column,
	CreateDateColumn,
	Entity,
	OneToMany,
	PrimaryColumn,
	UpdateDateColumn,
} from "typeorm";
import { BlacklistEntity } from "./blacklist.entity";
import { WhitelistEntity } from "./whitelist.entity";

@Entity("agents")
export class AgentEntity {
	@PrimaryColumn()
	agent_id!: string;

	@Column({ nullable: true, type: "text" })
	label!: string | null;

	@Column()
	version!: string;

	/** WebSocket URL where the agent is reachable (e.g. ws://192.168.1.5:9000) */
	@Column({ nullable: true, type: "text" })
	ws_url!: string | null;

	/** SHA-256 hex hash of the agent's current session password */
	@Column({ nullable: true, type: "text" })
	password_hash!: string | null;

	/** Capture mode: 'native' (Rust agent) or 'browser' (getDisplayMedia + WebRTC). */
	@Column({ nullable: true, type: "text" })
	capture_mode!: string | null;

	@CreateDateColumn()
	registered_at!: Date;

	@UpdateDateColumn()
	last_seen_at!: Date;

	@OneToMany(() => WhitelistEntity, (w: WhitelistEntity) => w.agent, { cascade: true })
	whitelist!: WhitelistEntity[];

	@OneToMany(() => BlacklistEntity, (b: BlacklistEntity) => b.agent, { cascade: true })
	blacklist!: BlacklistEntity[];
}
