import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("frames")
@Index(["agent_id", "created_at"])
export class FrameEntity {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column()
	@Index()
	agent_id!: string;

	/** Absolute path to the frame file on disk */
	@Column()
	path!: string;

	/** MIME type: image/jpeg, image/png, etc. */
	@Column({ default: "image/jpeg" })
	content_type!: string;

	/** Sequence number within the session */
	@Column({ default: 0 })
	seq!: number;

	@CreateDateColumn()
	created_at!: Date;
}
