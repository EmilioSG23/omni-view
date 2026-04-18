import {
	Column,
	CreateDateColumn,
	Entity,
	OneToMany,
	PrimaryColumn,
	UpdateDateColumn,
} from "typeorm";
import { WhitelistEntity } from "./whitelist.entity";

@Entity("agents")
export class AgentEntity {
	@PrimaryColumn()
	agent_id!: string;

	@Column({ nullable: true, type: "text" })
	label!: string | null;

	@Column()
	version!: string;

	@CreateDateColumn()
	registered_at!: Date;

	@UpdateDateColumn()
	last_seen_at!: Date;

	@OneToMany(() => WhitelistEntity, (w: WhitelistEntity) => w.agent, { cascade: true })
	whitelist!: WhitelistEntity[];
}
