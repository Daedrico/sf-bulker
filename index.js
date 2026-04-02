import { BulkAPI, MonitorJob } from 'client-sf-bulk2'
import { SF_PassConnect } from 'client-sf-oauth'
import { writeFile, mkdir } from 'fs/promises'

const fileName = process.argv[2]
const objectName = process.argv[3]
const externalIdField = process.argv[4]

if (!fileName || !objectName || !externalIdField) {
  console.error('Usage: npm run import -- <nome-file> <object> <externalIdField>')
  process.exit(1)
}

console.log(`File name: ${fileName}`)
console.log(`Object: ${objectName}`)
console.log(`External ID field: ${externalIdField}`)

async function importData() {
  const connection = new SF_PassConnect({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    host: process.env.URL
  })

  try {
    const result = await connection.requestAccessToken()

    const bulkAPI = new BulkAPI({
      accessToken: result.data.access_token,
      apiVersion: '64.0',
      instanceUrl: result.data.instance_url
    })

    const jobRequest = {
      'object': objectName,
      'operation': 'upsert',
      'externalIdFieldName': externalIdField
    }
    const response = await bulkAPI.createAndWaitJobResult(jobRequest, `./source/${fileName}`)
    console.log(response)

    // Use the MonitorJob Event Emitter to get the status of the job
    MonitorJob.on('monitoring', (state) => {
      //Do something with the job state
      console.log(state)
    })

    const finalStateJob = await bulkAPI.waitJobEnd(response.id)

    if (finalStateJob === 'JobComplete') {
      const successfulRecords = await bulkAPI.getJobSuccesfulResults(response.id)
      const failedRecords = await bulkAPI.getJobFailedResults(response.id)
      const baseName = fileName.replace(/\.[^.]+$/, '')
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
      await mkdir('./output', { recursive: true })
      await writeFile(`./output/${baseName}_success_${timestamp}.csv`, successfulRecords)
      await writeFile(`./output/${baseName}_failed_${timestamp}.csv`, failedRecords)
      console.log(`Results saved to output/${baseName}_*_${timestamp}.csv`)
    }
  } catch (e) {
    console.log(e)
  }
}

importData()