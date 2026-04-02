import jsforce from 'jsforce'
import { BulkAPI } from 'client-sf-bulk2'

const fileName = process.argv[2]

if (!fileName) {
  console.error('Usage: npm run import -- <nome-file>')
  process.exit(1)
}

console.log(`File ricevuto: ${fileName}`)

async function importData() {
  const conn = new jsforce.Connection({})
  await conn.login(process.env.USERNAME, process.env.PASSWORD)
  const bulkParameters = {
    accessToken: conn.accessToken,
    apiVersion: '55.0',
    instanceUrl: conn.instanceUrl
  }
  try {
    const bulkAPI = new BulkAPI(bulkParameters)
    const jobRequest = {
      'object': 'Account',
      'operation': 'insert'
    }
    const response = await bulkAPI.createAndWaitJobResult(jobRequest, './account.csv')
    console.log(response)
  } catch (e) {
    console.log(e)
  }
}

importData()