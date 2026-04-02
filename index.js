const { BulkAPI, MonitorJob } = require('client-sf-bulk2')
const { getAccessToken } = require('./src/sf-oauth')
const { readFile, writeFile, mkdir } = require('fs/promises')
const { parse } = require('csv-parse/sync')
const { stringify } = require('csv-stringify/sync')
require('dotenv').config()

const applyMapping = (csvContent, mapping) => {
  const rows = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true })
  const mapped = rows.map(row => {
    const out = {}
    for (const [src, dest] of Object.entries(mapping)) {
      if (src in row) out[dest] = row[src]
    }
    return out
  })
  return stringify(mapped, { header: true })
}

const configName = process.argv[2]

if (!configName) {
  console.error('Usage: npm run import -- <name>')
  process.exit(1)
}

const importData = async () => {
  const configRaw = await readFile('./config.json', 'utf-8')
  const entries = JSON.parse(configRaw)

  const entry = entries.find(e => e.name === configName)
  if (!entry) {
    console.error(`No config entry found with name: "${configName}"`)
    process.exit(1)
  }

  const token = await getAccessToken({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    host: process.env.URL
  })

  const bulkAPI = new BulkAPI({
    accessToken: token.access_token,
    apiVersion: '64.0',
    instanceUrl: token.instance_url
  })

  MonitorJob.on('monitoring', (state) => {
    console.log(state)
  })

  const { filename, object, externalIdField, operation, mapping } = entry
  console.log(`\nProcessing: ${filename} | object: ${object} | operation: ${operation}`)

  let sourceFile = `./source/${filename}`

  if (mapping && Object.keys(mapping).length > 0) {
    const csvContent = await readFile(sourceFile, 'utf-8')
    const transformed = applyMapping(csvContent, mapping)
    sourceFile = `./source/.mapped_${filename}`
    await writeFile(sourceFile, transformed)
  }

  try {
    const jobRequest = {
      'object': object,
      'contentType': 'CSV',
      'operation': operation,
      'externalIdFieldName': externalIdField,
      'lineEnding': 'LF'
    }

    console.log(jobRequest)

    const response = await bulkAPI.createAndWaitJobResult(jobRequest, sourceFile)
    console.log(response)

    const finalStateJob = await bulkAPI.waitJobEnd(response.id)

    if (finalStateJob === 'JobComplete') {
      const successfulRecords = await bulkAPI.getJobSuccesfulResults(response.id)
      const failedRecords = await bulkAPI.getJobFailedResults(response.id)
      const baseName = filename.replace(/\.[^.]+$/, '')
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
      await mkdir('./output', { recursive: true })
      await writeFile(`./output/${baseName}_success_${timestamp}.csv`, successfulRecords)
      await writeFile(`./output/${baseName}_failed_${timestamp}.csv`, failedRecords)
      console.log(`Results saved to output/${baseName}_*_${timestamp}.csv`)
    }
  } catch (e) {
    console.error(`Error processing ${filename}:`, e)
  }
}

importData()