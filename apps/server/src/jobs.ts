import { randomUUID } from "node:crypto";
import { runRender, type RenderRuntime, type RunRenderInput } from "./render-pipeline.js";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobRecord {
  id: string;
  status: JobStatus;
  format: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  renderId?: string;
  durationMs?: number;
}

interface JobOutput {
  content: Buffer | string;
  mimeType: string;
  extension: string;
}

const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * In-memory async job queue (spec section 43). A production deployment
 * would back this with a real queue (BullMQ/etc) and object storage for
 * output, but the contract (queued -> running -> completed/failed/cancelled,
 * with expiration) is the same -- this is deliberately swappable behind the
 * same two methods a route handler needs: enqueue() and get().
 */
export class JobStore {
  private jobs = new Map<string, JobRecord>();
  private outputs = new Map<string, JobOutput>();
  private cancelled = new Set<string>();
  private sweepTimer: NodeJS.Timeout;

  constructor(private readonly runtime?: RenderRuntime) {
    this.sweepTimer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweepTimer.unref();
  }

  enqueue(input: RunRenderInput): JobRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: JobRecord = { id, status: "queued", format: input.format, createdAt: now, updatedAt: now };
    this.jobs.set(id, job);

    setImmediate(() => void this.run(id, input));
    return job;
  }

  private async run(id: string, input: RunRenderInput): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || this.cancelled.has(id)) return;

    job.status = "running";
    job.updatedAt = new Date().toISOString();

    try {
      const { result, renderId, durationMs } = await runRender(input, this.runtime);
      if (this.cancelled.has(id)) return;
      this.outputs.set(id, { content: result.content, mimeType: result.mimeType, extension: result.extension });
      job.status = "completed";
      job.renderId = renderId;
      job.durationMs = durationMs;
    } catch (err) {
      if (this.cancelled.has(id)) return;
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      job.updatedAt = new Date().toISOString();
    }
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  getOutput(id: string): JobOutput | undefined {
    return this.outputs.get(id);
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status === "completed" || job.status === "failed") return false;
    this.cancelled.add(id);
    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    return true;
  }

  private sweep(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (new Date(job.updatedAt).getTime() < cutoff && (job.status === "completed" || job.status === "failed" || job.status === "cancelled")) {
        this.jobs.delete(id);
        this.outputs.delete(id);
        this.cancelled.delete(id);
      }
    }
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
  }
}
