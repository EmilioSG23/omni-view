import { AgentEntity } from "@/agents/agent.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity("blacklist")
export class BlacklistEntity {
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

	@ManyToOne(() => AgentEntity, (a) => a.blacklist, { onDelete: "CASCADE" })
	agent!: AgentEntity;
}
