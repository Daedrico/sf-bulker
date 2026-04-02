import https from 'https'
import { readFileSync } from 'fs'
import { EventEmitter } from 'events'

const TERMINAL_STATES = new Set(['JobComplete', 'Failed', 'Aborted'])
const POLL_INTERVAL_MS = 5000

/**
 * Singleton event emitter. Listen to 'monitoring' events to track job state updates.
 * @example
 * MonitorJob.on('monitoring', (job) => console.log(job.state))
 */
const MonitorJob = new EventEmitter()

class BulkAPI {
  /**
   * @param {{ accessToken: string, apiVersion: string, instanceUrl: string }} options
   */
  constructor({ accessToken, apiVersion, instanceUrl }) {
    this.accessToken = accessToken
    this.hostname = new URL(instanceUrl).hostname
    this.basePath = `/services/data/v${apiVersion}/jobs/ingest`
  }

  /**
   * Low-level HTTPS request helper.
   * @param {string} method
   * @param {string} path
   * @param {{ body?: any, contentType?: string }} [opts]
   * @returns {Promise<any>}
   */
  _request(method, path, { body, contentType = 'application/json' } = {}) {
    return new Promise((resolve, reject) => {
      let bodyBuffer = null
      if (body !== undefined && body !== null) {
        bodyBuffer = Buffer.isBuffer(body) || typeof body === 'string'
          ? Buffer.from(body)
          : Buffer.from(JSON.stringify(body))
      }

      const headers = {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': contentType
      }
      if (bodyBuffer) {
        headers['Content-Length'] = bodyBuffer.byteLength
      }

      const req = https.request({ hostname: this.hostname, path, method, headers }, (res) => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString()
          if (res.statusCode >= 400) {
            reject(new Error(`Bulk API [${res.statusCode}] ${method} ${path}: ${raw}`))
            return
          }
          const ct = res.headers['content-type'] ?? ''
          try {
            resolve(ct.includes('application/json') ? JSON.parse(raw) : raw)
          } catch {
            resolve(raw)
          }
        })
      })

      req.on('error', reject)
      if (bodyBuffer) req.write(bodyBuffer)
      req.end()
    })
  }

  // ─── Individual API calls ────────────────────────────────────────────────

  /**
   * Creates a new ingest job.
   * @param {{ object: string, contentType: string, operation: string, externalIdFieldName?: string, lineEnding?: string }} jobRequest
   * @returns {Promise<object>} Job record
   */
  createJob(jobRequest) {
    return this._request('POST', this.basePath, { body: jobRequest })
  }

  /**
   * Uploads CSV data for a job.
   * @param {string} jobId
   * @param {Buffer|string} csvContent
   */
  uploadData(jobId, csvContent) {
    return this._request('PUT', `${this.basePath}/${jobId}/batches`, {
      body: csvContent,
      contentType: 'text/csv'
    })
  }

  /**
   * Marks the job upload as complete, triggering processing.
   * @param {string} jobId
   * @returns {Promise<object>} Updated job record
   */
  closeJob(jobId) {
    return this._request('PATCH', `${this.basePath}/${jobId}`, {
      body: { state: 'UploadComplete' }
    })
  }

  /**
   * Aborts a job.
   * @param {string} jobId
   */
  abortJob(jobId) {
    return this._request('PATCH', `${this.basePath}/${jobId}`, {
      body: { state: 'Aborted' }
    })
  }

  /**
   * Deletes a job.
   * @param {string} jobId
   */
  deleteJob(jobId) {
    return this._request('DELETE', `${this.basePath}/${jobId}`)
  }

  /**
   * Returns the current status of a job.
   * @param {string} jobId
   * @returns {Promise<object>}
   */
  getJobStatus(jobId) {
    return this._request('GET', `${this.basePath}/${jobId}`)
  }

  /**
   * Returns successful results CSV for a completed job.
   * @param {string} jobId
   * @returns {Promise<string>} CSV string
   */
  getJobSuccesfulResults(jobId) {
    return this._request('GET', `${this.basePath}/${jobId}/successfulResults`)
  }

  /**
   * Returns failed results CSV for a completed job.
   * @param {string} jobId
   * @returns {Promise<string>} CSV string
   */
  getJobFailedResults(jobId) {
    return this._request('GET', `${this.basePath}/${jobId}/failedResults`)
  }

  /**
   * Returns unprocessed records CSV for a job.
   * @param {string} jobId
   * @returns {Promise<string>} CSV string
   */
  getJobUnprocessedRecords(jobId) {
    return this._request('GET', `${this.basePath}/${jobId}/unprocessedrecords`)
  }

  // ─── High-level helpers ──────────────────────────────────────────────────

  /**
   * Creates a job, uploads CSV from file, closes the job and returns the job record.
   * @param {object} jobRequest
   * @param {string} sourceFile Path to the CSV file to upload
   * @returns {Promise<object>} Job record after UploadComplete
   */
  async createAndWaitJobResult(jobRequest, sourceFile) {
    const job = await this.createJob(jobRequest)
    const csv = readFileSync(sourceFile)
    await this.uploadData(job.id, csv)
    return this.closeJob(job.id)
  }

  /**
   * Polls job status until a terminal state is reached.
   * Emits 'monitoring' on MonitorJob at each poll.
   * @param {string} jobId
   * @returns {Promise<'JobComplete'|'Failed'|'Aborted'>}
   */
  async waitJobEnd(jobId) {
    while (true) {
      const job = await this.getJobStatus(jobId)
      MonitorJob.emit('monitoring', job)
      if (TERMINAL_STATES.has(job.state)) return job.state
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
}

export { BulkAPI, MonitorJob }
