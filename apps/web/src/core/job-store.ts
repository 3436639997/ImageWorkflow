import { useEffect, useSyncExternalStore } from "react"

import { jobClient, type Job } from "./job-client"
import { message } from "../shared/message"

type State = {
	jobs: Job[]
	loaded: boolean
}

const KIND_LABEL: Record<string, string> = {
	generate: "分析并生图",
	analyze: "仅分析",
	render: "按计划生图",
	"render-main": "仅主图",
	"render-sku": "仅 SKU",
	"render-detail": "仅细节图",
	"dry-run": "试运行",
}

const listeners = new Set<() => void>()
let state: State = { jobs: [], loaded: false }

function emit() {
	for (const listener of listeners) listener()
}

function setState(next: State) {
	state = next
	emit()
}

function upsertJob(jobs: Job[], job: Job): Job[] {
	const idx = jobs.findIndex((j) => j.job_id === job.job_id)
	if (idx === -1) {
		return [job, ...jobs]
	}
	const next = [...jobs]
	next[idx] = job
	return next
}

function notifyOnTerminal(prev: Job | undefined, next: Job) {
	// Only notify when status crosses from non-terminal → terminal in this update.
	const terminal = ["succeeded", "failed", "cancelled"]
	if (!terminal.includes(next.status)) return
	if (prev && terminal.includes(prev.status)) return // already notified
	const label = `${KIND_LABEL[next.kind] ?? next.kind} (${next.product_id || "-"})`
	switch (next.status) {
		case "succeeded":
			message.success(`任务已完成：${label}`)
			break
		case "failed":
			message.error(`任务失败：${label}${next.error ? "\n" + next.error : ""}`)
			break
		case "cancelled":
			message.info(`任务已取消：${label}`)
			break
	}
}

let initialised = false
let unsubscribeWails: (() => void) | null = null

async function ensureInitialised() {
	if (initialised) return
	initialised = true
	try {
		const data = await jobClient.list()
		setState({ jobs: data, loaded: true })
	} catch (err) {
		console.error("load jobs failed", err)
		setState({ jobs: [], loaded: true })
	}
	unsubscribeWails = jobClient.onUpdate((job) => {
		const prev = state.jobs.find((j) => j.job_id === job.job_id)
		notifyOnTerminal(prev, job)
		setState({ jobs: upsertJob(state.jobs, job), loaded: true })
	})
}

export const jobStore = {
	subscribe(listener: () => void) {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	},
	getState() {
		return state
	},
	async refresh() {
		const data = await jobClient.list()
		setState({ jobs: data, loaded: true })
	},
	dispose() {
		if (unsubscribeWails) {
			unsubscribeWails()
			unsubscribeWails = null
		}
		initialised = false
		setState({ jobs: [], loaded: false })
	},
}

export function useJobStore() {
	useEffect(() => {
		void ensureInitialised()
	}, [])
	return useSyncExternalStore(jobStore.subscribe, jobStore.getState, jobStore.getState)
}
