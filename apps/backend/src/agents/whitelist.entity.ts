import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { AgentEntity } from "./agent.entity";

@Entity("whitelist")
export class WhitelistEntity {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column()
	agent_id!: string;

	@Column()
	device_id!: string;

	@Column({ nullable: true, type: "text" })
	label!: string | null;

	@CreateDateColumn()
	created_at!: Date;

	@ManyToOne(() => AgentEntity, (a) => a.whitelist, { onDelete: "CASCADE" })
	agent!: AgentEntity;
}
