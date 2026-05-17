import {
	CancelJob,
	ClearCompleted,
	ClearCompletedFor,
	GetJob,
	JobLogs,
	ListJobs,
	StartJob,
} from "../wailsjs/wailsjs/go/job/Service"
import { EventsOn } from "../wailsjs/wailsjs/runtime/runtime"
import { job as jobNs } from "../wailsjs/wailsjs/go/models"

export type Job = jobNs.Job
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type JobKind =
	| "generate"
	| "analyze"
	| "render"
	| "render-main"
	| "render-sku"
	| "render-detail"
	| "dry-run"

export const JOB_EVENT = "job:update"

export const jobClient = {
	start(kind: JobKind, productId: string, options: Record<string, unknown> = {}): Promise<Job> {
		return StartJob(kind, productId, options) as Promise<Job>
	},
	get(jobId: string): Promise<Job> {
		return GetJob(jobId) as Promise<Job>
	},
	list(): Promise<Job[]> {
		return ListJobs() as Promise<Job[]>
	},
	logs(jobId: string): Promise<string> {
		return JobLogs(jobId)
	},
	cancel(jobId: string): Promise<void> {
		return CancelJob(jobId)
	},
	clearCompleted(): Promise<number> {
		return ClearCompleted()
	},
	clearCompletedFor(productId: string): Promise<number> {
		return ClearCompletedFor(productId)
	},
	onUpdate(handler: (job: Job) => void): () => void {
		return EventsOn(JOB_EVENT, handler as (...args: unknown[]) => void)
	},
}
